const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');
const { WebSocketServer } = require('ws');

const PORTA = Number(process.env.PORT) || 3000;
const CHAVE = process.env.CHAVE_HOST || '';
const PASTA_QUIZZES = path.join(__dirname, 'quizzes');
const PASTA_RELATORIOS = path.join(__dirname, 'relatorios');

const LIMITE_MENSAGENS = 25; // por segundo, por conexao
const JANELA_MS = 1000;
const TAMANHO_MAXIMO = 2000; // bytes por mensagem
const LIMITE_JOGADORES = 300;

// tempo de leitura antes das alternativas aparecerem, estilo Kahoot: da pra ler a pergunta sem ja sair caçando resposta
const LEITURA_MINIMA_MS = 2500;
const LEITURA_MAXIMA_MS = 7000;
const LEITURA_MS_POR_CARACTERE = 60;

// mesma lista no play.js pro seletor; aqui so valida o que chega
const AVATARES = ['🦊', '🐼', '🐸', '🐵', '🐨', '🦁', '🐯', '🐰', '🐺', '🦄', '🐙', '🦖', '🐧', '🦉', '🐝', '🦋', '🐳', '🐢', '🐲', '👾', '🤖', '👻', '🥷', '🐴'];
const EMOJIS_REACAO = ['👍', '❤️', '😂', '😮', '🔥', '👏'];
const REACAO_INTERVALO_MS = 1200; // trava spam de reacao por jogador

// nomes de adaptador que nunca servem pro celular alcancar
const MODO_ONLINE = process.argv.includes('--online');
let urlPublica = ''; // preenchida quando o tunel sobe

// nomes de adaptador que nunca servem pro celular alcancar
const ADAPTADOR_IGNORADO = /virtual|vmware|virtualbox|vethernet|hyper-v|wsl|docker|zerotier|tailscale|loopback|bluetooth|utun/i;

/* ===================== TEMAS ===================== */

function validarBanco(dados) {
  const erros = [];
  if (!dados || typeof dados !== 'object') return ['arquivo nao e um objeto JSON'];
  if (typeof dados.titulo !== 'string' || !dados.titulo.trim()) erros.push('falta o campo titulo');
  if (!Array.isArray(dados.perguntas) || dados.perguntas.length === 0) {
    erros.push('falta a lista perguntas ou ela esta vazia');
    return erros;
  }

  dados.perguntas.forEach((p, i) => {
    const onde = 'pergunta ' + (i + 1);
    if (!p || typeof p !== 'object') {
      erros.push(onde + ': nao e um objeto');
      return;
    }
    if (typeof p.enunciado !== 'string' || !p.enunciado.trim()) erros.push(onde + ': enunciado vazio');
    if (!Array.isArray(p.alternativas) || p.alternativas.length < 2) {
      erros.push(onde + ': precisa de pelo menos 2 alternativas');
      return;
    }
    if (p.alternativas.length > 6) erros.push(onde + ': maximo de 6 alternativas, tem ' + p.alternativas.length);
    if (p.alternativas.some((a) => typeof a !== 'string' || !a.trim())) erros.push(onde + ': tem alternativa vazia');
    if (!Number.isInteger(p.correta) || p.correta < 0 || p.correta >= p.alternativas.length) {
      erros.push(onde + ': correta e ' + p.correta + ', mas precisa ser de 0 a ' + (p.alternativas.length - 1));
    }
    if (typeof p.tempo !== 'number' || p.tempo <= 0) erros.push(onde + ': tempo precisa ser numero maior que zero');
  });

  return erros;
}

// le a pasta uma vez no boot; arquivo com erro e reportado e pulado, nao derruba os outros
function carregarBancos() {
  const mapa = new Map();
  let arquivos = [];

  try {
    arquivos = fs.readdirSync(PASTA_QUIZZES).filter((a) => a.endsWith('.json'));
  } catch {
    console.error('pasta quizzes nao encontrada em ' + PASTA_QUIZZES);
    process.exit(1);
  }

  for (const arquivo of arquivos) {
    let dados;
    try {
      dados = JSON.parse(fs.readFileSync(path.join(PASTA_QUIZZES, arquivo), 'utf8'));
    } catch (erro) {
      console.error('quizzes/' + arquivo + ': JSON invalido, ' + erro.message);
      continue;
    }

    const erros = validarBanco(dados);
    if (erros.length) {
      erros.forEach((e) => console.error('quizzes/' + arquivo + ': ' + e));
      console.error('quizzes/' + arquivo + ': tema ignorado');
      continue;
    }

    mapa.set(arquivo, { titulo: dados.titulo, perguntas: dados.perguntas });
    console.log('tema carregado: ' + dados.titulo + ', ' + dados.perguntas.length + ' perguntas');
  }

  if (mapa.size === 0) {
    console.error('nenhum tema valido em quizzes/, o Ping nao tem o que jogar');
    process.exit(1);
  }

  return mapa;
}

