const letras = ['A', 'B', 'C', 'D', 'E', 'F'];

const el = (id) => document.getElementById(id);
const elEntrada = el('entrada');
const elJogo = el('jogo');
const elNome = el('nome');
const elEntrar = el('entrar');
const elAviso = el('aviso');
const elAlternativas = el('alternativas');
const elPosicao = el('posicao');
const elPontos = el('pontos');
const elConexao = el('conexao');

// escreve so se o elemento existir, assim html velho nao derruba a tela inteira
function texto(elemento, valor) {
  if (elemento) elemento.textContent = valor;
}

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
    texto(elConexao, '');
    entrar();
  });

  ws.addEventListener('message', (evento) => {
    try {
      desenhar(JSON.parse(evento.data));
    } catch (erro) {
      console.error(erro);
      texto(elConexao, 'erro ao desenhar a tela');
    }
  });

  ws.addEventListener('error', () => texto(elConexao, 'sem conexao com o servidor'));

  ws.addEventListener('close', () => {
    texto(elConexao, 'reconectando');
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

function confirmarNome() {
  const digitado = elNome.value.trim();
  if (!digitado) return;
  nome = digitado;
  sessionStorage.setItem('ping_nome', nome);
  elEntrada.hidden = true;
  elJogo.hidden = false;
  entrar();
}

elEntrar.addEventListener('click', confirmarNome);
elNome.addEventListener('keydown', (evento) => {
  if (evento.key === 'Enter') confirmarNome();
});

function desenhar(e) {
  elAlternativas.innerHTML = '';
  elAviso.className = '';

  if (e.estado === 'pergunta' && e.escolha === null && e.alternativas.length === 0) {
    texto(elAviso, 'Entrou no meio da pergunta, aguarde a próxima');
  } else if (e.estado === 'pergunta' && e.escolha === null) {
    texto(elAviso, e.dobro ? 'Vale o dobro' : 'Escolha');
    e.alternativas.forEach((opcao, i) => {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'resposta';
      botao.dataset.letra = letras[i];
      botao.textContent = letras[i] + '. ' + opcao;
      botao.addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ tipo: 'responder', indice: i }));
      });
      elAlternativas.appendChild(botao);
    });
  } else if (e.estado === 'pergunta') {
    texto(elAviso, 'Resposta enviada: ' + letras[e.escolha]);
  } else if (e.estado === 'resultado') {
    if (e.escolha === null) {
      texto(elAviso, 'Sem resposta');
    } else if (e.acertou) {
      texto(elAviso, 'Acertou, mais ' + e.ganhou);
      elAviso.className = 'certo';
    } else {
      texto(elAviso, 'Errou');
      elAviso.className = 'errado';
    }
  } else if (e.estado === 'fim') {
    texto(elAviso, 'Fim da partida');
  } else {
    texto(elAviso, 'Aguarde o início');
  }

  const partes = [];
  if (e.total > 0 && e.estado !== 'aguardando') partes.push(e.posicao + ' de ' + e.total);
  if (e.equipe) partes.push(e.equipe);
  if (e.sequencia > 1) partes.push('sequência ' + e.sequencia);
  texto(elPosicao, partes.join('   '));
  texto(elPontos, e.nome + ': ' + e.pontos + ' pontos');
}