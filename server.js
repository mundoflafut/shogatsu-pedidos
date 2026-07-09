/**
 * =====================================================
 * SHOGATSU DELIVERY V2
 * Server.js
 * Parte 1
 * =====================================================
 */

const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs-extra");
const path = require("path");
const multer = require("multer");
const fileUpload = require("express-fileupload");
const { v4: uuid } = require("uuid");

const app = express();
const server = http.createServer(app);

const io = socketIO(server,{
    cors:{
        origin:"*",
        methods:["GET","POST"]
    }
});

const PORT = process.env.PORT || 3000;

app.use(cors());

app.use(bodyParser.json({
    limit:"20mb"
}));

app.use(bodyParser.urlencoded({
    extended:true
}));

app.use(fileUpload());

app.use(express.static(path.join(__dirname,"public")));

const DATA_DIR = path.join(__dirname,"data");

fs.ensureDirSync(DATA_DIR);

const FILES={

    pedidos:path.join(DATA_DIR,"pedidos.json"),

    produtos:path.join(DATA_DIR,"produtos.json"),

    clientes:path.join(DATA_DIR,"clientes.json"),

    config:path.join(DATA_DIR,"config.json")

};

const DEFAULT_CONFIG={

    empresa:"Shogatsu",

    pedidoInicial:500,

    ultimoPedido:500,

    tempoEntrega:40,

    impressaoAutomatica:false,

    imprimirCliente:true,

    imprimirCozinha:true,

    imprimirEntrega:true,

    viasExtras:0,

    logo:"/uploads/logo.png",

    larguraLogo:180,

    posicaoLogo:"center",

    som:true

};

function createIfNotExists(file,data){

    if(!fs.existsSync(file)){

        fs.writeJsonSync(file,data,{spaces:4});

    }

}

createIfNotExists(FILES.config,DEFAULT_CONFIG);

createIfNotExists(FILES.pedidos,[]);

createIfNotExists(FILES.produtos,[]);

createIfNotExists(FILES.clientes,[]);

function read(file){

    return fs.readJsonSync(file);

}

function save(file,data){

    fs.writeJsonSync(file,data,{spaces:4});

}

let CONFIG=read(FILES.config);

let PEDIDOS=read(FILES.pedidos);

let PRODUTOS=read(FILES.produtos);

let CLIENTES=read(FILES.clientes);

function atualizarArquivos(){

    save(FILES.config,CONFIG);

    save(FILES.pedidos,PEDIDOS);

    save(FILES.produtos,PRODUTOS);

    save(FILES.clientes,CLIENTES);

}

function novoNumeroPedido(){

    CONFIG.ultimoPedido++;

    atualizarArquivos();

    return CONFIG.ultimoPedido;

}

function agora(){

    return new Date().toISOString();

}

function emitirAtualizacao(){

    io.emit("pedidos",PEDIDOS);

    io.emit("dashboard",dashboard());

}

function dashboard(){

    let faturamento=0;

    let preparando=0;

    let entregues=0;

    PEDIDOS.forEach(p=>{

        faturamento+=Number(p.total||0);

        if(p.status==="PREPARANDO") preparando++;

        if(p.status==="ENTREGUE") entregues++;

    });

    return{

        pedidos:PEDIDOS.length,

        faturamento,

        ticket:

            PEDIDOS.length>0

            ?faturamento/PEDIDOS.length

            :0,

        preparando,

        entregues

    };

}
/* ======================================================
   API CONFIGURAÇÕES
====================================================== */

app.get("/api/config", (req, res) => {

    res.json(CONFIG);

});

app.post("/api/config", (req, res) => {

    CONFIG = {

        ...CONFIG,

        ...req.body

    };

    atualizarArquivos();

    io.emit("config", CONFIG);

    res.json({

        sucesso: true

    });

});


/* ======================================================
   DASHBOARD
====================================================== */

app.get("/api/dashboard", (req, res) => {

    res.json(

        dashboard()

    );

});


/* ======================================================
   LISTAR PEDIDOS
====================================================== */

app.get("/api/pedidos", (req, res) => {

    res.json(PEDIDOS);

});


/* ======================================================
   BUSCAR PEDIDO
====================================================== */

app.get("/api/pedidos/:numero", (req, res) => {

    const numero = Number(req.params.numero);

    const pedido = PEDIDOS.find(

        p => p.numero === numero

    );

    if (!pedido) {

        return res.status(404).json({

            erro: "Pedido não encontrado"

        });

    }

    res.json(pedido);

});


/* ======================================================
   NOVO PEDIDO
====================================================== */

