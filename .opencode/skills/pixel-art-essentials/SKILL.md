---
name: pixel-art-essentials
description: Regras compartilhadas de pixel art para o jogo RPG-Story-Life-Text. Use SEMPRE antes de criar ou modificar qualquer sprite de arma, item ou skill. Cobre contorno, paleta, iluminação, clusters, degraus e consistência de estilo.
---

# Pixel Art Essentials

Regras inamovíveis para TODO sprite gerado no projeto RPG-Story-Life-Text. Estas regras se aplicam a qualquer sprite de arma, item ou skill. NUNCA quebre estas regras, independentemente do que for pedido.

## RESOLUÇÃO E ESCALA

- Resultado final: **64×64 pixels**
- Construção: sprites **16×16** ampliados 4× (nearest neighbor)
- A imagem deve ser reconhecível quando reduzida de volta a **16×16**
- NÃO adicionar detalhes que só seriam possíveis em imagem grande

## PROIBIDO

- Anti-aliasing, blur, suavização, gradientes digitais
- Aparência 3D, pintura, linhas vetoriais, efeitos fotográficos
- Pixels aleatórios
- Contorno preto puro `#000`
- Glow suave
- Detalhes excessivos que quebram a leitura em 16×16

## OBRIGATÓRIO

- **Pixel clusters** bem organizados (cada pixel tem função visual)
- **Degraus de pixels consistentes** nas diagonais
- Bordas nítidas
- Contorno de ~1px adaptado à temperatura do tema

## PALETA (5-7 cores)

1. 1 contorno (escuro, adaptado ao tema)
2. 2 sombras (profunda + média)
3. 1-2 cores principais
4. 1-2 cores de iluminação
5. 1 brilho máximo

Cores com contraste suficiente para separar claramente cada parte da arma.

## ILUMINAÇÃO

- Única direção para toda a coleção: **canto superior esquerdo ↖**
- Partes voltadas à luz = mais claras; opostas = mais escuras
- Brilhos pequenos e estratégicos

## ORDEM DE CONSTRUÇÃO

1. Silhueta → 2. Contorno → 3. Forma estrutural → 4. Sombras → 5. Cor base → 6. Luz → 7. Brilho → 8. Detalhes → 9. Efeitos

## MATERIAIS

- **Metal**: sombras frias, cor metálica intermediária, luz forte, pequenos pixels brancos de reflexo
- **Madeira**: tons escuros/médios, segmentos de luz ao longo do cabo
- **Cristal**: forte contraste sombra/brilho, pontos quase brancos
- **Energia**: núcleo claro, área intermediária saturada, bordas escuras

## CONSISTÊNCIA (STYLE LOCK)

Todas as armas devem parecer do mesmo artista:
- mesma escala, densidade de pixels, espessura de contorno
- mesma iluminação, sombreamento, acabamento
- mesma proporção visual, nível de simplicidade

## EFEITOS MÁGICOS

- Construídos com pixels: clusters 1×1, 2×1, 2×2
- Fogo: fora para dentro (vermelho escuro → vermelho → laranja → amarelo → amarelo claro), pontas irregulares com degraus
- Nunca esconder a silhueta principal
