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
const elAvisoSuspense = document.getElementById('aviso-suspense');
const elSecaoPlacar = document.getElementById('secao-placar');
const elTituloPlacar = document.getElementById('titulo-secao-placar');
const elContainerPodio = document.getElementById('container-podio');
const elPlacar = document.getElementById('placar');
const elContador = document.getElementById('contador');
const elAvancar = document.getElementById('avancar');

const elContainerTempo = document.getElementById('container-tempo');
const elBarraTempo = document.getElementById('barra-tempo');
const elTextoTempo = document.getElementById('texto-tempo');
const elArquibancada = document.getElementById('arquibancada');

const chave = new URLSearchParams(location.search).get('chave') || '';
let ws = null;
let animando = false;
let ultimaAnimacao = '';

elUrlPlay.textContent = location.origin + '/play';

const emojisDisponiveis = ['😎', '🤠', '👽', '👾', '🤖', '👻', '🚀', '🦖', '🦄', '🐸', '🦉', '🦊', '🐙', '🥑', '🍔', '🍕', '🎮', '🎲', '🎸', '🤡', '🐒'];
const mapaDeEmojis = new Map();

function obterEmoji(nome) {
  if (!mapaDeEmojis.has(nome)) {
    const sorteado = emojisDisponiveis[Math.floor(Math.random() * emojisDisponiveis.length)];
    mapaDeEmojis.set(nome, sorteado);
  }
  return mapaDeEmojis.get(nome);
}

let timerInterval = null;
let numeroPerguntaAtual = -1; 
let timeoutSuspense = null; 
const TEMPO_TOTAL_SEG = 30; 
const TEMPO_SUSPENSE_MS = 3000; 
const PONTOS_MAXIMOS = 1000;
const PONTOS_MINIMOS = 200;
const TOLERANCIA_MAX_PTS_MS = 1500; 

function iniciarTimer(tempoFimMs) {
  pararTimer();
  elContainerTempo.style.display = 'block';

  timerInterval = setInterval(() => {
    const agora = Date.now();
    const restanteMs = Math.max(0, tempoFimMs - agora);
    const totalMs = TEMPO_TOTAL_SEG * 1000;

    const porcentagem = (restanteMs / totalMs) * 100;
    elBarraTempo.style.width = porcentagem + '%';

    if (restanteMs <= 5000) {
      elBarraTempo.style.backgroundColor = '#d9534f';
    } else {
      elBarraTempo.style.backgroundColor = '#5bc0de';
    }

    if (restanteMs > 0) {
      let pontos = 0;
      const tempoParaDecair = totalMs - TOLERANCIA_MAX_PTS_MS;

      if (restanteMs >= tempoParaDecair) {
        pontos = PONTOS_MAXIMOS;
      } else {
        const proporcao = restanteMs / tempoParaDecair;
        pontos = Math.round(PONTOS_MINIMOS + (PONTOS_MAXIMOS - PONTOS_MINIMOS) * proporcao);
      }

      const restanteSeg = Math.ceil(restanteMs / 1000);
      elTextoTempo.textContent = `${restanteSeg}s restantes — Máx: ${pontos} pts`;
    } else {
      elTextoTempo.textContent = `Tempo esgotado!`;
      pararTimer();
    }
  }, 50);
}

function pararTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (timeoutSuspense) {
    clearTimeout(timeoutSuspense);
    timeoutSuspense = null;
  }
}

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

function desenharPodio(lista) {
  elContainerPodio.innerHTML = '';
  if (!lista || lista.length === 0) {
    elContainerPodio.style.display = 'none';
    return;
  }

  elContainerPodio.style.display = 'flex';
  const p1 = lista[0];
  const p2 = lista[1];
  const p3 = lista[2];

  const ordemPodio = [
    { dados: p2, posicao: 2, classe: 'podio-2', label: '2º' },
    { dados: p1, posicao: 1, classe: 'podio-1', label: '1º' },
    { dados: p3, posicao: 3, classe: 'podio-3', label: '3º' }
  ];

  ordemPodio.forEach((item) => {
    if (!item.dados) return;
    const coluna = document.createElement('div');
    coluna.className = `bloco-podio ${item.classe}`;
    const emoji = obterEmoji(item.dados.nome);

    coluna.innerHTML = `
      <div style="text-align: center; margin-bottom: 0.5rem;">
        <div class="avatar-podio">${emoji}</div>
        <div class="nome-podio">${item.dados.nome}</div>
        <div class="pontos-podio">${item.dados.pontos} pts</div>
      </div>
      <div style="font-size: 1.2rem; font-weight: 900; opacity: 0.7;">${item.label}</div>
    `;
    elContainerPodio.appendChild(coluna);
  });
}

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
    const emoji = obterEmoji(linha.nome); 
    nome.textContent = (modo === 'antes' ? linha.posicaoAntes : i + 1) + '. ' + emoji + ' ' + linha.nome;

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
    // Faz o botão ocupar 100% da largura da lista vertical
    botao.style.width = '100%';
    botao.style.textAlign = 'left';
    botao.style.padding = '0.75rem 1rem';
    botao.style.cursor = 'pointer';
    
    botao.textContent = '📁 ' + tema.titulo + ' (' + tema.total + ' perguntas)';
    botao.addEventListener('click', () => enviar({ tipo: 'tema', arquivo: tema.arquivo }));
    item.appendChild(botao);
    elTemas.appendChild(item);
  });
}

