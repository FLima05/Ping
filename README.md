# Ping

Quiz ao vivo open source pra educação. Tipo Kahoot, mas feito pra comunidade.

## O que é Ping

Plataforma de quiz em tempo real. Host projeta perguntas, jogadores respondem pelo celular. Pontuação com bônus por rapidez, placar em pódio.

Feito pra oficinas, aulas, eventos. Sem paywall. Sem limite de sala. Community-driven.

## Features

- Quiz ao vivo com tempo real
- Placar com animação de ranking
- Temas em JSON (Git, HTML, CSS, C, etc)
- Responsive (desktop host, mobile player)
- QR code pra entrada rápida
- Sem banco de dados (simplicidade)

## Como rodar local

**Requisitos:** Node.js 18+

```bash
git clone https://github.com/i-barbosa/Ping.git
cd Ping
npm install
npm start
```

Acessa http://localhost:3000/host (projeção) e http://localhost:3000/play (jogador).

## Como usar

**Host:**
1. Vai pra `/host`
2. Seleciona tema (Git, HTML, CSS)
3. Começa o quiz
4. Vê respostas em tempo real
5. Avança pra próxima pergunta

**Jogador:**
1. Escaneia QR code ou acessa `/play`
2. Digita nome
3. Responde as perguntas
4. Vê ranking final

## Adicionar novo tema

1. Cria arquivo em `themes/seu-tema.json`:

```json
{
  "name": "Python",
  "questions": [
    {
      "id": 1,
      "text": "Qual é a sintaxe correta?",
      "options": ["A) print('oi')", "B) Print('oi')", "C) PRINT('oi')"],
      "correct": 0,
      "time": 15
    }
  ]
}
```

2. Sistema carrega automático.

## Contribuir

Fork → branch (feat/seu-nome) → commit → PR.

Tudo é bem-vindo: novos temas, features, bugfix, melhorias UX.

Comenta teu PR pra explicar o que mudou.

## Deploy

Tá rodando em Render (render.com).

Deploy próprio: `npm start` e aponta domínio.

## Tech Stack

- Node.js + Express
- WebSocket (ws)
- HTML/CSS/JS puro
- JSON themes

## License

GPL-3.0. Vê LICENSE pra detalhes.

---

Feito pela comunidade FICR/ADS. Mantido com ❤️.
