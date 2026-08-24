const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');
const { WebSocketServer } = require('ws');

const PORTA = process.env.PORT || 3000;
const CHAVE = process.env.CHAVE_HOST || '';
const PASTA_QUIZZES = path.join(__dirname, 'quizzes');

// le a pasta uma vez no boot; so arquivo que esta nesse mapa pode ser escolhido depois
function carregarBancos() {
  const mapa = new Map();
  for (const arquivo of fs.readdirSync(PASTA_QUIZZES)) {
    if (!arquivo.endsWith('.json')) continue;
    const dados = JSON.parse(fs.readFileSync(path.join(PASTA_QUIZZES, arquivo), 'utf8'));
    if (!Array.isArray(dados.perguntas) || dados.perguntas.length === 0) continue;
    mapa.set(arquivo, { titulo: dados.titulo || arquivo, perguntas: dados.perguntas });
  }
  return mapa;
}

const bancos = carregarBancos();

const app = express();
app.set('trust proxy', 1); // Render fica atras de proxy, sem isso req.protocol vem http

// sem no-cache o celular fica com a tela da versao anterior depois do deploy
app.use(
  express.static(path.join(__dirname, 'public'), {
    etag: true,
    maxAge: 0,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
  })
);

app.get('/', (req, res) => res.redirect('/play'));

app.get('/host', (req, res) => {
  if (CHAVE && req.query.chave !== CHAVE) return res.status(403).send('chave do host invalida');
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));

app.get('/qr.svg', async (req, res) => {
  const url = req.protocol + '://' + req.get('host') + '/play';
  try {
    const svg = await QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      color: { dark: '#151a1f', light: '#f2eee6' }
    });
    res.type('image/svg+xml');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(svg);
  } catch (erro) {
    console.error(erro);
    res.status(500).send('erro ao gerar qr');
  }
});

const servidor = http.createServer(app);
const wss = new WebSocketServer({ server: servidor });

const hosts = new Set();
const jogadores = new Map(); // id -> { id, nome, pontos, pontosAntes, escolha, ganhou, entrouEm, ws }

const jogo = {
  estado: 'aguardando', // aguardando | pergunta | resultado | fim
  tema: null,
  indice: -1,
  abertaEm: 0
};

function banco() {
  return jogo.tema ? bancos.get(jogo.tema) : null;
}

function perguntas() {
  const b = banco();
  return b ? b.perguntas : [];
}

function perguntaAtual() {
  return perguntas()[jogo.indice] || null;
}

function online(j) {
  return j.ws && j.ws.readyState === j.ws.OPEN;
}

// so conta quem esta conectado agora e ja estava dentro quando a pergunta abriu
function elegiveis() {
  return [...jogadores.values()].filter((j) => online(j) && j.entrouEm < jogo.abertaEm);
}

// metade do ponto vem por acertar, a outra metade cai conforme o tempo gasto
function pontuar(pergunta, ms) {
  const fracao = Math.min(ms / (pergunta.tempo * 1000), 1);
  return Math.round(1000 * (1 - fracao / 2));
}

// leva a posicao anterior junto, e o que a tela do host usa pra animar a subida
function placar() {
  const lista = [...jogadores.values()];
  const ordemAntes = [...lista].sort((a, b) => b.pontosAntes - a.pontosAntes).map((j) => j.id);
  return lista
    .sort((a, b) => b.pontos - a.pontos)
    .map((j, i) => ({
      id: j.id,
      nome: j.nome,
      pontos: j.pontos,
      antes: j.pontosAntes,
      ganhou: j.ganhou,
      posicao: i + 1,
      posicaoAntes: ordemAntes.indexOf(j.id) + 1
    }));
}

function estadoHost() {
  const p = perguntaAtual();
  const naRodada =
    jogo.estado === 'pergunta' || jogo.estado === 'resultado'
      ? elegiveis()
      : [...jogadores.values()].filter(online);
  return {
    estado: jogo.estado,
    tema: jogo.tema,
    tituloTema: banco() ? banco().titulo : '',
    temas: [...bancos.entries()].map(([arquivo, b]) => ({
      arquivo,
      titulo: b.titulo,
      total: b.perguntas.length
    })),
    numero: jogo.indice + 1,
    total: perguntas().length,
    enunciado: p ? p.enunciado : '',
    alternativas: p ? p.alternativas : [],
    correta: jogo.estado === 'resultado' && p ? p.correta : null,
    respondidas: naRodada.filter((j) => j.escolha !== null).length,
    conectados: naRodada.length,
    placar: placar()
  };
}

