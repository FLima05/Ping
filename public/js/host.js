const letras = ['A', 'B', 'C', 'D', 'E', 'F'];
const rotulos = {
  aguardando: 'Iniciar',
  pergunta: 'Encerrar pergunta',
  resultado: 'Próxima pergunta',
  fim: 'Recomeçar'
};

const el = (id) => document.getElementById(id);
const elNumero = el('numero');
const elContagem = el('contagem');
const elConexao = el('conexao');
const elAbertura = el('abertura');
const elTemas = el('temas');
const elModos = el('modos');
const elTituloLobby = el('titulo-lobby');
const elSortear = el('sortear');
const elLobby = el('lobby');
const elQr = el('qr');
const elUrlPlay = el('url-play');
const elRodada = el('rodada');
const elDobro = el('dobro');
const elEnunciado = el('enunciado');
const elAlternativas = el('alternativas');
const elRapido = el('rapido');
const elSecaoPlacar = el('secao-placar');
const elPlacarEquipes = el('placar-equipes');
const elPlacar = el('placar');
const elRelatorio = el('relatorio');
const elContador = el('contador');
const elAvancar = el('avancar');

const chave = new URLSearchParams(location.search).get('chave') || '';
let ws = null;
let animando = false;
let ultimaAnimacao = '';

/* ===================== ENDERECO DE ENTRADA ===================== */

// com tunel a URL so fica pronta uns segundos depois do boot, entao pergunta de novo
let urlEntrada = '';

function atualizarEntrada() {
  fetch('/entrada.json')
    .then((r) => r.json())
    .then((d) => {
      if (!d.url || d.url === urlEntrada) return;
      urlEntrada = d.url;
      elUrlPlay.textContent = d.url;
      elQr.src = '/qr.svg?t=' + Date.now();
    })
    .catch(() => {
      if (!urlEntrada) elUrlPlay.textContent = location.origin + '/play';
    });
}

atualizarEntrada();
setInterval(atualizarEntrada, 5000);

/* ===================== CONEXAO ===================== */

function enviar(dados) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(dados));
}

function conectar() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);

  ws.addEventListener('open', () => {
    elConexao.textContent = '';
    enviar({ tipo: 'entrar_host', chave: chave });
  });

  ws.addEventListener('message', (evento) => {
    try {
      desenhar(JSON.parse(evento.data));
    } catch (erro) {
      console.error(erro);
    }
  });

  ws.addEventListener('close', () => {
    elConexao.textContent = 'reconectando';
    setTimeout(conectar, 2000);
  });
}

conectar();

// segura a conexao viva e evita o servico dormir por falta de trafego
setInterval(() => enviar({ tipo: 'ping' }), 25000);

elAvancar.addEventListener('click', () => enviar({ tipo: 'proxima' }));
elSortear.addEventListener('click', () => enviar({ tipo: 'sortear' }));
elModos.querySelectorAll('button').forEach((botao) => {
  botao.addEventListener('click', () =>
    enviar({
      tipo: 'modo',
      modo: botao.dataset.modo,
      quantidade: Number(botao.dataset.quantidade) || 0
    })
  );
});

/* ===================== PLACAR ===================== */

function contar(elemento, de, ate, ms) {
  const inicio = performance.now();
  function passo(agora) {
    const t = Math.min((agora - inicio) / ms, 1);
    elemento.textContent = Math.round(de + (ate - de) * t);
    if (t < 1) requestAnimationFrame(passo);
  }
  requestAnimationFrame(passo);
}

function linhaPlacar(linha, rotuloPosicao, valor, modo) {
  const item = document.createElement('li');
  item.dataset.id = linha.id;

  const nome = document.createElement('span');
  nome.textContent = rotuloPosicao + '. ' + linha.nome;

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
  pontos.textContent = valor;

  item.appendChild(nome);
  item.appendChild(ganho);
  item.appendChild(pontos);
  return { item, pontos };
}