const bancos = carregarBancos();

/* ===================== REDE ===================== */

function ipsLocais() {
  const candidatos = [];
  const redes = os.networkInterfaces();
  for (const nome of Object.keys(redes)) {
    if (ADAPTADOR_IGNORADO.test(nome)) continue;
    for (const info of redes[nome] || []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      if (info.address.startsWith('169.254.')) continue; // sem DHCP, nao roteia
      if (info.address.startsWith('192.168.56.')) continue; // rede so do VirtualBox
      candidatos.push({ nome, ip: info.address });
    }
  }
  return candidatos;
}

function ipLocal() {
  if (process.env.IP_LOCAL) return process.env.IP_LOCAL;
  const lista = ipsLocais();
  const escolhido =
    lista.find((c) => c.ip.startsWith('192.168.')) ||
    lista.find((c) => c.ip.startsWith('172.2')) || // roteador do iPhone
    lista.find((c) => c.ip.startsWith('10.')) ||
    lista[0];
  return escolhido ? escolhido.ip : 'localhost';
}

// hospedado usa o dominio da requisicao; local troca localhost pelo IP da rede
function urlDeEntrada(req) {
  if (urlPublica) return urlPublica + '/play'; // tunel no ar, todo mundo entra por ele
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

/* ===================== HTTP ===================== */

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

// o ws repassa o erro do http para o WebSocketServer, entao o tratamento precisa estar nos dois
function tratarErroDeBoot(erro) {
  if (erro.code === 'EADDRINUSE') {
    console.error('a porta ' + PORTA + ' ja esta em uso, provavelmente outro Ping aberto');
    console.error('feche a outra janela, ou rode em outra porta com PORT=3001 npm start');
    process.exit(1);
  }
  if (erro.code === 'EACCES') {
    console.error('sem permissao para usar a porta ' + PORTA + ', tente outra com PORT=3001 npm start');
    process.exit(1);
  }
  console.error(erro);
  process.exit(1);
}

servidor.on('error', tratarErroDeBoot);
wss.on('error', tratarErroDeBoot);

/* ===================== ESTADO ===================== */

const hosts = new Set();
const jogadores = new Map(); // id -> jogador

const jogo = {
  estado: 'configurando', // configurando | aguardando | leitura | pergunta | resultado | fim
  modo: 'individual', // individual | equipes | sobrevivencia
  equipes: [],
  tema: null,
  indice: -1,
  abertaEm: 0,
  leituraAte: 0 // timestamp em que a leitura acaba e as alternativas aparecem
};

let timerLeitura = null;

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

// so conta quem esta conectado agora, ja estava dentro quando a pergunta abriu e nao foi eliminado
function elegiveis() {
  return [...jogadores.values()].filter(
    (j) => online(j) && j.entrouEm < jogo.abertaEm && !(jogo.modo === 'sobrevivencia' && j.eliminado)
  );
}

// pergunta curta le rapido, pergunta longa precisa de mais tempo antes das alternativas aparecerem
function duracaoLeitura(pergunta) {
  const estimativa = LEITURA_MINIMA_MS + pergunta.enunciado.length * LEITURA_MS_POR_CARACTERE;
  return Math.min(LEITURA_MAXIMA_MS, Math.max(LEITURA_MINIMA_MS, estimativa));
}

// base cai com o tempo gasto, pergunta de dobro dobra tudo; sequencia nao multiplica mais (so emblema visual)
function pontuar(pergunta, ms) {
  const fracao = Math.min(ms / (pergunta.tempo * 1000), 1);
  const base = 1000 * (1 - fracao / 2);
  return Math.round(base * (pergunta.dobro ? 2 : 1));
}

// pergunta que mais derrubou a turma, pra puxar assunto no fim da aula
function perguntaMaisErrada() {
  const atual = banco();
  if (!atual) return null;
  const erros = atual.perguntas.map(() => 0);
  jogadores.forEach((j) => {
    j.respostas.forEach((r, i) => {
      if (r === 'X' || r === '-') erros[i] += 1;
    });
  });
  let pior = -1;
  erros.forEach((n, i) => {
    if (n > 0 && (pior === -1 || n > erros[pior])) pior = i;
  });
  return pior === -1 ? null : { enunciado: atual.perguntas[pior].enunciado, erros: erros[pior] };
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
      avatar: j.avatar,
      pontos: j.pontos,
      antes: j.pontosAntes,
      ganhou: j.ganhou,
      sequencia: j.sequencia,
      eliminado: j.eliminado,
      posicao: i + 1,
      posicaoAntes: ordemAntes.indexOf(j.id) + 1
    }));
}

