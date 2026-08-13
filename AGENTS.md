# Regras permanentes do projeto (definidas pelo dono do projeto)

- **Nunca modificar ou alterar nada criado/ajustado pelo dono do projeto.** Ao resolver bugs ou adicionar sistemas novos, preservar todo o conteúdo, balanceamento e configurações existentes do jogo (itens, encantamentos, classes, mapas, mobs, quests, shops, NPCs, gacha, eventos, etc.). Alterações só com permissão explícita.
- **Toda modificação feita aqui DEVE ser salva e permanecer**: ao final de qualquer trabalho, salvar com `npm run save` (commit local) e, quando aplicável, publicar com `npm run deploy` na raiz (typecheck → commit → push para `main`, que dispara o deploy no Railway).
- Estas regras valem para TUDO no jogo: backend, frontend, admin e banco de dados.

# Workflow

- Toda atualização de código DEVE terminar com deploy: rodar `npm run deploy` na raiz (faz typecheck, commit e push para `main`, que dispara o deploy no Railway).
