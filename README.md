# Ping

Quiz ao vivo para sala de aula. O professor projeta a tela do host, os alunos entram pelo celular lendo um QR code e respondem em botões grandes. Acerto pontua, quem responde mais rápido pontua mais.

Alternativa livre ao Kahoot, sem conta, sem licença e sem limite de participantes.

## Como colocar no ar

O Ping roda hospedado no Render, sempre. Não existe mais modo local com detecção de IP de rede ou túnel: essas duas formas geravam problema de rede diferente em cada escola e não valiam a complexidade. Uma instância na nuvem resolve pra qualquer rede, inclusive as que bloqueiam tráfego entre aparelhos.

A tela do host agora exige login de professor (cadastro simples, com email e senha, guardado num Postgres). Isso substituiu a antiga `CHAVE_HOST` na URL.

Precisa de um banco Postgres antes de fazer o deploy. O do próprio Render expira em 30 dias no plano grátis, então use um separado que não expira:

1. Crie um projeto grátis em [neon.tech](https://neon.tech) ou [supabase.com](https://supabase.com).
2. Copie a connection string (Neon: botão `Connect`, escolha `Direct connection`).

Com o banco pronto:

3. Faça um fork deste repositório.
4. Entre em `render.com` com a conta do GitHub.
5. `New`, `Web Service`, escolha o fork. Com o `render.yaml` do repositório, o Render já preenche Runtime, Build e Start Command sozinho, e gera a `SESSAO_SEGREDO` automaticamente.
6. Em `Environment`, cole a connection string do passo 2 em `DATABASE_URL`.
7. `Deploy`. Sai um endereço fixo, tipo `https://seu-ping.onrender.com`.

Cada professor sobe a própria instância. Isso é importante: o Ping guarda a partida em andamento na memória e atende **uma turma por vez**. Duas turmas na mesma instância disputam o mesmo placar. Contas de professor, por outro lado, ficam no Postgres e sobrevivem a reinício e deploy.

Endereços:

- Login: `https://seu-ping.onrender.com/entrar`
- Projeção: `https://seu-ping.onrender.com/host`
- Alunos: `https://seu-ping.onrender.com/play`, ou só o QR da tela

O que esperar do plano gratuito:

- O serviço dorme depois de 15 minutos sem tráfego e leva perto de um minuto para acordar. Abra a tela do host antes de a aula começar.
- Uma instância só, sem escala. Não ligue instância extra, senão cada aluno cai numa partida diferente.
- Reinício ou queda zera a **partida em andamento**, mas não a conta do professor nem o histórico salvo no banco.
- O relatório salvo em disco some no próximo deploy, mas o botão de baixar continua funcionando enquanto a partida estiver na memória.

## Desenvolvimento local

Pra contribuir com código ou testar mudança antes de subir pro Render:

```bash
git clone https://github.com/i-barbosa/Ping.git
cd Ping
npm install
npm start
```

Abre em `http://localhost:3000`. Isso é só pra desenvolvimento — pra usar em aula de verdade, hospede no Render (acima). Não existe mais modo de rede local com QR apontando pro IP da máquina.

## Como funciona a partida

1. `Sala aberta`: o professor escolhe o tema e o modo, individual ou em equipes. Os alunos entram pelo QR e digitam o nome, aparecendo na tela conforme entram.
2. Em modo equipes, `Sortear equipes` distribui os presentes, e clicar no nome do aluno troca a equipe dele na mão.
3. `Iniciar`: abre a primeira pergunta. O enunciado fica na projeção, o celular mostra só as alternativas.
4. A pergunta fecha quando todos que estavam na sala responderem. O professor pode encerrar antes pelo botão.
5. `Resultado`: aparece a alternativa correta, quantos marcaram cada opção, quem acertou primeiro, e o placar anima os pontos e a troca de posições. A projeção mostra o top 3.
6. `Próxima pergunta` até acabar o tema. No fim, o pódio é revelado do terceiro para o primeiro, com link para baixar o relatório. `Recomeçar` zera e libera trocar de tema.

Pontuação: acerto vale de 500 a 1000 pontos, caindo conforme a fração do tempo gasta. Pergunta marcada como `dobro` vale o dobro. Acertos seguidos rendem um emblema de sequência na tela, mas não multiplicam mais pontos. Jogador pode apostar uma % dos pontos atuais antes de responder: acerta e ganha o valor apostado a mais, erra e perde.

## Relatório da partida

No fim de cada partida o Ping gera um CSV com nome, equipe, pontos, acertos, maior sequência e o resultado de cada pergunta, marcado como `C` para certo, `X` para errado e `-` para sem resposta.

O arquivo fica em `relatorios/` na máquina que roda o servidor, e também pode ser baixado pelo link que aparece na tela do host.

O relatório tem nome de aluno. Ele é seu, fica com você, e é você quem decide o que fazer com ele. A pasta `relatorios/` já está no `.gitignore` para não subir para o GitHub sem querer.

## Criar um tema novo

Cada tema é um arquivo JSON dentro de `quizzes/`. Crie o arquivo, reinicie o Ping e ele aparece sozinho na tela de abertura.

`quizzes/algoritmos.json`:

```json
{
  "titulo": "Algoritmos",
  "perguntas": [
    {
      "id": 1,
      "enunciado": "O que um laco de repeticao faz?",
      "alternativas": [
        "Executa um bloco varias vezes",
        "Declara uma variavel",
        "Encerra o programa",
        "Importa uma biblioteca"
      ],
      "correta": 0,
      "tempo": 20,
      "dobro": false
    }
  ]
}
```

Campos:

- `titulo`: nome que aparece na lista de temas
- `id`: número único dentro do arquivo
- `enunciado`: a pergunta
- `alternativas`: de 2 a 6 opções
- `correta`: índice da alternativa certa, começando em 0
- `tempo`: segundos usados como referência da pontuação por rapidez
- `dobro`: opcional, faz a pergunta valer o dobro

O Ping valida os temas ao iniciar. Arquivo com erro é reportado linha a linha no terminal e ignorado, sem derrubar os outros.

Tema pronto e revisado é a contribuição mais útil para o projeto. Veja `CONTRIBUTING.md`.

## Variáveis de ambiente

| Variável | Para que serve | Padrão |
| --- | --- | --- |
| `PORT` | Porta do servidor | `3000` |
| `DATABASE_URL` | Connection string do Postgres (contas de professor) | obrigatória, sem ela o servidor não sobe |
| `SESSAO_SEGREDO` | Assina o cookie de login. Sem valor fixo, todo mundo desloga a cada reinício | aleatório a cada boot |

## Estrutura

```
Ping/
├── render.yaml
├── package.json
├── .env.example
├── db.js
├── auth.js
├── server.js
├── quizzes/
│   ├── c.json
│   ├── css.json
│   ├── git.json
│   ├── html.json
│   └── js.json
└── public/
    ├── host.html
    ├── play.html
    ├── entrar.html
    ├── css/
    │   ├── host.css
    │   ├── play.css
    │   └── auth.css
    ├── img/
    │   ├── ping-logo.png
    │   └── ping-logo.svg
    └── js/
        ├── host.js
        ├── play.js
        └── auth.js
```

Stack: Node com Express, WebSocket pela biblioteca `ws`, Postgres pela `pg`, senha com `bcryptjs`, front em HTML, CSS e JavaScript puro. Sem framework e sem etapa de build.

## Limitações conhecidas

- Uma sala por instância, sem PIN
- A partida em si não é salva em banco, o placar vive na memória do servidor. Só a conta do professor fica no Postgres
- Empate não tem critério de desempate
- Não existe tela para criar ou editar perguntas, a edição é no arquivo JSON
- Perguntas e alternativas não são embaralhadas entre turmas

## Contribuir

Leia `CONTRIBUTING.md`. Banco de perguntas revisado, correção de texto e melhoria de acessibilidade são as contribuições mais úteis agora.

## Licença

GPL-3.0. Veja `LICENSE`.