function placarEquipes() {
  if (jogo.modo !== 'equipes') return [];
  return jogo.equipes
    .map((nome, i) => {
      const membros = [...jogadores.values()].filter((j) => j.equipe === i);
      return { nome, membros: membros.length, pontos: membros.reduce((soma, j) => soma + j.pontos, 0) };
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
      .map((j) => ({ id: j.id, nome: j.nome, avatar: j.avatar, equipe: j.equipe, eliminado: j.eliminado })),
    numero: jogo.indice + 1,
    total: perguntas().length,
    enunciado: p ? p.enunciado : '',
    alternativas: p ? p.alternativas : [],
    correta: jogo.estado === 'resultado' && p ? p.correta : null,
    dobro: !!(p && p.dobro),
    leituraAte: jogo.estado === 'leitura' ? jogo.leituraAte : 0,
    distribuicao: jogo.estado === 'resultado' ? distribuicao() : null,
    maisRapido: jogo.estado === 'resultado' ? maisRapido() : '',
    respondidas: naRodada.filter((j) => j.escolha !== null).length,
    conectados: naRodada.length,
    conectadosTotal: [...jogadores.values()].filter(online).length,
    relatorio: !!ultimoRelatorio,
    perguntaDificil: jogo.estado === 'fim' ? perguntaMaisErrada() : null,
    placar: placar()
  };
}

function estadoJogador(j) {
  const p = perguntaAtual();
  const ordenados = [...jogadores.values()].sort((a, b) => b.pontos - a.pontos);
  return {
    estado: jogo.estado,
    numero: jogo.indice + 1,
    nome: j.nome,
    avatar: j.avatar,
    equipe: j.equipe === null ? '' : jogo.equipes[j.equipe] || '',
    posicao: ordenados.findIndex((x) => x.id === j.id) + 1,
    total: ordenados.length,
    sequencia: j.sequencia,
    dobro: !!(p && p.dobro),
    eliminado: j.eliminado,
    leituraAte: jogo.estado === 'leitura' ? jogo.leituraAte : 0,
    alternativas:
      jogo.estado === 'pergunta' && p && j.entrouEm < jogo.abertaEm && !j.eliminado ? p.alternativas : [],
    escolha: j.escolha,
    acertou: jogo.estado === 'resultado' && p ? j.escolha === p.correta : null,
    ganhou: j.ganhou,
    perdeu: j.perdeu,
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

/* ===================== PARTIDA ===================== */

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

  const pior = perguntaMaisErrada();
  if (pior) {
    linhas.push('');
    linhas.push('pergunta que mais derrubou a turma;' + pior.enunciado.replace(/;/g, ',') + ';' + pior.erros + ' erros');
  }

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
    j.perdeu = 0;
    j.respondeuEm = 0;
  });
  jogo.estado = 'leitura';
  jogo.abertaEm = 0; // so passa a valer quando as alternativas abrirem de verdade
  jogo.leituraAte = Date.now() + duracaoLeitura(perguntaAtual());
  transmitir();
  clearTimeout(timerLeitura);
  timerLeitura = setTimeout(iniciarRespostas, jogo.leituraAte - Date.now());
}

// leitura acabou (por tempo ou porque o host pulou): abre pra responder e liga o cronometro
function iniciarRespostas() {
  clearTimeout(timerLeitura);
  timerLeitura = null;
  if (jogo.estado !== 'leitura') return;
  jogo.estado = 'pergunta';
  jogo.leituraAte = 0;
  jogo.abertaEm = Date.now();
  transmitir();
}

function fecharPergunta() {
  jogadores.forEach((j) => {
    if (j.escolha === null) {
      j.sequencia = 0; // ficou sem responder, perde a sequencia
      if (j.entrouEm < jogo.abertaEm) {
        j.respostas[jogo.indice] = '-';
        if (jogo.modo === 'sobrevivencia') j.eliminado = true;
      }
    }
  });
  jogo.estado = 'resultado';
  transmitir();
}

