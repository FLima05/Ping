const letras = ['A', 'B', 'C', 'D', 'E', 'F'];

const elEntrada = document.getElementById('entrada');
const elJogo = document.getElementById('jogo');
const elNome = document.getElementById('nome');
const elEntrar = document.getElementById('entrar');
const elAviso = document.getElementById('aviso');
const elAlternativas = document.getElementById('alternativas');
const elPontos = document.getElementById('pontos');

const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
ws.addEventListener('message', (evento) => desenhar(JSON.parse(evento.data)));

elEntrar.addEventListener('click', () => {
  const nome = elNome.value.trim();
  if (!nome) return;
  ws.send(JSON.stringify({ tipo: 'entrar_jogador', nome: nome }));
  elEntrada.hidden = true;
  elJogo.hidden = false;
});

function desenhar(e) {
  elAlternativas.innerHTML = '';
  elAviso.className = '';

  if (e.estado === 'pergunta' && e.escolha === null && e.alternativas.length === 0) {
    elAviso.textContent = 'Entrou no meio da pergunta, aguarde a próxima';
  } else if (e.estado === 'pergunta' && e.escolha === null) {
    elAviso.textContent = '';
    e.alternativas.forEach((texto, i) => {
      const botao = document.createElement('button');
      botao.className = 'resposta';
      botao.textContent = letras[i] + '. ' + texto;
      botao.addEventListener('click', () => ws.send(JSON.stringify({ tipo: 'responder', indice: i })));
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

  elPontos.textContent = e.nome + ': ' + e.pontos + ' pontos';
}