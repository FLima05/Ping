# Ping

Quiz ao vivo para sala de aula. O professor projeta a tela do host, os alunos entram pelo celular lendo um QR code e respondem em botões grandes. Acerto pontua, quem responde mais rápido pontua mais.

Alternativa livre ao Kahoot, sem conta, sem licença e sem limite de participantes.

## Como colocar no ar

O Ping roda hospedado no Render, sempre. Não existe mais modo local com detecção de IP de rede ou túnel: essas duas formas geravam problema de rede diferente em cada escola e não valiam a complexidade. Uma instância na nuvem resolve pra qualquer rede, inclusive as que bloqueiam tráfego entre aparelhos.

Cada professor sobe a própria instância. Isso é importante: o Ping guarda a partida na memória e atende **uma turma por vez**. Duas turmas na mesma instância disputam o mesmo placar.

1. Faça um fork deste repositório.
2. Entre em `render.com` com a conta do GitHub.
3. `New`, `Web Service`, escolha o fork.
4. Runtime `Node`, Build Command `npm install`, Start Command `npm start`, Instance Type `Free`.
5. Em `Environment`, crie `CHAVE_HOST` com um valor aleatório seu.
6. `Deploy`. Sai um endereço fixo, tipo `https://seu-ping.onrender.com`.

Com o `render.yaml` do repositório, o Render preenche tudo isso sozinho e já gera a `CHAVE_HOST`.

Endereços:

- Projeção: `https://seu-ping.onrender.com/host?chave=SUA_CHAVE`
- Alunos: `https://seu-ping.onrender.com/play`, ou só o QR da tela

O que esperar do plano gratuito:

- O serviço dorme depois de 15 minutos sem tráfego e leva perto de um minuto para acordar. Abra a tela do host antes de a aula começar.
- Uma instância só, sem escala. Não ligue instância extra, senão cada aluno cai numa partida diferente.
- Reinício ou queda zera a partida em andamento.
- O relatório salvo em disco some no próximo deploy, mas o botão de baixar continua funcionando enquanto a partida estiver na memória.

Sem a `CHAVE_HOST`, qualquer pessoa com o endereço abre o `/host` e controla a partida. Configure antes de usar em aula.

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
| `CHAVE_HOST` | Exige `?chave=valor` para abrir a tela do host | vazio, tela aberta |

## Estrutura

```
Ping/
├── render.yaml
├── package.json
├── quizzes/
│   ├── c.json
│   ├── css.json
│   ├── git.json
│   ├── html.json
│   └── js.json
├── server.js
└── public/
    ├── host.html
    ├── play.html
    ├── css/
    │   ├── host.css
    │   └── play.css
    ├── img/
    │   ├── ping-logo.png
    │   └── ping-logo.svg
    └── js/
        ├── host.js
        └── play.js
```

Stack: Node com Express, WebSocket pela biblioteca `ws`, front em HTML, CSS e JavaScript puro. Sem framework e sem etapa de build.

## Limitações conhecidas

- Uma sala por instância, sem PIN
- Nada é salvo em banco, o placar vive na memória do servidor
- Empate não tem critério de desempate
- Não existe tela para criar ou editar perguntas, a edição é no arquivo JSON
- Perguntas e alternativas não são embaralhadas entre turmas

## Contribuir

Leia `CONTRIBUTING.md`. Banco de perguntas revisado, correção de texto e melhoria de acessibilidade são as contribuições mais úteis agora.

## Licença

GPL-3.0. Veja `LICENSE`.