app.post("/api/pedidos", (req, res) => {

    const pedido = {

        id: uuid(),

        numero: novoNumeroPedido(),

        data: agora(),

        cliente: req.body.cliente || {},

        itens: req.body.itens || [],

        pagamento: req.body.pagamento || "",

        observacao: req.body.observacao || "",

        entrega: req.body.entrega || "",

        telefone: req.body.telefone || "",

        endereco: req.body.endereco || "",

        total: Number(req.body.total || 0),

        status: "NOVO",

        inicio: Date.now(),

        tempoEntrega: CONFIG.tempoEntrega

    };

    PEDIDOS.unshift(pedido);

    atualizarArquivos();

    emitirAtualizacao();

    io.emit(

        "novo-pedido",

        pedido

    );

    res.json({

        sucesso: true,

        pedido

    });

});


/* ======================================================
   ALTERAR STATUS
====================================================== */

app.put("/api/pedidos/:numero/status", (req, res) => {

    const numero = Number(

        req.params.numero

    );

    const pedido = PEDIDOS.find(

        p => p.numero === numero

    );

    if (!pedido) {

        return res.status(404).json({

            erro: "Pedido não encontrado"

        });

    }

    pedido.status = req.body.status;

    pedido.atualizado = agora();

    atualizarArquivos();

    emitirAtualizacao();

    io.emit(

        "status",

        pedido

    );

    res.json({

        sucesso: true

    });

});


/* ======================================================
   REMOVER PEDIDO
====================================================== */

app.delete("/api/pedidos/:numero", (req, res) => {

    const numero = Number(

        req.params.numero

    );

    PEDIDOS = PEDIDOS.filter(

        p => p.numero !== numero

    );

    atualizarArquivos();

    emitirAtualizacao();

    res.json({

        sucesso: true

    });

});
/* ======================================================
   PRODUTOS
====================================================== */

app.get("/api/produtos", (req, res) => {

    res.json(PRODUTOS);

});

app.get("/api/produtos/:id", (req, res) => {

    const produto = PRODUTOS.find(

        p => p.id === req.params.id

    );

    if (!produto) {

        return res.status(404).json({

            erro: "Produto não encontrado"

        });

    }

    res.json(produto);

});

app.post("/api/produtos", (req, res) => {

    const produto = {

        id: uuid(),

        nome: req.body.nome || "",

        descricao: req.body.descricao || "",

        categoria: req.body.categoria || "",

        preco: Number(req.body.preco || 0),

        foto: req.body.foto || "",

        disponivel: true

    };

    PRODUTOS.push(produto);

    atualizarArquivos();

    io.emit("produtos", PRODUTOS);

    res.json(produto);

});

app.put("/api/produtos/:id", (req, res) => {

    const produto = PRODUTOS.find(

        p => p.id === req.params.id

    );

    if (!produto) {

        return res.status(404).json({

            erro: "Produto não encontrado"

        });

    }

    Object.assign(produto, req.body);

    atualizarArquivos();

    io.emit("produtos", PRODUTOS);

    res.json(produto);

});

app.delete("/api/produtos/:id", (req, res) => {

    PRODUTOS = PRODUTOS.filter(

        p => p.id !== req.params.id

    );

    atualizarArquivos();

    io.emit("produtos", PRODUTOS);

    res.json({

        sucesso: true

    });

});


/* ======================================================
   CLIENTES
====================================================== */

app.get("/api/clientes", (req, res) => {

    res.json(CLIENTES);

});

app.post("/api/clientes", (req, res) => {

    const cliente = {

        id: uuid(),

        nome: req.body.nome,

        telefone: req.body.telefone,

        endereco: req.body.endereco,

        criado: agora()

    };

    CLIENTES.push(cliente);

    atualizarArquivos();

    res.json(cliente);

});


/* ======================================================
   UPLOAD LOGOTIPO
====================================================== */

const uploadDir = path.join(

    __dirname,

    "public",

    "uploads"

);

fs.ensureDirSync(uploadDir);

const storage = multer.diskStorage({

    destination(req,file,cb){

        cb(null,uploadDir);

    },

    filename(req,file,cb){

        cb(

            null,

            "logo"+path.extname(file.originalname)

        );

    }

});

const upload = multer({

    storage

});

app.post(

    "/api/logo",

    upload.single("logo"),

    (req,res)=>{

        CONFIG.logo="/uploads/"+req.file.filename;

        atualizarArquivos();

        io.emit("config",CONFIG);

        res.json({

            sucesso:true,

            logo:CONFIG.logo

        });

    }

);


/* ======================================================
   IMPRESSÃO
====================================================== */

app.get(

    "/api/imprimir/:numero",

    (req,res)=>{

        const numero=Number(

            req.params.numero

        );

        const pedido=PEDIDOS.find(

            p=>p.numero===numero

        );

        if(!pedido){

            return res.status(404).json({

                erro:true

            });

        }

        res.json({

            imprimir:true,

            pedido

        });

    }

);


