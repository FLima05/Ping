# Contributing to Ping

Contribuições bem-vindas! Ping é feito pela comunidade, pra comunidade.

## Como contribuir

### Reportar bug

1. Abre issue com título claro
2. Descreve: o que esperava vs o que aconteceu
3. Steps pra reproduzir
4. Screenshots/logs se tiver

### Sugerir feature

1. Abre issue como "Feature Request"
2. Explica o caso de uso
3. Por que seria útil pra educação

### Enviar código

1. **Fork** o repo
2. **Branch**: `git checkout -b feat/sua-feature`
3. **Code**: Faz a mudança
4. **Commit**: `git commit -m "feat: descrição curta"` (caveman mode OK)
5. **Push**: `git push origin feat/sua-feature`
6. **PR**: Abre PR, descreve o que mudou

### Adicionar novo tema

Duas formas de criar tema: pelo app, em `/criar-tema` (uso na sua própria instância, não precisa de PR); ou direto no repositório, do jeito abaixo, quando o tema é bom o bastante pra virar padrão pra todo mundo.

Cada tema é um arquivo JSON dentro de `quizzes/`. Cria o arquivo, roda o Ping localmente pra conferir que carregou sem erro, e abre PR.

`quizzes/algoritmos.json`:

```json
{
  "titulo": "Algoritmos",
  "descricao": "Lacos, condicionais e logica basica de programacao.",
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
- `descricao`: opcional, aparece embaixo do título na tela de escolher tema
- `id`: número único dentro do arquivo
- `enunciado`: a pergunta
- `alternativas`: de 2 a 6 opções
- `correta`: índice da alternativa certa, começando em 0
- `tempo`: segundos usados como referência da pontuação por rapidez
- `dobro`: opcional, faz a pergunta valer o dobro

O Ping valida os temas ao iniciar. Arquivo com erro é reportado linha a linha no terminal e ignorado, sem derrubar os outros. Tema pronto e revisado é a contribuição mais útil pro projeto agora.

## Código de Conduta

- Seja respeitoso
- Sem spam, sem auto-promoção
- Comunidade educa juntos
- Feedback construtivo sempre

## Dúvidas?

Abre uma discussion ou comenta na issue.

---

Obrigado por contribuir! 🙌