function estadoJogador(j) {
  const p = perguntaAtual();
  return {
    estado: jogo.estado,
    nome: j.nome,
    alternativas: jogo.estado === 'pergunta' && p && j.entrouEm < jogo.abertaEm ? p.alternativas : [],
    escolha: j.escolha,
    acertou: jogo.estado === 'resultado' && p ? j.escolha === p.correta : null,
    ganhou: j.ganhou,
    pontos: j.pontos
  };
}

function enviar(ws, dados) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(dados));
}

function transmitir() {
  const paraHost = estadoHost();
  hosts.forEach((ws) => enviar(ws, paraHost));
  jogadores.forEach((j) => {
    if (online(j)) enviar(j.ws, estadoJogador(j));
  });
}

function abrirPergunta() {
  jogo.indice += 1;
  if (jogo.indice >= perguntas().length) {
    jogo.estado = 'fim';
    transmitir();
    return;
  }
  jogadores.forEach((j) => {
    j.pontosAntes = j.pontos; // guarda o valor de onde a animacao do placar sai
    j.escolha = null;
    j.ganhou = 0;
  });
  jogo.estado = 'pergunta';
  jogo.abertaEm = Date.now();
  transmitir();
}

function fecharPergunta() {
  jogo.estado = 'resultado';
  transmitir();
}

// volta pro comeco sem reiniciar o servico, e libera trocar de tema
function reiniciar() {
  jogo.estado = 'aguardando';
  jogo.tema = null;
  jogo.indice = -1;
  jogo.abertaEm = 0;
  jogadores.forEach((j) => {
    j.pontos = 0;
    j.pontosAntes = 0;
    j.escolha = null;
    j.ganhou = 0;
    j.entrouEm = Date.now();
  });
  transmitir();
}

function fecharSeTodosResponderam() {
  const dentro = elegiveis();
  if (jogo.estado === 'pergunta' && dentro.length > 0 && dentro.every((j) => j.escolha !== null)) {
    fecharPergunta();
  } else {
    transmitir();
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (bruto) => {
    let msg;
    try {
      msg = JSON.parse(bruto);
    } catch {
      return;
    }

    if (msg.tipo === 'ping') return; // so segura a conexao e o servico acordado

    if (msg.tipo === 'entrar_host') {
      if (CHAVE && msg.chave !== CHAVE) return;
      hosts.add(ws);
      enviar(ws, estadoHost());
      return;
    }

    if (msg.tipo === 'tema') {
      if (!hosts.has(ws) || jogo.estado !== 'aguardando') return;
      if (!bancos.has(msg.arquivo)) return;
      jogo.tema = msg.arquivo;
      transmitir();
      return;
    }

    if (msg.tipo === 'entrar_jogador') {
      const id = String(msg.id || '').slice(0, 40);
      if (!id) return;
      const nome = String(msg.nome || '').trim().slice(0, 20) || 'sem nome';
      const antigo = jogadores.get(id);
      if (antigo) {
        antigo.ws = ws; // voltou depois de cair, mantem pontos e resposta da rodada
        antigo.nome = nome;
      } else {
        jogadores.set(id, {
          id,
          nome,
          pontos: 0,
          pontosAntes: 0,
          escolha: null,
          ganhou: 0,
          entrouEm: Date.now(),
          ws
        });
      }
      ws.idJogador = id;
      transmitir();
      return;
    }

    if (msg.tipo === 'responder') {
      const j = jogadores.get(ws.idJogador);
      const p = perguntaAtual();
      if (!j || !p || jogo.estado !== 'pergunta' || j.escolha !== null || j.entrouEm > jogo.abertaEm) return;
      const i = Number(msg.indice);
      if (!Number.isInteger(i) || i < 0 || i >= p.alternativas.length) return;
      j.escolha = i;
      if (i === p.correta) {
        j.ganhou = pontuar(p, Date.now() - jogo.abertaEm);
        j.pontos += j.ganhou;
      }
      fecharSeTodosResponderam();
      return;
    }

    if (msg.tipo === 'proxima') {
      if (!hosts.has(ws)) return;
      if (jogo.estado === 'fim') reiniciar();
      else if (jogo.estado === 'pergunta') fecharPergunta();
      else if (jogo.estado === 'aguardando' && !jogo.tema) return;
      else abrirPergunta();
    }
  });

  ws.on('close', () => {
    hosts.delete(ws);
    const j = jogadores.get(ws.idJogador);
    if (!j) return;
    if (j.ws === ws) j.ws = null; // guarda os pontos ate ele voltar
    fecharSeTodosResponderam();
  });
});

// proxy corta conexao parada, entao manda quadro de ping de tempos em tempos
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.ping();
  });
}, 30000);

servidor.listen(PORTA, () => {
  console.log('host:   http://localhost:' + PORTA + '/host');
  console.log('player: http://localhost:' + PORTA + '/play');
});