function desenharArquibancada(e) {
  elArquibancada.innerHTML = '';
  const listaJogadores = e.jogadores || e.placar || [];

  if (listaJogadores.length === 0) {
    elArquibancada.innerHTML = '<span style="color: #666; font-style: italic;">Aguardando jogadores...</span>';
    return;
  }

  listaJogadores.forEach((jogador) => {
    const cracha = document.createElement('span');
    const nomeJogador = typeof jogador === 'string' ? jogador : jogador.nome;
    const emoji = obterEmoji(nomeJogador);
    
    cracha.textContent = `${emoji} ${nomeJogador}`;
    cracha.className = 'cracha-animado';
    cracha.style.animationDelay = `${Math.random() * 2}s`;
    
    cracha.style.backgroundColor = 'rgba(91, 192, 222, 0.15)'; 
    cracha.style.border = '2px solid #5bc0de';
    cracha.style.color = '#fff';
    cracha.style.padding = '0.6rem 1rem';
    cracha.style.borderRadius = '25px';
    cracha.style.fontWeight = 'bold';
    cracha.style.fontSize = '1.2rem';
    cracha.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
    cracha.style.transition = 'transform 0.2s';
    
    elArquibancada.appendChild(cracha);
  });
}

function desenhar(e) {
  if (e.estado === 'pergunta') elNumero.textContent = e.tituloTema + ', pergunta ' + e.numero + ' de ' + e.total;
  else if (e.estado === 'resultado') elNumero.textContent = e.tituloTema + ', resultado ' + e.numero + ' de ' + e.total;
  else if (e.estado === 'fim') elNumero.textContent = 'Fim da partida, ' + e.tituloTema;
  else elNumero.textContent = 'Sala aberta';

  if (e.estado === 'pergunta') {
    if (numeroPerguntaAtual !== e.numero) {
      numeroPerguntaAtual = e.numero;
      
      elAlternativas.innerHTML = '';
      elAvisoSuspense.style.display = 'block';
      elContainerTempo.style.display = 'none';

      timeoutSuspense = setTimeout(() => {
        elAvisoSuspense.style.display = 'none';
        
        e.alternativas.forEach((texto, i) => {
          const item = document.createElement('li');
          item.className = e.correta === i ? 'alternativa correta' : 'alternativa';
          item.textContent = letras[i] + '. ' + texto;
          elAlternativas.appendChild(item);
        });

        const fimMs = e.tempoFim ? e.tempoFim : Date.now() + (TEMPO_TOTAL_SEG * 1000);
        iniciarTimer(fimMs);
      }, TEMPO_SUSPENSE_MS);
    }
  } else {
    pararTimer();
    elAvisoSuspense.style.display = 'none';
    elContainerTempo.style.display = 'none';
    numeroPerguntaAtual = -1;
  }

  elAbertura.hidden = e.estado !== 'aguardando';
  elRodada.hidden = e.estado === 'aguardando' || e.estado === 'fim';
  elSecaoPlacar.hidden = e.estado === 'aguardando' || e.estado === 'pergunta';

  if (e.estado === 'fim') {
    elTituloPlacar.textContent = '🏆 Pódio Final';
    desenharPodio(e.placar);
  } else {
    elTituloPlacar.textContent = 'Placar';
    elContainerPodio.style.display = 'none';
  }

  if (e.estado === 'aguardando') {
    desenharTemas(e);
    desenharArquibancada(e);
  }

  if (!elRodada.hidden && e.estado === 'pergunta' && timeoutSuspense === null) {
    elEnunciado.textContent = e.enunciado;
  } else if (!elRodada.hidden && e.estado !== 'pergunta') {
    elEnunciado.textContent = e.enunciado;
    elAvisoSuspense.style.display = 'none';
    elAlternativas.innerHTML = '';
    e.alternativas.forEach((texto, i) => {
      const item = document.createElement('li');
      item.className = e.correta === i ? 'alternativa correta' : 'alternativa';
      item.textContent = letras[i] + '. ' + texto;
      elAlternativas.appendChild(item);
    });
  } else if (!elRodada.hidden && e.estado === 'pergunta') {
    elEnunciado.textContent = e.enunciado; 
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