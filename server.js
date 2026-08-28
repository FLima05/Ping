const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');
const { WebSocketServer } = require('ws');

const PORTA = process.env.PORT || 3000;
const CHAVE = process.env.CHAVE_HOST || '';
const PASTA_QUIZZES = path.join(__dirname, 'quizzes');
const PASTA_RELATORIOS = path.join(__dirname, 'relatorios');
const MULTIPLICADOR_MAXIMO = 2;

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

// pega o IP da maquina na rede local, ignorando adaptador virtual e link local
function ipLocal() {
  if (process.env.IP_LOCAL) return process.env.IP_LOCAL;
  const candidatos = [];
  const redes = os.networkInterfaces();
  for (const nome of Object.keys(redes)) {
    for (const info of redes[nome] || []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      if (info.address.startsWith('172.17.') || info.address.startsWith('169.254.')) continue;
      candidatos.push(info.address);
    }
  }
  return (
    candidatos.find((ip) => ip.startsWith('192.168.')) ||
    candidatos.find((ip) => ip.startsWith('10.')) ||
    candidatos[0] ||
    'localhost'
  );
}

// hospedado usa o dominio da requisicao; local troca localhost pelo IP da rede
function urlDeEntrada(req) {
  const host = req.get('host') || '';
  const ehLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  if (!ehLocal) return req.protocol + '://' + host + '/play';
  return 'http://' + ipLocal() + ':' + (host.split(':')[1] || PORTA) + '/play';
}