/* ======================================================
   BACKUP
====================================================== */

app.get(

    "/api/backup",

    (req,res)=>{

        res.json({

            config:CONFIG,

            pedidos:PEDIDOS,

            produtos:PRODUTOS,

            clientes:CLIENTES

        });

    }

);

app.post(

    "/api/restore",

    (req,res)=>{

        CONFIG=req.body.config;

        PEDIDOS=req.body.pedidos;

        PRODUTOS=req.body.produtos;

        CLIENTES=req.body.clientes;

        atualizarArquivos();

        emitirAtualizacao();

        res.json({

            sucesso:true

        });

    }

);
/* ======================================================
   WHATSAPP
====================================================== */

function gerarLinkWhatsApp(pedido, mensagem) {

    if (!pedido.telefone) return "";

    const numero = String(pedido.telefone)
        .replace(/\D/g, "");

    const texto = encodeURIComponent(mensagem);

    return `https://wa.me/55${numero}?text=${texto}`;

}

app.get("/api/whatsapp/:numero/:tipo", (req, res) => {

    const numeroPedido = Number(req.params.numero);

    const tipo = req.params.tipo;

    const pedido = PEDIDOS.find(p => p.numero === numeroPedido);

    if (!pedido) {

        return res.status(404).json({
            erro: true
        });

    }

    let mensagem = "";

    switch (tipo) {

        case "recebido":
            mensagem = `Olá ${pedido.cliente?.nome || ""}, seu pedido #${pedido.numero} foi recebido.`;
            break;

        case "preparo":
            mensagem = `Seu pedido #${pedido.numero} está em preparo.`;
            break;

        case "saida":
            mensagem = `Seu pedido #${pedido.numero} saiu para entrega.`;
            break;

        case "entregue":
            mensagem = `Seu pedido #${pedido.numero} foi entregue. Obrigado pela preferência.`;
            break;

        default:
            mensagem = `Pedido #${pedido.numero}`;
    }

    res.json({

        url: gerarLinkWhatsApp(

            pedido,

            mensagem

        )

    });

});


/* ======================================================
   CRONÔMETRO
====================================================== */

setInterval(() => {

    const agora = Date.now();

    PEDIDOS.forEach(pedido => {

        if (pedido.status === "ENTREGUE") return;

        const minutos = Math.floor(

            (agora - pedido.inicio) / 60000

        );

        pedido.minutos = minutos;

        if (minutos >= pedido.tempoEntrega) {

            pedido.atrasado = true;

        } else {

            pedido.atrasado = false;

        }

    });

    io.emit("cronometro", PEDIDOS);

}, 10000);


/* ======================================================
   SOCKET.IO
====================================================== */

io.on("connection", socket => {

    console.log(

        "Cliente conectado:",

        socket.id

    );

    socket.emit(

        "pedidos",

        PEDIDOS

    );

    socket.emit(

        "dashboard",

        dashboard()

    );

    socket.emit(

        "produtos",

        PRODUTOS

    );

    socket.emit(

        "config",

        CONFIG

    );

    socket.on("disconnect", () => {

        console.log(

            "Cliente desconectado"

        );

    });

});


/* ======================================================
   HEALTH CHECK
====================================================== */

app.get("/api/status", (req, res) => {

    res.json({

        sistema: "online",

        empresa: CONFIG.empresa,

        pedidos: PEDIDOS.length,

        produtos: PRODUTOS.length,

        clientes: CLIENTES.length,

        versao: "2.0.0",

        servidor: agora()

    });

});


/* ======================================================
   ROTA PADRÃO
====================================================== */

app.get("*", (req, res) => {

    res.sendFile(

        path.join(

            __dirname,

            "public",

            "index.html"

        )

    );

});


/* ======================================================
   INICIAR SERVIDOR
====================================================== */

server.listen(PORT, () => {

    console.log("");

    console.log("===================================");

    console.log(" SHOGATSU DELIVERY V2 ");

    console.log("===================================");

    console.log("Servidor iniciado");

    console.log("Porta:", PORT);

    console.log("Painel:");

    console.log(`http://localhost:${PORT}/painel.html`);

    console.log("Cozinha:");

    console.log(`http://localhost:${PORT}/cozinha.html`);

    console.log("Dashboard:");

    console.log(`http://localhost:${PORT}/dashboard.html`);

    console.log("===================================");

});


/* ======================================================
   TRATAMENTO DE ERROS
====================================================== */

process.on("uncaughtException", erro => {

    console.error(

        "Erro:",

        erro

    );

});

process.on("unhandledRejection", erro => {

    console.error(

        "Promise:",

        erro

    );

});
