// ═══════════════════════════════════════════════════════════
// SHOGATSU · Web Push (notificações push de verdade, sem app nem custo)
// Implementa o protocolo padrão do navegador (RFC 8291 — criptografia aes128gcm,
// e RFC 8292 — autenticação VAPID) usando só o módulo "crypto" nativo do Node.
// Não depende de nenhum serviço pago nem de nenhuma biblioteca externa — os
// navegadores enviam a notificação através do serviço de push deles mesmos
// (Google, Mozilla, etc.), que é gratuito.
// ═══════════════════════════════════════════════════════════
const crypto = require('crypto');
const https = require('https');
const http = require('http');

function b64urlToBuf(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}
function bufToB64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// HKDF simplificado (só 1 bloco de saída, até 32 bytes — o suficiente pra tudo usado aqui).
function hkdf(salt, ikm, info, length) {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  const out = crypto.createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest();
  return out.slice(0, length);
}

// Gera um par de chaves VAPID novo (só precisa rodar 1x — o servidor guarda o resultado em config.json).
function generateVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pubJwk = publicKey.export({ format: 'jwk' });
  const privJwk = privateKey.export({ format: 'jwk' });
  return {
    publicKey: bufToB64url(Buffer.concat([Buffer.from([4]), b64urlToBuf(pubJwk.x), b64urlToBuf(pubJwk.y)])),
    privateKeyJwk: privJwk
  };
}

function signVapidJWT(audience, subject, vapid) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = { aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject };
  const unsigned = `${bufToB64url(Buffer.from(JSON.stringify(header)))}.${bufToB64url(Buffer.from(JSON.stringify(payload)))}`;
  const privateKey = crypto.createPrivateKey({ key: vapid.privateKeyJwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${bufToB64url(sig)}`;
}

// Criptografa o payload no formato que os navegadores esperam (aes128gcm / RFC 8291).
function encryptPayload(payloadBuf, p256dhB64, authB64) {
  const uaPublic = b64urlToBuf(p256dhB64);
  const authSecret = b64urlToBuf(authB64);

  const localECDH = crypto.createECDH('prime256v1');
  localECDH.generateKeys();
  const asPublic = localECDH.getPublicKey();
  const sharedSecret = localECDH.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, sharedSecret, keyInfo, 32);

  const salt = crypto.randomBytes(16);
  const prk2 = crypto.createHmac('sha256', salt).update(ikm).digest();
  const cek = crypto.createHmac('sha256', prk2).update(Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).digest().slice(0, 16);
  const nonce = crypto.createHmac('sha256', prk2).update(Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).digest().slice(0, 12);

  const padded = Buffer.concat([payloadBuf, Buffer.from([2])]); // delimitador de fim de registro (registro único, sem padding extra)
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encryptedRecord = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(65, 20);
  return Buffer.concat([header, asPublic, encryptedRecord]);
}

// Envia 1 notificação push pra 1 inscrição. Resolve sempre (nunca rejeita por erro HTTP) —
// quem chama decide o que fazer (ex: remover inscrições expiradas com status 404/410).
function sendWebPush(subscription, payloadObj, vapid, subject) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(subscription.endpoint);
      const audience = `${u.protocol}//${u.host}`;
      const jwt = signVapidJWT(audience, subject, vapid);
      const body = encryptPayload(Buffer.from(JSON.stringify(payloadObj)), subscription.keys.p256dh, subscription.keys.auth);
      const mod = u.protocol === 'http:' ? http : https;
      const req = mod.request(u, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Encoding': 'aes128gcm',
          'Content-Length': body.length,
          'TTL': '86400',
          'Authorization': `vapid t=${jwt}, k=${vapid.publicKey}`
        },
        timeout: 10000
      }, (res) => {
        let data = ''; res.on('data', c => data += c);
        res.on('end', () => resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          expired: res.statusCode === 404 || res.statusCode === 410,
          body: data
        }));
      });
      req.on('error', (e) => resolve({ ok: false, status: 0, expired: false, body: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, expired: false, body: 'timeout' }); });
      req.write(body);
      req.end();
    } catch (e) { resolve({ ok: false, status: 0, expired: false, body: e.message }); }
  });
}

module.exports = { generateVapidKeys, sendWebPush };