// nome do aluno vai pro projetor, entao tira emoji, simbolo solto e espaco repetido
function limparNome(bruto) {
  const limpo = String(bruto || '')
    .normalize('NFC')
    .replace(/[\p{Extended_Pictographic}\u200D\uFE0F\u20E3]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
  return limpo || 'sem nome';
}

let ultimoRelatorio = null; // { nome, csv }

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

app.get('/entrada.json', (req, res) => res.json({ url: urlDeEntrada(req) }));

app.get('/relatorio.csv', (req, res) => {
  if (CHAVE && req.query.chave !== CHAVE) return res.status(403).send('chave do host invalida');
  if (!ultimoRelatorio) return res.status(404).send('nenhuma partida terminada ainda');
  res.type('text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + ultimoRelatorio.nome + '"');
  res.send(ultimoRelatorio.csv);
});

app.get('/qr.svg', async (req, res) => {
  try {
    const svg = await QRCode.toString(urlDeEntrada(req), {
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
const jogadores = new Map(); // id -> jogador

const jogo = {
  estado: 'aguardando', // aguardando | pergunta | resultado | fim
  modo: 'individual', // individual | equipes
  equipes: [],
  tema: null,
  indice: -1,
  abertaEm: 0
};

function banco() {
  return jogo.tema ? bancos.get(jogo.tema) : null;
}

function perguntas() {
  const atual = banco();
  return atual ? atual.perguntas : [];
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

// base cai com o tempo gasto, sequencia multiplica ate 2x, pergunta marcada como dobro dobra tudo
function pontuar(pergunta, ms, sequencia) {
  const fracao = Math.min(ms / (pergunta.tempo * 1000), 1);
  const base = 1000 * (1 - fracao / 2);
  const multiplicador = Math.min(1 + 0.2 * sequencia, MULTIPLICADOR_MAXIMO);
  return Math.round(base * multiplicador * (pergunta.dobro ? 2 : 1));
}

function distribuicao() {
  const p = perguntaAtual();
  if (!p) return null;
  const contagem = p.alternativas.map(() => 0);
  elegiveis().forEach((j) => {
    if (j.escolha !== null) contagem[j.escolha] += 1;
  });
  return contagem;
}

function maisRapido() {
  const p = perguntaAtual();
  if (!p) return '';
  const certos = elegiveis()
    .filter((j) => j.escolha === p.correta)
    .sort((a, b) => a.respondeuEm - b.respondeuEm);
  return certos.length ? certos[0].nome : '';
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

function placarEquipes() {
  if (jogo.modo !== 'equipes') return [];
  return jogo.equipes
    .map((nome, i) => {
      const membros = [...jogadores.values()].filter((j) => j.equipe === i);
      return {
        nome,
        membros: membros.length,
        pontos: membros.reduce((soma, j) => soma + j.pontos, 0)
      };
    })
    .sort((a, b) => b.pontos - a.pontos);
}

function estadoHost() {
  const p = perguntaAtual();
  const naRodada =
    jogo.estado === 'pergunta' || jogo.estado === 'resultado'
      ? elegiveis()
      : [...jogadores.values()].filter(online);
  return {
    estado: jogo.estado,
    modo: jogo.modo,
    equipes: jogo.equipes,
    equipesPlacar: placarEquipes(),
    tema: jogo.tema,
    tituloTema: banco() ? banco().titulo : '',
    temas: [...bancos.entries()].map(([arquivo, b]) => ({
      arquivo,
      titulo: b.titulo,
      total: b.perguntas.length
    })),
    jogadores: [...jogadores.values()]
      .filter(online)
      .map((j) => ({ id: j.id, nome: j.nome, equipe: j.equipe })),
    numero: jogo.indice + 1,
    total: perguntas().length,
    enunciado: p ? p.enunciado : '',
    alternativas: p ? p.alternativas : [],
    correta: jogo.estado === 'resultado' && p ? p.correta : null,
    dobro: !!(p && p.dobro),
    distribuicao: jogo.estado === 'resultado' ? distribuicao() : null,
    maisRapido: jogo.estado === 'resultado' ? maisRapido() : '',
    respondidas: naRodada.filter((j) => j.escolha !== null).length,
    conectados: naRodada.length,
    relatorio: !!ultimoRelatorio,
    placar: placar()
  };
}

function estadoJogador(j) {
  const p = perguntaAtual();
  const ordenados = [...jogadores.values()].sort((a, b) => b.pontos - a.pontos);
  return {
    estado: jogo.estado,
    nome: j.nome,
    equipe: j.equipe === null ? '' : jogo.equipes[j.equipe] || '',
    posicao: ordenados.findIndex((x) => x.id === j.id) + 1,
    total: ordenados.length,
    sequencia: j.sequencia,
    dobro: !!(p && p.dobro),
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

function gerarRelatorio() {
  const atual = banco();
  if (!atual) return;
  const cabecalho = ['nome', 'equipe', 'pontos', 'acertos', 'total_perguntas', 'maior_sequencia'];
  atual.perguntas.forEach((p, i) => cabecalho.push('p' + (i + 1)));

  const linhas = [cabecalho.join(';')];
  [...jogadores.values()]
    .sort((a, b) => b.pontos - a.pontos)
    .forEach((j) => {
      const campos = [
        j.nome.replace(/;/g, ','),
        j.equipe === null ? '' : jogo.equipes[j.equipe] || '',
        j.pontos,
        j.acertos,
        atual.perguntas.length,
        j.melhorSequencia
      ];
      atual.perguntas.forEach((p, i) => campos.push(j.respostas[i] || '-'));
      linhas.push(campos.join(';'));
    });

  // BOM na frente, senao o Excel abre acento errado
  const csv = '\uFEFF' + linhas.join('\n') + '\n';
  const carimbo = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', 'h');
  const nome = 'ping_' + carimbo + '_' + String(jogo.tema).replace('.json', '') + '.csv';
  ultimoRelatorio = { nome, csv };

  try {
    fs.mkdirSync(PASTA_RELATORIOS, { recursive: true });
    fs.writeFileSync(path.join(PASTA_RELATORIOS, nome), csv, 'utf8');
    console.log('relatorio salvo em relatorios/' + nome);
  } catch (erro) {
    console.error('nao consegui salvar o relatorio em disco: ' + erro.message);
  }
}

function abrirPergunta() {
  jogo.indice += 1;
  if (jogo.indice >= perguntas().length) {
    jogo.estado = 'fim';
    gerarRelatorio();
    transmitir();
    return;
  }
  jogadores.forEach((j) => {
    j.pontosAntes = j.pontos; // guarda o valor de onde a animacao do placar sai
    j.escolha = null;
    j.ganhou = 0;
    j.respondeuEm = 0;
  });
  jogo.estado = 'pergunta';
  jogo.abertaEm = Date.now();
  transmitir();
}

function fecharPergunta() {
  jogadores.forEach((j) => {
    if (j.escolha === null) {
      j.sequencia = 0; // ficou sem responder, perde a sequencia
      if (j.entrouEm < jogo.abertaEm) j.respostas[jogo.indice] = '-';
    }
  });
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
    j.ganhou = 0;
    j.escolha = null;
    j.respondeuEm = 0;
    j.sequencia = 0;
    j.melhorSequencia = 0;
    j.acertos = 0;
    j.respostas = [];
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

    if (msg.tipo === 'modo') {
      if (!hosts.has(ws) || jogo.estado !== 'aguardando') return;
      if (msg.modo === 'individual') {
        jogo.modo = 'individual';
        jogo.equipes = [];
        jogadores.forEach((j) => {
          j.equipe = null;
        });
      } else if (msg.modo === 'equipes') {
        const quantidade = Math.min(Math.max(Number(msg.quantidade) || 2, 2), 4);
        jogo.modo = 'equipes';
        jogo.equipes = Array.from({ length: quantidade }, (nada, i) => 'Equipe ' + (i + 1));
        jogadores.forEach((j) => {
          if (j.equipe !== null && j.equipe >= quantidade) j.equipe = null;
        });
      }
      transmitir();
      return;
    }

    if (msg.tipo === 'sortear') {
      if (!hosts.has(ws) || jogo.estado !== 'aguardando' || jogo.modo !== 'equipes') return;
      const lista = [...jogadores.values()].filter(online);
      for (let i = lista.length - 1; i > 0; i -= 1) {
        const troca = Math.floor(Math.random() * (i + 1));
        [lista[i], lista[troca]] = [lista[troca], lista[i]];
      }
      lista.forEach((jogador, i) => {
        jogador.equipe = i % jogo.equipes.length; // reparte parelho, nao aleatorio por sorteio individual
      });
      transmitir();
      return;
    }

    if (msg.tipo === 'equipe_jogador') {
      if (!hosts.has(ws) || jogo.estado !== 'aguardando' || jogo.modo !== 'equipes') return;
      const j = jogadores.get(String(msg.id || ''));
      if (!j) return;
      const equipe = Number(msg.equipe);
      j.equipe = Number.isInteger(equipe) && equipe >= 0 && equipe < jogo.equipes.length ? equipe : null;
      transmitir();
      return;
    }

    if (msg.tipo === 'entrar_jogador') {
      const id = String(msg.id || '').slice(0, 40);
      if (!id) return;
      const nome = limparNome(msg.nome);
      const antigo = jogadores.get(id);
      if (antigo) {
        antigo.ws = ws; // voltou depois de cair, mantem pontos e resposta da rodada
        antigo.nome = nome;
      } else {
        jogadores.set(id, {
          id,
          nome,
          equipe: null,
          pontos: 0,
          pontosAntes: 0,
          ganhou: 0,
          escolha: null,
          respondeuEm: 0,
          sequencia: 0,
          melhorSequencia: 0,
          acertos: 0,
          respostas: [],
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
      j.respondeuEm = Date.now() - jogo.abertaEm;
      if (i === p.correta) {
        j.ganhou = pontuar(p, j.respondeuEm, j.sequencia);
        j.pontos += j.ganhou;
        j.sequencia += 1;
        j.melhorSequencia = Math.max(j.melhorSequencia, j.sequencia);
        j.acertos += 1;
        j.respostas[jogo.indice] = 'C';
      } else {
        j.sequencia = 0;
        j.respostas[jogo.indice] = 'X';
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

// abre a tela do host sozinho quando o script de atalho e usado
function abrirNavegador(url) {
  const { exec } = require('child_process');
  const comando =
    process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(comando + ' "' + url + '"', (erro) => {
    if (erro) console.log('abra manualmente: ' + url);
  });
}

servidor.listen(PORTA, async () => {
  const url = 'http://' + ipLocal() + ':' + PORTA + '/play';
  console.log('host:   http://localhost:' + PORTA + '/host');
  console.log('player: ' + url);
  try {
    console.log(await QRCode.toString(url, { type: 'terminal', small: true }));
  } catch (erro) {
    console.error(erro);
  }
  if (process.argv.includes('--abrir')) {
    const destino =
      'http://localhost:' + PORTA + '/host' + (CHAVE ? '?chave=' + encodeURIComponent(CHAVE) : '');
    setTimeout(() => abrirNavegador(destino), 800);
  }
});