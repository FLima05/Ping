const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');

const PORTA = process.env.PORT || 3000;
const perguntas = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));

const servidor = http.createServer(app);
const wss = new WebSocketServer({ server: servidor });

const hosts = new Set();
const jogadores = new Map(); // ws -> { nome, pontos, escolha, ganhou, entrouEm }

const jogo = {
  estado: 'aguardando', // aguardando | pergunta | resultado | fim
  indice: -1,
  abertaEm: 0
};

function perguntaAtual() {
  return perguntas[jogo.indice] || null;
}

// quem entrou com a pergunta ja aberta nao conta pra fechar a rodada
function elegiveis() {
  return [...jogadores.values()].filter((j) => j.entrouEm < jogo.abertaEm);
}

// metade do ponto vem por acertar, a outra metade cai conforme o tempo gasto
function pontuar(pergunta, ms) {
  const fracao = Math.min(ms / (pergunta.tempo * 1000), 1);
  return Math.round(1000 * (1 - fracao / 2));
}

function placar() {
  return [...jogadores.values()]
    .map((j) => ({ nome: j.nome, pontos: j.pontos }))
    .sort((a, b) => b.pontos - a.pontos);
}

function estadoHost() {
  const p = perguntaAtual();
  const naRodada =
    jogo.estado === 'pergunta' || jogo.estado === 'resultado' ? elegiveis() : [...jogadores.values()];
  return {
    estado: jogo.estado,
    numero: jogo.indice + 1,
    total: perguntas.length,
    enunciado: p ? p.enunciado : '',
    alternativas: p ? p.alternativas : [],
    correta: jogo.estado === 'resultado' && p ? p.correta : null,
    tempo: p ? p.tempo : 0,
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
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(dados));
}

function transmitir() {
  const paraHost = estadoHost();
  hosts.forEach((ws) => enviar(ws, paraHost));
  jogadores.forEach((j, ws) => enviar(ws, estadoJogador(j)));
}

function abrirPergunta() {
  jogo.indice += 1;
  if (jogo.indice >= perguntas.length) {
    jogo.estado = 'fim';
    transmitir();
    return;
  }
  jogadores.forEach((j) => {
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

wss.on('connection', (ws) => {
  ws.on('message', (bruto) => {
    let msg;
    try {
      msg = JSON.parse(bruto);
    } catch {
      return;
    }

    if (msg.tipo === 'entrar_host') {
      hosts.add(ws);
      enviar(ws, estadoHost());
      return;
    }

    if (msg.tipo === 'entrar_jogador') {
      const nome = String(msg.nome || '').trim().slice(0, 20) || 'sem nome';
      jogadores.set(ws, { nome, pontos: 0, escolha: null, ganhou: 0, entrouEm: Date.now() });
      transmitir();
      return;
    }

    if (msg.tipo === 'responder') {
      const j = jogadores.get(ws);
      const p = perguntaAtual();
      if (!j || !p || jogo.estado !== 'pergunta' || j.escolha !== null || j.entrouEm > jogo.abertaEm) return;
      const i = Number(msg.indice);
      if (!Number.isInteger(i) || i < 0 || i >= p.alternativas.length) return;
      j.escolha = i;
      if (i === p.correta) {
        j.ganhou = pontuar(p, Date.now() - jogo.abertaEm);
        j.pontos += j.ganhou;
      }
      const todosResponderam = elegiveis().every((x) => x.escolha !== null);
      if (todosResponderam) fecharPergunta();
      else transmitir();
      return;
    }

    if (msg.tipo === 'proxima' && hosts.has(ws)) {
      if (jogo.estado === 'pergunta') fecharPergunta();
      else if (jogo.estado !== 'fim') abrirPergunta();
    }
  });

  ws.on('close', () => {
    hosts.delete(ws);
    if (!jogadores.delete(ws)) return;
    // quem saiu pode ter sido o unico que faltava responder
    const restantes = elegiveis();
    if (jogo.estado === 'pergunta' && restantes.length > 0 && restantes.every((x) => x.escolha !== null)) {
      fecharPergunta();
    } else {
      transmitir();
    }
  });
});

servidor.listen(PORTA, () => {
  console.log('host:   http://localhost:' + PORTA + '/host');
  console.log('player: http://localhost:' + PORTA + '/play');
});