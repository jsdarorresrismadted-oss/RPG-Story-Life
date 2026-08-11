---
name: pixel-art-review
description: Avalia e critica sprites de pixel art contra os padrões do projeto RPG-Story-Life-Text e a referência (Icons/references/weapon-pack.png). Use quando precisar revisar qualidade, comparar com o alvo ou decidir se um sprite está pronto.
---

# Pixel Art - Revisão

Avalie sprites contra padrões profissionais e o sprite de referência. Use junto com `pixel-art-essentials`.

## Como revisar

1. Examine os pixels em 1× (nível 64×64) e em 4× (nível 16×16) — se possível, gere preview com `npx tsx tools/previewSprites.ts`
2. Compare com a referência `Icons/references/weapon-pack.png` e com as outras armas da coleção
3. Avalie CADA arma individualmente

## CRITÉRIOS (pontue 1-10)

1. **Silhueta** — reconhecível apenas pelo contorno?
2. **Pixels limpos** — sem anti-aliasing, blur, gradientes digitais
3. **Clusters** — grupos organizados, sem ruído aleatório
4. **Degraus** — diagonais consistentes
5. **Contorno** — ~1px, adaptado ao tema (não preto puro)
6. **Volume** — sombra/base/luz/brilho criam forma
7. **Iluminação** — direção ↖ uniforme, brilhos estratégicos
8. **Proporções** — dimensões dentro da tabela
9. **Cabo contrastante** — visível e diferente da lâmina
10. **Consistência** — mesmo estilo/qualidade da coleção

## TABELA DE DIMENSÕES (em 64×64)

| Arma    | Altura   | Largura  |
| ------- | -------- | -------- |
| Adaga   | 40-48 px | 12-18 px |
| Espada  | 48-56 px | 14-22 px |
| Machado | 40-50 px | 24-34 px |
| Cajado  | 52-58 px | 12-18 px |
| Arco    | 42-52 px | 28-40 px |

## Formato de feedback

Para CADA arma:
- Nota 1-10 por critério
- **Pontos fortes**: o que está certo
- **Problemas**: o que está errado e COMO corrigir (específico, pixel a pixel se possível)
- **Correções priorizadas**: lista ordenada por impacto

## Regras de feedback

- Específico: "a guarda tem contorno de 2px na linha y=9" em vez de "a guarda está gorda"
- Prioridade: CLAREZA > SILHUETA > PIXEL LIMPO > VOLUME > CORES > DETALHES > EFEITOS
- Nota média < 7 = arma precisa de revisão
- Nunca sugerir detalhes que quebrem a leitura em 16×16
- Nunca sugerir transformar em ilustração — o estilo é pixel art limpo

## Checklist de APROVAÇÃO

Um sprite está pronto quando:
- [ ] Silhueta única e reconhecível
- [ ] Sem violações de pixel art (essentials)
- [ ] Iluminação ↖ consistente com a coleção
- [ ] Nota média ≥ 7
- [ ] Dimensões dentro da tabela
- [ ] Cabo contrastante visível
