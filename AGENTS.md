# Regras permanentes do projeto (definidas pelo dono do projeto)

- **Nunca modificar ou alterar nada criado/ajustado pelo dono do projeto.** Ao resolver bugs ou adicionar sistemas novos, preservar todo o conteúdo, balanceamento e configurações existentes do jogo (itens, encantamentos, classes, mapas, mobs, quests, shops, NPCs, gacha, eventos, etc.). Alterações só com permissão explícita.
- **Toda modificação feita aqui DEVE ser salva e permanecer**: ao final de qualquer trabalho, salvar com `npm run save` (commit local) e, quando aplicável, publicar com `npm run deploy` na raiz (typecheck → commit → push para `main`, que dispara o deploy no Railway).
- Estas regras valem para TUDO no jogo: backend, frontend, admin e banco de dados.

# Workflow

- Toda atualização de código DEVE terminar com deploy: rodar `npm run deploy` na raiz (faz typecheck, commit e push para `main`, que dispara o deploy no Railway).

# Backup do banco (proteção do conteúdo do dono)

- **Backup automático no servidor**: a cada alteração/criação/exclusão de conteúdo (admin: monstros, itens, mapas, classes, encantamentos, quests, lojas, NPCs, boosters, eventos, etc.) o backend gera um snapshot completo do banco em JSON (~5s depois da última alteração). Também gera snapshot a cada deploy (boot). Os snapshots ficam no VOLUME do Railway (`/app/backups`), persistente entre deploys; máximos `BACKUP_KEEP` (padrão 25).
- **ANTES de fazer qualquer ajuste, correção ou adicionar sistema que envolva o banco, SEMPRE**: puxar o snapshot mais recente com `npm run db:pull` (no backend; baixa do volume do Railway para `backend/backups/`). Isso garante que o trabalho parte do estado exato das configurações do dono e nunca as sobrescreve.
- Snapshot manual local (via túnel): `npm run db:backup`. Restaurar um snapshot (faz backup de segurança antes; idempotente): `npm run db:restore [<pasta>|--latest] [--yes]`.
- Backup e restore também podem ser feitos localmente a partir do volume: `npm run db:pull` baixa o mais recente; `npm run db:restore` restaura a partir de `backend/backups/`.
