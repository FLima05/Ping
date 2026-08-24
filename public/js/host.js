const letras = ['A', 'B', 'C', 'D', 'E', 'F'];
const rotulos = {
  aguardando: 'Iniciar',
  pergunta: 'Encerrar pergunta',
  resultado: 'Próxima pergunta',
  fim: 'Recomeçar'
};

const elNumero = document.getElementById('numero');
const elConexao = document.getElementById('conexao');
const elEnunciado = document.getElementById('enunciado');
const elAlternativas = document.getElementById('alternativas');
const elSecaoPlacar = document.getElementById('secao-placar');
const elPlacar = document.getElementById('placar');
const elContador = document.getElementById('contador');
const elAvancar = document.getElementById('avancar');

const chave = new URLSearchParams(location.search).get('chave') || '';
let ws = null;

function conectar() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.addEventListener('open', () => {
    elConexao.textContent = '';
    ws.send(JSON.stringify({ tipo: 'entrar_host', chave: chave }));
  });
  ws.addEventListener('message', (evento) => desenhar(JSON.parse(evento.data)));
  ws.addEventListener('close', () => {
    elConexao.textContent = 'reconectando';
    setTimeout(conectar, 2000);
  });
}

conectar();

// segura a conexao e evita o servico dormir por falta de trafego
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ tipo: 'ping' }));
}, 25000);

elAvancar.addEventListener('click', () => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ tipo: 'proxima' }));
});

function desenhar(e) {
  if (e.estado === 'pergunta') elNumero.textContent = 'Pergunta ' + e.numero + ' de ' + e.total;
  else if (e.estado === 'resultado') elNumero.textContent = 'Resultado ' + e.numero + ' de ' + e.total;
  else if (e.estado === 'fim') elNumero.textContent = 'Fim da partida';
  else elNumero.textContent = 'Sala aberta';

  if (e.estado === 'aguardando') elEnunciado.textContent = 'Aguardando jogadores';
  else if (e.estado === 'fim') elEnunciado.textContent = 'Placar final';
  else elEnunciado.textContent = e.enunciado;

  elAlternativas.innerHTML = '';
  e.alternativas.forEach((texto, i) => {
    const item = document.createElement('li');
    item.className = e.correta === i ? 'alternativa correta' : 'alternativa';
    item.textContent = letras[i] + '. ' + texto;
    elAlternativas.appendChild(item);
  });

  elPlacar.innerHTML = '';
  e.placar.forEach((linha, i) => {
    const item = document.createElement('li');
    const nome = document.createElement('span');
    nome.textContent = i + 1 + '. ' + linha.nome;
    const pontos = document.createElement('span');
    pontos.textContent = linha.pontos;
    item.appendChild(nome);
    item.appendChild(pontos);
    elPlacar.appendChild(item);
  });
  elSecaoPlacar.hidden = e.estado === 'pergunta';

  elContador.textContent = e.respondidas + ' de ' + e.conectados + ' responderam';
  elAvancar.textContent = rotulos[e.estado];
  elAvancar.disabled = false;
}