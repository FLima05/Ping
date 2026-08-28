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

Cria arquivo em `themes/seu-tema.json`:

```json
{
  "name": "Python",
  "questions": [
    {
      "id": 1,
      "text": "Pergunta aqui?",
      "options": ["Opção A", "Opção B", "Opção C"],
      "correct": 0,
      "time": 15
    }
  ]
}
```

Push e abre PR. Sistema carrega automático.

## Código de Conduta

- Seja respeitoso
- Sem spam, sem auto-promoção
- Comunidade educa juntos
- Feedback construtivo sempre

## Dúvidas?

Abre uma discussion ou comenta na issue.

---

Obrigado por contribuir! 🙌