// modo: 'antes' desenha o placar da rodada passada, 'anima' desliza e conta, 'direto' so redesenha
function desenharPlacar(lista, modo) {
  const topoAnterior = new Map();
  elPlacar.querySelectorAll('li').forEach((li) => {
    topoAnterior.set(li.dataset.id, li.getBoundingClientRect().top);
  });

  elPlacar.innerHTML = '';
  lista.forEach((linha, i) => {
    const rotulo = modo === 'antes' ? linha.posicaoAntes : i + 1;
    const valor = modo === 'antes' ? linha.antes : linha.pontos;
    const { item, pontos } = linhaPlacar(linha, rotulo, valor, modo);
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
  const antes = [...lista].sort((a, b) => a.posicaoAntes - b.posicaoAntes).slice(0, 3);
  desenharPlacar(antes, 'antes');
  setTimeout(() => {
    desenharPlacar(lista.slice(0, 3), 'anima');
    setTimeout(() => {
      animando = false;
    }, 900);
  }, 700);
}

// terceiro, segundo, primeiro, um de cada vez
function animarPodio(lista) {
  animando = true;
  elPlacar.innerHTML = '';
  const tres = lista.slice(0, 3).reverse();
  tres.forEach((linha, i) => {
    setTimeout(() => {
      const { item } = linhaPlacar(linha, linha.posicao, linha.pontos, 'direto');
      item.className = 'podio lugar-' + linha.posicao;
      elPlacar.prepend(item);
      if (i === tres.length - 1) {
        setTimeout(() => {
          animando = false;
        }, 400);
      }
    }, i * 900);
  });
}

/* ===================== TELAS ===================== */

function desenharAlternativas(e) {
  const total = (e.distribuicao || []).reduce((soma, n) => soma + n, 0);
  elAlternativas.className = e.correta !== null ? 'alternativas resultado' : 'alternativas';
  elAlternativas.innerHTML = '';

  e.alternativas.forEach((texto, i) => {
    const item = document.createElement('li');
    item.className = e.correta === i ? 'alternativa correta' : 'alternativa';

    const rotulo = document.createElement('span');
    rotulo.textContent = letras[i] + '. ' + texto;
    item.appendChild(rotulo);

    if (e.distribuicao) {
      const quantidade = document.createElement('span');
      quantidade.className = 'quantidade';
      quantidade.textContent = e.distribuicao[i];
      item.appendChild(quantidade);

      const medidor = document.createElement('span');
      medidor.className = 'medidor';
      const preenchido = document.createElement('span');
      preenchido.className = 'medidor-preenchido';
      preenchido.style.width = (total ? (e.distribuicao[i] / total) * 100 : 0) + '%';
      medidor.appendChild(preenchido);
      item.appendChild(medidor);
    }

    elAlternativas.appendChild(item);
  });
}

function desenharTemas(e) {
  elTemas.innerHTML = '';
  e.temas.forEach((tema) => {
    const item = document.createElement('li');
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = tema.arquivo === e.tema ? 'tema escolhido' : 'tema';
    botao.textContent = tema.titulo + ', ' + tema.total + ' perguntas';
    botao.addEventListener('click', () => enviar({ tipo: 'tema', arquivo: tema.arquivo }));
    item.appendChild(botao);
    elTemas.appendChild(item);
  });
}

function desenharModos(e) {
  elModos.querySelectorAll('button').forEach((botao) => {
    const escolhido =
      (botao.dataset.modo === 'individual' && e.modo === 'individual') ||
      (botao.dataset.modo === 'equipes' &&
        e.modo === 'equipes' &&
        Number(botao.dataset.quantidade) === e.equipes.length);
    botao.className = escolhido ? 'tema escolhido' : 'tema';
  });
}

function desenharLobby(e) {
  elTituloLobby.textContent = 'Na sala: ' + e.jogadores.length;
  elSortear.hidden = e.modo !== 'equipes';
  elLobby.innerHTML = '';

  e.jogadores.forEach((jogador) => {
    const item = document.createElement('li');
    const nome = document.createElement('span');
    nome.textContent = jogador.nome;
    item.appendChild(nome);

    if (e.modo === 'equipes') {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'equipe-botao';
      botao.textContent = jogador.equipe === null ? 'sem equipe' : e.equipes[jogador.equipe];
      botao.addEventListener('click', () => {
        // clique passa pra proxima equipe e volta pra sem equipe no fim da volta
        const proxima = jogador.equipe === null ? 0 : jogador.equipe + 1;
        enviar({
          tipo: 'equipe_jogador',
          id: jogador.id,
          equipe: proxima >= e.equipes.length ? -1 : proxima
        });
      });
      item.appendChild(botao);
    }

    elLobby.appendChild(item);
  });
}

function desenharEquipes(lista) {
  elPlacarEquipes.innerHTML = '';
  lista.forEach((equipe) => {
    const item = document.createElement('li');
    const nome = document.createElement('span');
    nome.textContent = equipe.nome + ', ' + equipe.membros + ' jogadores';
    const pontos = document.createElement('span');
    pontos.className = 'pontos';
    pontos.textContent = equipe.pontos;
    item.appendChild(nome);
    item.appendChild(pontos);
    elPlacarEquipes.appendChild(item);
  });
}

function desenhar(e) {
  if (e.estado === 'pergunta') elNumero.textContent = e.tituloTema + ', pergunta ' + e.numero + ' de ' + e.total;
  else if (e.estado === 'resultado') elNumero.textContent = e.tituloTema + ', resultado ' + e.numero + ' de ' + e.total;
  else if (e.estado === 'fim') elNumero.textContent = 'Fim da partida, ' + e.tituloTema;
  else elNumero.textContent = 'Sala aberta';

  elContagem.textContent = e.conectados + ' na sala';

  elAbertura.hidden = e.estado !== 'aguardando';
  elRodada.hidden = e.estado === 'aguardando' || e.estado === 'fim';
  elSecaoPlacar.hidden = e.estado === 'aguardando' || e.estado === 'pergunta';

  if (e.estado === 'aguardando') {
    desenharTemas(e);
    desenharModos(e);
    desenharLobby(e);
  }

  if (!elRodada.hidden) {
    elDobro.hidden = !e.dobro;
    elEnunciado.textContent = e.enunciado;
    desenharAlternativas(e);
    elRapido.textContent = e.maisRapido ? 'Respondeu certo primeiro: ' + e.maisRapido : '';
  }

  elPlacarEquipes.hidden = e.modo !== 'equipes' || elSecaoPlacar.hidden;
  if (!elPlacarEquipes.hidden) desenharEquipes(e.equipesPlacar);

  const marca = e.estado + e.numero;
  if (e.estado === 'fim' && ultimaAnimacao !== marca) {
    ultimaAnimacao = marca;
    animarPodio(e.placar);
  } else if (e.estado === 'resultado' && ultimaAnimacao !== marca) {
    ultimaAnimacao = marca;
    animarPlacar(e.placar);
  } else if (!elSecaoPlacar.hidden && !animando) {
    desenharPlacar(e.placar.slice(0, 3), 'direto');
  }
  if (e.estado === 'aguardando') ultimaAnimacao = '';

  elRelatorio.hidden = !(e.estado === 'fim' && e.relatorio);
  elRelatorio.href = '/relatorio.csv' + (chave ? '?chave=' + encodeURIComponent(chave) : '');

  elContador.textContent = e.respondidas + ' de ' + e.conectados + ' responderam';
  elAvancar.textContent = rotulos[e.estado];
  elAvancar.disabled = e.estado === 'aguardando' && !e.tema;
}