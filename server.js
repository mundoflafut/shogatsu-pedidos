require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// ============ CONFIGURAÇÃO ============
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const RESTAURANT = {
  lat: parseFloat(process.env.RESTAURANT_LAT),
  lng: parseFloat(process.env.RESTAURANT_LNG),
  address: process.env.RESTAURANT_ADDRESS
};

// Cache em memória
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

// ============ ZONAS DE ENTREGA ============
const ZONES = [
  {
    id: 'zona_1',
    name: 'Bairro Próximo',
    radiusKm: 2,
    baseFee: 3.99,
    minimumOrderValue: 10.00,
    freeDeliveryThreshold: 40.00,
    estimatedTimeMin: 25,
    active: true
  },
  {
    id: 'zona_2',
    name: 'Região Central',
    radiusKm: 5,
    baseFee: null,
    minimumOrderValue: 20.00,
    freeDeliveryThreshold: 70.00,
    estimatedTimeMin: 40,
    active: true
  },
  {
    id: 'zona_3',
    name: 'Região Metropolitana',
    radiusKm: 10,
    baseFee: null,
    minimumOrderValue: 30.00,
    freeDeliveryThreshold: 100.00,
    estimatedTimeMin: 55,
    active: true
  }
];

const MAX_DELIVERY_KM = 10.0;

// ============ FUNÇÕES ============
function toRad(deg) { return deg * (Math.PI / 180); }

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findZone(lat, lng) {
  const sorted = [...ZONES].filter(z => z.active).sort((a, b) => a.radiusKm - b.radiusKm);
  for (const zone of sorted) {
    if (haversine(RESTAURANT.lat, RESTAURANT.lng, lat, lng) <= zone.radiusKm) return zone;
  }
  return null;
}

function generateCacheKey(lat, lng) {
  return `${Math.round(lat * 1000) / 1000}:${Math.round(lng * 1000) / 1000}`;
}

function getCached(lat, lng) {
  const key = generateCacheKey(lat, lng);
  const item = cache.get(key);
  if (item && Date.now() - item.time < CACHE_TTL) return item.data;
  cache.delete(key);
  return null;
}

function setCached(lat, lng, data) {
  cache.set(generateCacheKey(lat, lng), { data, time: Date.now() });
}

function calculateBaseFee(distanceKm, zone) {
  if (distanceKm > MAX_DELIVERY_KM) {
    return { fee: null, available: false, reason: 'DISTANCE_EXCEEDED' };
  }
  if (zone && zone.baseFee !== null) {
    return { fee: zone.baseFee, available: true, tier: zone.name };
  }
  const tiers = [
    { maxKm: 1.5, base: 3.00, perKm: 1.20 },
    { maxKm: 3.0, base: 4.50, perKm: 1.50 },
    { maxKm: 5.0, base: 6.00, perKm: 1.80 },
    { maxKm: 7.0, base: 8.00, perKm: 2.00 },
    { maxKm: 10.0, base: 10.00, perKm: 2.20 }
  ];
  const tier = tiers.find(t => distanceKm <= t.maxKm);
  if (!tier) return { fee: null, available: false, reason: 'NO_TIER' };
  const prev = tiers[tiers.indexOf(tier) - 1];
  const start = prev ? prev.maxKm : 0;
  const fee = tier.base + Math.max(0, distanceKm - start) * tier.perKm;
  return { fee: Math.round(fee * 100) / 100, available: true, tier: `até ${tier.maxKm}km` };
}

function applyRules(base, orderValue, zone) {
  let fee = base.fee;
  let freeDelivery = false;
  let adjustments = [];
  const minOrder = zone?.minimumOrderValue || 15.00;
  const freeThreshold = zone?.freeDeliveryThreshold || null;

  if (freeThreshold && orderValue >= freeThreshold) {
    fee = 0; freeDelivery = true;
    adjustments.push({ type: 'FREE_DELIVERY', description: `Pedido acima de R$ ${freeThreshold.toFixed(2)}` });
  }

  const serviceFee = 1.49;
  if (!freeDelivery) {
    fee += serviceFee;
    adjustments.push({ type: 'SERVICE_FEE', amount: serviceFee, description: 'Taxa de serviço' });
  }

  const now = new Date();
  const hour = now.getHours();
  const isPeak = (hour >= 11 && hour <= 14) || (hour >= 18 && hour <= 22);
  const isWeekend = [0, 6].includes(now.getDay());
  let surge = 1.0;
  if (isPeak && isWeekend) surge = 1.30;
  else if (isPeak) surge = 1.15;

  if (!freeDelivery && surge > 1.0) {
    fee *= surge;
    adjustments.push({ type: 'SURGE', multiplier: surge, description: 'Horário de pico' });
  }

  fee = Math.round(fee * 100) / 100;

  return {
    ...base,
    fee: freeDelivery ? 0 : fee,
    freeDelivery,
    serviceFee: freeDelivery ? 0 : serviceFee,
    surgeMultiplier: surge,
    minimumOrderValue: minOrder,
    meetsMinimum: orderValue >= minOrder,
    adjustments,
    available: base.available && (orderValue >= minOrder)
  };
}

