const el = (id) => document.getElementById(id);
const elAbas = document.querySelectorAll('.aba');
const elFormEntrar = el('form-entrar');
const elFormCriar = el('form-criar');
const elErro = el('erro');

elAbas.forEach((aba) => {
  aba.addEventListener('click', () => {
    elAbas.forEach((a) => a.classList.toggle('escolhida', a === aba));
    elFormEntrar.hidden = aba.dataset.aba !== 'entrar';
    elFormCriar.hidden = aba.dataset.aba !== 'criar';
    elErro.hidden = true;
  });
});

function mostrarErro(mensagem) {
  elErro.textContent = mensagem;
  elErro.hidden = false;
}

async function enviar(rota, corpo) {
  const resposta = await fetch(rota, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || 'Algo deu errado, tenta de novo');
  return dados;
}

elFormEntrar.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  try {
    await enviar('/api/entrar', {
      email: el('entrar-email').value.trim(),
      senha: el('entrar-senha').value
    });
    location.href = '/host';
  } catch (erro) {
    mostrarErro(erro.message);
  }
});

elFormCriar.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  try {
    await enviar('/api/criar-conta', {
      nome: el('criar-nome').value.trim(),
      email: el('criar-email').value.trim(),
      senha: el('criar-senha').value
    });
    location.href = '/host';
  } catch (erro) {
    mostrarErro(erro.message);
  }
});