// volta pro comeco sem reiniciar o servico, e libera trocar de tema
function reiniciar() {
  clearTimeout(timerLeitura);
  timerLeitura = null;
  jogo.estado = 'aguardando';
  jogo.tema = null;
  jogo.indice = -1;
  jogo.abertaEm = 0;
  jogo.leituraAte = 0;
  jogadores.forEach((j) => {
    j.pontos = 0;
    j.pontosAntes = 0;
    j.ganhou = 0;
    j.perdeu = 0;
    j.escolha = null;
    j.respondeuEm = 0;
    j.sequencia = 0;
    j.melhorSequencia = 0;
    j.acertos = 0;
    j.eliminado = false;
    j.respostas = [];
    j.entrouEm = Date.now();
  });
  transmitir();
}

function fecharSeTodosResponderam() {
  const dentro = elegiveis();
  // dentro.length 0 acontece quando o ultimo sobrevivente acabou de ser eliminado
  if (jogo.estado === 'pergunta' && (dentro.length === 0 || dentro.every((j) => j.escolha !== null))) {
    fecharPergunta();
  } else {
    transmitir();
  }
}

/* ===================== WEBSOCKET ===================== */

wss.on('connection', (ws) => {
  ws.contador = 0;
  ws.janela = Date.now();

  ws.on('message', (bruto) => {
    // janela deslizante simples: passou do limite, derruba a conexao
    const agora = Date.now();
    if (agora - ws.janela > JANELA_MS) {
      ws.janela = agora;
      ws.contador = 0;
    }
    ws.contador += 1;
    if (ws.contador > LIMITE_MENSAGENS) {
      ws.close(1008, 'excesso de mensagens');
      return;
    }
    if (typeof bruto.length === 'number' && bruto.length > TAMANHO_MAXIMO) return;

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
      if (!hosts.has(ws) || (jogo.estado !== 'aguardando' && jogo.estado !== 'configurando')) return;
      if (!bancos.has(msg.arquivo)) return;
      jogo.tema = msg.arquivo;
      transmitir();
      return;
    }

    if (msg.tipo === 'modo') {
      if (!hosts.has(ws) || (jogo.estado !== 'aguardando' && jogo.estado !== 'configurando')) return;
      jogadores.forEach((j) => {
        j.eliminado = false; // troca de modo comeca do zero
      });
      if (msg.modo === 'individual') {
        jogo.modo = 'individual';
        jogo.equipes = [];
        jogadores.forEach((j) => {
          j.equipe = null;
        });
      } else if (msg.modo === 'sobrevivencia') {
        jogo.modo = 'sobrevivencia';
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
        jogador.equipe = i % jogo.equipes.length; // reparte parelho depois de embaralhar
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
      if (jogo.estado === 'configurando') {
        enviar(ws, { tipo: 'sala_fechada' });
        return;
      }
      const id = String(msg.id || '').slice(0, 40);
      if (!id) return;
      const nome = limparNome(msg.nome);
      const avatar = AVATARES.includes(msg.avatar) ? msg.avatar : AVATARES[0];
      const antigo = jogadores.get(id);
      if (antigo) {
        antigo.ws = ws; // voltou depois de cair, mantem pontos e resposta da rodada
        antigo.nome = nome;
        antigo.avatar = avatar;
      } else {
        if (jogadores.size >= LIMITE_JOGADORES) return; // sala cheia
        jogadores.set(id, {
          id,
          nome,
          avatar,
          equipe: null,
          pontos: 0,
          pontosAntes: 0,
          ganhou: 0,
          perdeu: 0,
          escolha: null,
          respondeuEm: 0,
          sequencia: 0,
          melhorSequencia: 0,
          acertos: 0,
          eliminado: false,
          ultimaReacao: 0,
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
      if (jogo.modo === 'sobrevivencia' && j.eliminado) return;
      const i = Number(msg.indice);
      if (!Number.isInteger(i) || i < 0 || i >= p.alternativas.length) return;
      const apostaPct = Math.min(Math.max(Number(msg.aposta) || 0, 0), 100);
      const apostaValor = Math.round(j.pontos * (apostaPct / 100));
      j.escolha = i;
      j.respondeuEm = Date.now() - jogo.abertaEm;
      if (i === p.correta) {
        j.ganhou = pontuar(p, j.respondeuEm) + apostaValor;
        j.pontos += j.ganhou;
        j.sequencia += 1;
        j.melhorSequencia = Math.max(j.melhorSequencia, j.sequencia);
        j.acertos += 1;
        j.respostas[jogo.indice] = 'C';
      } else {
        j.sequencia = 0;
        j.respostas[jogo.indice] = 'X';
        if (apostaValor > 0) {
          j.perdeu = apostaValor;
          j.pontos = Math.max(0, j.pontos - apostaValor);
        }
        if (jogo.modo === 'sobrevivencia') j.eliminado = true;
      }
      fecharSeTodosResponderam();
      return;
    }

    if (msg.tipo === 'reacao') {
      const j = jogadores.get(ws.idJogador);
      if (!j || !online(j)) return;
      if (!EMOJIS_REACAO.includes(msg.emoji)) return;
      const agora = Date.now();
      if (agora - j.ultimaReacao < REACAO_INTERVALO_MS) return;
      j.ultimaReacao = agora;
      const evento = { tipo: 'reacao', emoji: msg.emoji, nome: j.nome };
      hosts.forEach((h) => enviar(h, evento));
      return;
    }

    if (msg.tipo === 'proxima') {
      if (!hosts.has(ws)) return;
      if (jogo.estado === 'fim') reiniciar();
      else if (jogo.estado === 'configurando') {
        if (!jogo.tema) return;
        jogo.estado = 'aguardando';
        transmitir();
      } else if (jogo.estado === 'leitura') iniciarRespostas();
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

/* ===================== BOOT ===================== */

// sobe um tunel do Cloudflare e devolve a url publica, com https e WebSocket funcionando
async function abrirTunel() {
  const { Tunnel, bin, install } = require('cloudflared');

  if (!fs.existsSync(bin)) {
    console.log('baixando o cloudflared, so na primeira vez...');
    await install(bin);
  }

  const tunel = Tunnel.quick('http://localhost:' + PORTA);

  const endereco = await new Promise((resolve, reject) => {
    const prazo = setTimeout(() => reject(new Error('o tunel demorou demais para responder')), 30000);
    tunel.once('url', (u) => {
      clearTimeout(prazo);
      resolve(u);
    });
  });

  await new Promise((resolve) => tunel.once('connected', resolve));

  tunel.on('exit', (codigo) => {
    console.log('tunel encerrado, codigo ' + codigo);
    urlPublica = '';
  });

  process.on('SIGINT', () => {
    tunel.stop();
    process.exit(0);
  });

  return endereco;
}

// abre a tela do host sozinho quando o script de atalho e usado
function abrirNavegador(url) {
  const { exec } = require('child_process');
  const comando = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(comando + ' "' + url + '"', (erro) => {
    if (erro) console.log('abra manualmente: ' + url);
  });
}

servidor.listen(PORTA, '0.0.0.0', async () => {
  const redes = ipsLocais();

  if (MODO_ONLINE) {
    console.log('abrindo o tunel, isso leva alguns segundos...');
    try {
      urlPublica = await abrirTunel();
    } catch (erro) {
      console.error('nao consegui abrir o tunel: ' + erro.message);
      console.error('sem internet, ou o cloudflared foi bloqueado. Rodando so na rede local.');
    }
  } else if (redes.length === 0) {
    console.log('nenhuma rede local encontrada, conecte o computador ao Wi-Fi');
  } else if (redes.length > 1) {
    console.log('IPs encontrados: ' + redes.map((c) => c.nome + '=' + c.ip).join('   '));
    console.log('QR apontando pro lugar errado? rode com IP_LOCAL=o_ip_certo npm start');
  }

  const url = urlPublica ? urlPublica + '/play' : 'http://' + ipLocal() + ':' + PORTA + '/play';

  console.log('');
  console.log('host:   http://localhost:' + PORTA + '/host');
  console.log('player: ' + url);
  if (urlPublica) console.log('link publico, qualquer rede entra. Encerre com Ctrl+C ao terminar a aula.');

  try {
    console.log(await QRCode.toString(url, { type: 'terminal', small: true }));
  } catch (erro) {
    console.error(erro);
  }

  if (process.argv.includes('--abrir')) {
    const destino = 'http://localhost:' + PORTA + '/host' + (CHAVE ? '?chave=' + encodeURIComponent(CHAVE) : '');
    setTimeout(() => abrirNavegador(destino), 800);
  }
});