// ============ ROTAS ============
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.post('/api/delivery/calculate', async (req, res) => {
  try {
    const { address, lat, lng, orderValue = 0 } = req.body;
    if (!address && (!lat || !lng)) {
      return res.status(400).json({ success: false, error: 'Forneça address ou lat/lng' });
    }

    let customer = { lat, lng, address };
    if (!lat || !lng) {
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=pt-BR&key=${GOOGLE_MAPS_API_KEY}`;
      const geoRes = await axios.get(geoUrl);
      if (geoRes.data.status !== 'OK' || !geoRes.data.results.length) {
        return res.status(400).json({ success: false, error: 'Endereço não encontrado' });
      }
      const loc = geoRes.data.results[0].geometry.location;
      customer = { lat: loc.lat, lng: loc.lng, address: geoRes.data.results[0].formatted_address };
    }

    const zone = findZone(customer.lat, customer.lng);
    if (!zone) {
      return res.json({
        success: true,
        available: false,
        reason: 'OUT_OF_ZONE',
        message: 'Não entregamos nessa região',
        customerLocation: customer
      });
    }

    const cached = getCached(customer.lat, customer.lng);
    if (cached && !orderValue) {
      return res.json({ success: true, cached: true, ...cached });
    }

    const dmUrl = 'https://maps.googleapis.com/maps/api/distancematrix/json';
    const dmRes = await axios.get(dmUrl, {
      params: {
        origins: `${RESTAURANT.lat},${RESTAURANT.lng}`,
        destinations: `${customer.lat},${customer.lng}`,
        mode: 'driving',
        departure_time: 'now',
        traffic_model: 'best_guess',
        language: 'pt-BR',
        key: GOOGLE_MAPS_API_KEY
      }
    });

    const element = dmRes.data.rows[0].elements[0];
    if (element.status !== 'OK') {
      return res.status(400).json({ success: false, error: 'Não foi possível calcular a rota' });
    }

    const distanceKm = element.distance.value / 1000;
    const durationMin = Math.ceil(element.duration.value / 60);
    const base = calculateBaseFee(distanceKm, zone);

    if (!base.available) {
      return res.json({
        success: true,
        available: false,
        reason: base.reason,
        distance: { km: parseFloat(distanceKm.toFixed(2)), text: element.distance.text },
        message: 'Distância excede o limite',
        customerLocation: customer
      });
    }

    const final = applyRules(base, orderValue, zone);

    const response = {
      success: true,
      available: final.available,
      distance: { km: parseFloat(distanceKm.toFixed(2)), text: element.distance.text },
      duration: { minutes: durationMin, text: element.duration.text },
      fee: { amount: final.fee, currency: 'BRL', formatted: `R$ ${final.fee.toFixed(2).replace('.', ',')}` },
      zone: { id: zone.id, name: zone.name, estimatedTimeMin: zone.estimatedTimeMin },
      rules: {
        minimumOrderValue: final.minimumOrderValue,
        freeDeliveryThreshold: zone.freeDeliveryThreshold,
        meetsMinimum: final.meetsMinimum,
        freeDelivery: final.freeDelivery
      },
      breakdown: {
        baseFee: base.fee,
        serviceFee: final.serviceFee,
        surgeMultiplier: final.surgeMultiplier,
        adjustments: final.adjustments
      },
      customerLocation: customer,
      restaurantLocation: RESTAURANT
    };

    setCached(customer.lat, customer.lng, {
      distance: response.distance,
      duration: response.duration,
      zone: response.zone,
      fee: response.fee,
      available: response.available
    });

    res.json(response);

  } catch (error) {
    console.error('Erro:', error.message);
    res.status(500).json({ success: false, error: 'Erro interno', message: error.message });
  }
});

app.get('/api/delivery/validate', async (req, res) => {
  try {
    const { address, lat, lng } = req.query;
    let location;
    if (lat && lng) {
      location = { lat: parseFloat(lat), lng: parseFloat(lng) };
    } else if (address) {
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=pt-BR&key=${GOOGLE_MAPS_API_KEY}`;
      const geoRes = await axios.get(geoUrl);
      if (geoRes.data.status !== 'OK') return res.json({ success: true, deliverable: false });
      const loc = geoRes.data.results[0].geometry.location;
      location = { lat: loc.lat, lng: loc.lng };
    } else {
      return res.status(400).json({ success: false, error: 'Forneça address ou lat/lng' });
    }
    const zone = findZone(location.lat, location.lng);
    res.json({ success: true, deliverable: !!zone, zone: zone ? { id: zone.id, name: zone.name } : null, location });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/delivery/zones', (req, res) => {
  res.json({ success: true, zones: ZONES.filter(z => z.active), restaurant: RESTAURANT });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API de Entrega rodando na porta ${PORT}`);
  console.log(`📍 Restaurante: ${RESTAURANT.address}`);
});
