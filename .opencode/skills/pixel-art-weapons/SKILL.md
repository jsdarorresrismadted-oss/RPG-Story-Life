---
name: pixel-art-weapons
description: Guia de geração de sprites de armas 64x64 (16x16 interno) para o jogo RPG-Story-Life-Text. Use quando for desenhar ou modificar ícones de adaga, espada, machado, cajado, arco ou outros equipamentos no pixelArt.ts.
---

# Pixel Art - Armas

Guia específico para sprites de armas. Use junto com `pixel-art-essentials`.

## Arquivos do projeto

- Motor de desenho: `backend/src/core/ai/pixelArt.ts` (Canvas16, funções draw*, paletas)
- Paletas de referência: `backend/src/core/ai/referencePalette.ts`
- Orquestrador: `backend/src/core/ai/itemGenerator.ts`
- Referência visual: `Icons/references/weapon-pack.png`

## DIMENSÕES MÁXIMAS POR ARMA (em 64×64)

| Arma    | Altura   | Largura  |
| ------- | -------- | -------- |
| Adaga   | 40-48 px | 12-18 px |
| Espada  | 48-56 px | 14-22 px |
| Machado | 40-50 px | 24-34 px |
| Cajado  | 52-58 px | 12-18 px |
| Arco    | 42-52 px | 28-40 px |

Nunca deixe uma arma ocupar 90% da imagem e outra 40%.

## SILHUETAS (reconhecíveis SÓ pela cor escura)

- **Adaga**: curta, compacta, lâmina fina, ponta afiada, guarda pequena, cabo curto
- **Espada**: lâmina longa definida, guarda horizontal visível, cabo menor que a lâmina
- **Machado**: cabeça larga e pesada, lâmina separada do cabo, formato agressivo, cabo estreito/longo
- **Cajado**: cabo longo e fino, elemento mágico concentrado na ponta, silhueta vertical
- **Arco**: corpo curvo, duas extremidades pontiagudas, corda fina CONECTANDO e SEPARADA do corpo

## LÂMINAS

- Construir com degraus de pixels
- Deve ter: ponta definida, fio, dorso, base, separação da guarda, sombra lateral, área de luz, reflexos
- Afinar progressivamente em direção à ponta
- Pequenos clusters de pixels para volume metálico

## PARTES DE UMA ESPADA

ponta → lâmina → fio → dorso → guarda → cabo → pomo

## CABO

- Sempre VISÍVEL e CONTRASTANTE com a lâmina
- Usar tom mais escuro que a lâmina
- Textura: pequenos segmentos de luz ao longo do comprimento

## ARCO (cuidado especial)

- Pedir explicitamente: "arco recurvado com silhueta claramente identificável, duas extremidades pontiagudas, corda fina conectando as extremidades e pequena separação entre a corda e o corpo do arco"
- A corda PRECISA aparecer

## MACHADO (cuidado especial)

- Pedir explicitamente: "cabeça do machado claramente separada do cabo, lâmina larga e assimétrica, fio da lâmina claramente definido, cabo estreito e longo"
- Nunca pode parecer uma espada curta

## PALETAS POR TEMA (usar em PALETTES)

- steel, iron: aço azulado
- fire, lightning: vermelho → laranja → amarelo
- ice: azul gelo
- shadow, dark: roxo escuro
- nature: verde
- holy, gold: dourado
- arcane: magenta

## VARIAÇÃO POR RARIDADE

- **Comum**: extremamente simples, 5-6 cores
- **Rara**: mais detalhes, pequenos brilhos
- **Lendária**: efeitos de fogo, gelo, raio, energia — mas respeitando o mesmo pixel art

## VERIFICAÇÃO FINAL

1. Silhueta reconhecível só com cor escura?
2. Degraus consistentes nas diagonais?
3. Contorno ~1px adaptado ao tema?
4. Iluminação ↖ uniforme?
5. Cabo contrasta com lâmina?
6. Paleta 5-7 cores com contraste?
7. Clusters, não ruído?
8. Dimensões dentro da tabela?
9. Identidade visual original preservada?
