const letras = ['A', 'B', 'C', 'D', 'E', 'F'];
const rotulos = {
  aguardando: 'Iniciar',
  pergunta: 'Encerrar pergunta',
  resultado: 'Próxima pergunta',
  fim: 'Recomeçar'
};

const elNumero = document.getElementById('numero');
const elConexao = document.getElementById('conexao');
const elAbertura = document.getElementById('abertura');
const elTemas = document.getElementById('temas');
const elUrlPlay = document.getElementById('url-play');
const elRodada = document.getElementById('rodada');
const elEnunciado = document.getElementById('enunciado');
const elAlternativas = document.getElementById('alternativas');
const elSecaoPlacar = document.getElementById('secao-placar');
const elPlacar = document.getElementById('placar');
const elContador = document.getElementById('contador');
const elAvancar = document.getElementById('avancar');

const chave = new URLSearchParams(location.search).get('chave') || '';
let ws = null;
let animando = false;
let ultimaAnimacao = '';

// o servidor sabe o IP da rede, o navegador so conhece localhost
fetch('/entrada.json')
  .then((r) => r.json())
  .then((d) => {
    elUrlPlay.textContent = d.url;
  })
  .catch(() => {
    elUrlPlay.textContent = location.origin + '/play';
  });

function enviar(dados) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(dados));
}

function conectar() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.addEventListener('open', () => {
    elConexao.textContent = '';
    enviar({ tipo: 'entrar_host', chave: chave });
  });
  ws.addEventListener('message', (evento) => desenhar(JSON.parse(evento.data)));
  ws.addEventListener('close', () => {
    elConexao.textContent = 'reconectando';
    setTimeout(conectar, 2000);
  });
}

conectar();

// segura a conexao e evita o servico dormir por falta de trafego
setInterval(() => enviar({ tipo: 'ping' }), 25000);

elAvancar.addEventListener('click', () => enviar({ tipo: 'proxima' }));

function contar(elemento, de, ate, ms) {
  const inicio = performance.now();
  function passo(agora) {
    const t = Math.min((agora - inicio) / ms, 1);
    elemento.textContent = Math.round(de + (ate - de) * t);
    if (t < 1) requestAnimationFrame(passo);
  }
  requestAnimationFrame(passo);
}

// modo: 'antes' desenha o placar da rodada passada, 'anima' desliza e conta os pontos, 'direto' so redesenha
function desenharPlacar(lista, modo) {
  const topoAnterior = new Map();
  elPlacar.querySelectorAll('li').forEach((li) => {
    topoAnterior.set(li.dataset.id, li.getBoundingClientRect().top);
  });

  elPlacar.innerHTML = '';
  lista.forEach((linha, i) => {
    const item = document.createElement('li');
    item.dataset.id = linha.id;

    const nome = document.createElement('span');
    nome.textContent = (modo === 'antes' ? linha.posicaoAntes : i + 1) + '. ' + linha.nome;

    const ganho = document.createElement('span');
    ganho.className = 'ganho';
    if (modo !== 'antes') {
      const partes = [];
      if (linha.ganhou > 0) partes.push('+' + linha.ganhou);
      const salto = linha.posicaoAntes - linha.posicao;
      if (salto > 0) partes.push('sobe ' + salto);
      else if (salto < 0) partes.push('cai ' + -salto);
      ganho.textContent = partes.join('   ');
    }

    const pontos = document.createElement('span');
    pontos.className = 'pontos';
    pontos.textContent = modo === 'antes' ? linha.antes : linha.pontos;

    item.appendChild(nome);
    item.appendChild(ganho);
    item.appendChild(pontos);
    elPlacar.appendChild(item);

    if (modo === 'anima' && linha.antes !== linha.pontos) contar(pontos, linha.antes, linha.pontos, 800);
  });

  if (modo !== 'anima') return;

  // FLIP: cada linha volta pro lugar antigo e desliza ate o novo
  elPlacar.querySelectorAll('li').forEach((li) => {
    const topo = topoAnterior.get(li.dataset.id);
    if (topo === undefined) return;
    const delta = topo - li.getBoundingClientRect().top;
    if (!delta) return;
    li.style.transform = 'translateY(' + delta + 'px)';
    requestAnimationFrame(() => {
      li.style.transition = 'transform 700ms';
      li.style.transform = 'translateY(0)';
    });
  });
}

function animarPlacar(lista) {
  animando = true;
  desenharPlacar([...lista].sort((a, b) => a.posicaoAntes - b.posicaoAntes), 'antes');
  setTimeout(() => {
    desenharPlacar(lista, 'anima');
    setTimeout(() => {
      animando = false;
    }, 900);
  }, 700);
}

function desenharTemas(e) {
  elTemas.innerHTML = '';
  e.temas.forEach((tema) => {
    const item = document.createElement('li');
    const botao = document.createElement('button');
    botao.className = tema.arquivo === e.tema ? 'tema escolhido' : 'tema';
    botao.textContent = tema.titulo + ', ' + tema.total + ' perguntas';
    botao.addEventListener('click', () => enviar({ tipo: 'tema', arquivo: tema.arquivo }));
    item.appendChild(botao);
    elTemas.appendChild(item);
  });
}

function desenhar(e) {
  if (e.estado === 'pergunta') elNumero.textContent = e.tituloTema + ', pergunta ' + e.numero + ' de ' + e.total;
  else if (e.estado === 'resultado') elNumero.textContent = e.tituloTema + ', resultado ' + e.numero + ' de ' + e.total;
  else if (e.estado === 'fim') elNumero.textContent = 'Fim da partida, ' + e.tituloTema;
  else elNumero.textContent = 'Sala aberta';

  elAbertura.hidden = e.estado !== 'aguardando';
  elRodada.hidden = e.estado === 'aguardando' || e.estado === 'fim';
  elSecaoPlacar.hidden = e.estado === 'aguardando' || e.estado === 'pergunta';

  if (e.estado === 'aguardando') desenharTemas(e);

  if (!elRodada.hidden) {
    elEnunciado.textContent = e.enunciado;
    elAlternativas.innerHTML = '';
    e.alternativas.forEach((texto, i) => {
      const item = document.createElement('li');
      item.className = e.correta === i ? 'alternativa correta' : 'alternativa';
      item.textContent = letras[i] + '. ' + texto;
      elAlternativas.appendChild(item);
    });
  }

  const marca = e.estado + e.numero;
  if ((e.estado === 'resultado' || e.estado === 'fim') && ultimaAnimacao !== marca) {
    ultimaAnimacao = marca;
    animarPlacar(e.placar);
  } else if (!elSecaoPlacar.hidden && !animando) {
    desenharPlacar(e.placar, 'direto');
  }
  if (e.estado === 'aguardando') ultimaAnimacao = '';

  elContador.textContent = e.respondidas + ' de ' + e.conectados + ' responderam';
  elAvancar.textContent = rotulos[e.estado];
  elAvancar.disabled = e.estado === 'aguardando' && !e.tema;
}