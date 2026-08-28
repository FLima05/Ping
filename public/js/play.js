const letras = ['A', 'B', 'C', 'D', 'E', 'F'];

const elEntrada = document.getElementById('entrada');
const elJogo = document.getElementById('jogo');
const elNome = document.getElementById('nome');
const elEntrar = document.getElementById('entrar');
const elAviso = document.getElementById('aviso');
const elAlternativas = document.getElementById('alternativas');
const elPosicao = document.getElementById('posicao');
const elPontos = document.getElementById('pontos');
const elConexao = document.getElementById('conexao');

// id fixo do aparelho, e o que devolve os pontos se a conexao cair
let id = sessionStorage.getItem('ping_id');
if (!id) {
  id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
  sessionStorage.setItem('ping_id', id);
}

let nome = sessionStorage.getItem('ping_nome') || '';
let ws = null;

if (nome) {
  elEntrada.hidden = true;
  elJogo.hidden = false;
}

function entrar() {
  if (ws && ws.readyState === WebSocket.OPEN && nome) {
    ws.send(JSON.stringify({ tipo: 'entrar_jogador', id: id, nome: nome }));
  }
}

function conectar() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.addEventListener('open', () => {
    elConexao.textContent = '';
    entrar();
  });
  ws.addEventListener('message', (evento) => desenhar(JSON.parse(evento.data)));
  ws.addEventListener('close', () => {
    elConexao.textContent = 'reconectando';
    setTimeout(conectar, 2000);
  });
}

conectar();

setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ tipo: 'ping' }));
}, 25000);

// celular volta do bloqueio com a conexao morta, reconecta na hora
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && ws && ws.readyState === WebSocket.CLOSED) conectar();
});

elEntrar.addEventListener('click', () => {
  const digitado = elNome.value.trim();
  if (!digitado) return;
  nome = digitado;
  sessionStorage.setItem('ping_nome', nome);
  elEntrada.hidden = true;
  elJogo.hidden = false;
  entrar();
});

function desenhar(e) {
  elAlternativas.innerHTML = '';
  elAviso.className = '';

  if (e.estado === 'pergunta' && e.escolha === null && e.alternativas.length === 0) {
    elAviso.textContent = 'Entrou no meio da pergunta, aguarde a próxima';
  } else if (e.estado === 'pergunta' && e.escolha === null) {
    elAviso.textContent = e.dobro ? 'Vale o dobro' : '';
    e.alternativas.forEach((texto, i) => {
      const botao = document.createElement('button');
      botao.className = 'resposta';
      botao.textContent = letras[i] + '. ' + texto;
      botao.addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ tipo: 'responder', indice: i }));
      });
      elAlternativas.appendChild(botao);
    });
  } else if (e.estado === 'pergunta') {
    elAviso.textContent = 'Resposta enviada: ' + letras[e.escolha];
  } else if (e.estado === 'resultado') {
    if (e.escolha === null) {
      elAviso.textContent = 'Sem resposta';
    } else if (e.acertou) {
      elAviso.textContent = 'Acertou, mais ' + e.ganhou;
      elAviso.className = 'certo';
    } else {
      elAviso.textContent = 'Errou';
      elAviso.className = 'errado';
    }
  } else if (e.estado === 'fim') {
    elAviso.textContent = 'Fim da partida';
  } else {
    elAviso.textContent = 'Aguarde o início';
  }

  const partes = [];
  if (e.total > 0 && e.estado !== 'aguardando') partes.push(e.posicao + ' de ' + e.total);
  if (e.equipe) partes.push(e.equipe);
  if (e.sequencia > 1) partes.push('sequência ' + e.sequencia);
  elPosicao.textContent = partes.join('   ');

  elPontos.textContent = e.nome + ': ' + e.pontos + ' pontos';
}