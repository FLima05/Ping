# Ping

Quiz ao vivo para sala de aula. O professor projeta a tela do host, os alunos entram pelo celular lendo um QR code e respondem em botões grandes. Acerto pontua, quem responde mais rápido pontua mais.

Feito para rodar na máquina do próprio professor, sem conta, sem nuvem obrigatória e sem licença paga.

## O que precisa

Node.js LTS instalado: https://nodejs.org

Só isso. Sem banco de dados, sem Docker, sem build.

Internet é necessária uma vez, para instalar o Node.js e baixar as dependências. Depois disso o Ping joga sem internet nenhuma. Veja a seção `Sem internet na instituição`.

## Como usar (professor)

1. Instale o Node.js LTS pelo link acima.
2. Baixe o Ping: botão `Code`, depois `Download ZIP`, e extraia a pasta.
3. Windows: clique duas vezes em `iniciar.bat`.
   Linux e macOS: abra o terminal na pasta e rode `./iniciar.sh`.
4. A tela do host abre sozinha no navegador. Projete essa tela.
5. Escolha o tema, mostre o QR para a turma e clique em `Iniciar`.

Na primeira execução o script baixa as dependências. Isso leva cerca de um minuto e só acontece uma vez.

## Como usar (terminal)

```bash
git clone https://github.com/ifelix081/ping.git
cd ping
npm install
npm run host
```

`npm run host` sobe o servidor e abre a tela do host. `npm start` sobe só o servidor.

Endereços:

- Host, tela projetada: `http://localhost:3000/host`
- Jogador, celular: `http://IP_DA_MAQUINA:3000/play`

O terminal imprime o endereço do jogador e um QR code já com o IP certo da rede.

## Como funciona a partida

1. `Sala aberta`: o host escolhe o tema e os alunos entram pelo QR e digitam o nome.
2. `Iniciar`: abre a primeira pergunta. O enunciado fica na projeção, o celular mostra só as alternativas.
3. A pergunta fecha quando todos que estavam na sala responderem. O host pode encerrar antes pelo botão.
4. `Resultado`: aparece a alternativa correta e o placar anima os pontos e a troca de posições.
5. `Próxima pergunta` até acabar o tema. No fim, `Recomeçar` zera a partida e libera trocar de tema.

Pontuação: acerto vale de 500 a 1000 pontos. O valor cai conforme a fração do tempo da pergunta que o aluno gastou para responder. Errar vale zero.

## Rede

Celular e computador precisam estar na mesma rede Wi-Fi. O QR resolve a digitação, não a rede.

Problemas comuns:

- **Firewall do Windows** pergunta na primeira execução. Marque rede privada, senão nenhum celular consegue entrar.
- **Wi-Fi da instituição com isolamento de cliente** bloqueia o celular de enxergar o computador. Não tem solução pelo código.
- **Rede de convidados** costuma ter o mesmo bloqueio.
- **VPN ou adaptador virtual** pode fazer o programa escolher o IP errado. Force o IP certo:

```bash
IP_LOCAL=192.168.0.15 npm run host
```

```powershell
$env:IP_LOCAL="192.168.0.15"; npm run host
```

Plano B que quase sempre funciona: criar a rede pelo celular do professor. Está explicado na seção abaixo.

## Sem internet na instituição

O Ping não usa internet para jogar. Depois de instalado, tudo acontece dentro da rede local: o servidor roda no computador do professor e os celulares falam direto com ele.

Se a instituição não tem Wi-Fi, ou o Wi-Fi bloqueia um aparelho de falar com o outro, o professor cria a rede pelo próprio celular:

1. No celular do professor, ligue o roteador Wi-Fi. Android: `Ponto de acesso e roteamento`. iPhone: `Acesso Pessoal`.
2. Conecte o computador nessa rede.
3. Rode o `iniciar.bat` ou o `./iniciar.sh`. O QR já aparece com o endereço novo.
4. Peça para a turma conectar na mesma rede e ler o QR.

Pontos que evitam susto:

- Ninguém gasta o pacote de dados do professor. O tráfego do jogo não sai da rede, vai do celular para o computador e volta.
- Alguns aparelhos só ligam o roteador com os dados móveis ativos. Pode ativar, o consumo do jogo continua perto de zero.
- Roteador de celular costuma aceitar de 8 a 10 aparelhos conectados. Turma maior que isso pede um roteador Wi-Fi comum, que funciona mesmo sem internet ligada nele.
- No Windows dá para criar a rede pelo próprio computador: `Configurações`, `Rede e Internet`, `Ponto de acesso móvel`. Assim o professor não depende do celular dele.

## Criar um tema novo

Cada tema é um arquivo JSON dentro de `quizzes/`. Crie o arquivo, salve e reinicie o Ping. O tema aparece sozinho na tela de abertura.

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
      "tempo": 20
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

Tema pronto e revisado é bem-vindo como contribuição. Veja `CONTRIBUTING.md`.

## Variáveis de ambiente

| Variável | Para que serve | Padrão |
| --- | --- | --- |
| `PORT` | Porta do servidor | `3000` |
| `IP_LOCAL` | Força o IP usado no QR e no link do jogador | detectado automaticamente |
| `CHAVE_HOST` | Exige `?chave=valor` para abrir a tela do host | vazio, tela aberta |

`CHAVE_HOST` importa quando o Ping está publicado na internet. Sem ela, qualquer pessoa com o endereço controla a partida.

## Publicar na internet (opcional)

Rodar local é o caminho recomendado: cada professor tem a própria instância, nada sai da sala e não existe custo.

Se quiser uma instância pública, o projeto sobe em qualquer hospedagem Node. No Render, plano free:

1. Faça um fork do repositório.
2. `New`, `Web Service`, escolha o fork.
3. Build Command `npm install`, Start Command `npm start`.
4. Em `Environment`, crie `CHAVE_HOST` com um valor aleatório.

Limites do que está publicado hoje:

- Sala única. Uma instância atende uma turma por vez, duas turmas simultâneas dividem o mesmo placar.
- O plano free dorme por falta de tráfego e demora perto de um minuto para acordar. Abra a tela do host antes da aula começar.
- O estado mora em memória. Reinício ou queda do serviço zera a partida.

## Estrutura

```
Ping/
├── iniciar.bat
├── iniciar.sh
├── package.json
├── quizzes/
│   ├── git.json
│   ├── html.json
│   ├── css.json
│   └── c.json
├── server.js
└── public/
    ├── host.html
    ├── play.html
    ├── css/
    │   ├── host.css
    │   └── play.css
    └── js/
        ├── host.js
        └── play.js
```

Stack: Node com Express, WebSocket pela biblioteca `ws`, front em HTML, CSS e JavaScript puro. Sem framework e sem etapa de build.

## Limitações conhecidas

- Uma sala por instância, sem PIN
- Nada é salvo em disco, o placar vive só na memória do servidor
- Empate não tem critério de desempate
- Não existe tela para criar ou editar perguntas, a edição é no arquivo JSON
- Sem relatório de desempenho por aluno depois da partida

## Contribuir

Leia `CONTRIBUTING.md`. Banco de perguntas revisado, correção de texto e melhoria de acessibilidade são as contribuições mais úteis agora.

## Licença

GPL-3.0. Veja `LICENSE`.