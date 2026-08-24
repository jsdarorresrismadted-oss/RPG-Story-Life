# RPG Story Life v2 - Nova Arquitetura

## 🎯 Visão Geral

Rewrite completo do RPG Story Life com arquitetura moderna, IA Master autônoma 24/7, e foco em performance, escalabilidade e manutenibilidade.

## 🏗️ Arquitetura

```
rpg-story-life-v2/
├── packages/
│   ├── shared/          # Types, schemas (Zod), constants - COMPARTILHADO
│   ├── database/        # Prisma schema v2, migrations, seed
│   ├── backend/         # Fastify + TypeScript + Socket.io + AI Master
│   ├── frontend/        # React 18 + Vite + Phaser 3 (Game Client)
│   └── admin/           # React 18 + Vite + shadcn/ui (Admin Panel)
├── docker-compose.yml
├── Dockerfile
├── turbo.json
└── package.json
```

## 🤖 IA Master - Cérebro Central

**100% Autônomo, 24/7, Sem Start/Pause/Stop**

### Loop Contínuo:
```
OBSERVAR → ANALISAR → EXECUTAR → VALIDAR → SALVAR → CONTINUAR
```

### Capacidades:
- **World Builder**: Cria Lore, Mapas, Regiões, Facções, Deuses, Conflitos
- **Content Generator**: Monstros, NPCs, Quests, Itens, Crafts, Sets, Bosses
- **Game Master**: Balanceamento, Auditoria, Proteção de Quests, Economia
- **IA Chat**: Interface unificada para admins e jogadores

### Provider Chain (Free 24/7):
1. **Groq** (Primário) - Llama 3.3 70B, 30 RPM, 500K tokens/dia, LPU, zero cold start
2. **Cerebras** (Fallback) - Llama 3.1 70B, Free tier, velocidade extrema
3. **Together AI** (Opcional) - 60 RPM, 200+ modelos

## 🎮 Sistemas de Jogo

### Dois Pilares de Progressão:
1. **Craft em Cadeia** (Modelo NSOD): Monstro → Drop → Quest → Material → Item Intermediário → Merge → Componente → Item Final
2. **Progressão por Tiers** (Modelo Exalted Apotheosis): Boss → Quest → Insígnia → Merge → Tier 1 → Tier 2 → Item Final

### Sistema de Sets (3/3):
- **Elmo + Armadura + Capa** = Set Effect ativo
- **Boosters = apenas números** (HP, Def, Mana, CDR, XP, Gold, Drop)
- **Sets = efeitos especiais** (Proc, Shield, Lifesteal, Transform, Exec, Reflect, etc)
- **Boosters ofensivos SOMENTE em armas**

### Boosters por Slot:
| Slot | Tipos | Cap Mythic/Limited |
|------|-------|-------------------|
| Arma | Ofensivos (Dano, Crit, Pen, Lifesteal) | 51% / 250% |
| Armadura | HP, Def, Regen, Red. Dano, Resistências | 30% / 50% |
| Elmo | Dodge, Def, Res. Crítico/DoT/Debuff/CC | 30% / 50% |
| Capa | Mana, Regen, CDR, XP, Gold, Drop | 30% / 50% |

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| **Monorepo** | Turborepo + pnpm |
| **Database** | PostgreSQL 16 + Prisma ORM |
| **Backend** | Fastify + TypeScript + Socket.io + Zod |
| **Frontend (Game)** | React 18 + Vite + Phaser 3 + Zustand + TanStack Query |
| **Admin Panel** | React 18 + Vite + shadcn/ui + TanStack Query |
| **AI** | Groq (primário) + Cerebras (fallback) via HF Providers |
| **Auth** | JWT + HttpOnly Cookies + Refresh Tokens |
| **Real-time** | Socket.io |
| **Deploy** | Docker + Railway/Fly.io |

## 🚀 Quick Start

```bash
# 1. Clone e entre no diretório
cd rpg-story-life-v2

# 2. Instale dependências
pnpm install

# 3. Configure variáveis de ambiente
cp .env.example .env
# Edite .env com suas chaves (GROQ_API_KEY, HF_TOKEN, DATABASE_URL, etc.)

# 3. Suba o banco
docker-compose up -d postgres

# 4. Gere o Prisma Client
pnpm db:generate

# 5. Rode migrations e seed
pnpm db:push && pnpm db:seed

# 6. Inicie tudo em desenvolvimento
pnpm dev
```

### URLs:
- **Game**: http://localhost:5173
- **Admin**: http://localhost:5174
- **API**: http://localhost:3000
- **Health**: http://localhost:3000/health

## 🔑 Variáveis de Ambiente Obrigatórias

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rpg_story_life

# Auth
JWT_SECRET=sua-chave-super-secreta-aqui
COOKIE_SECRET=outra-chave-secreta-aqui

# AI Providers (Free 24/7)
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxx
HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxx
TOGETHER_API_KEY=sk_xxxxxxxxxxxxx  # Opcional

# App
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

## 🐳 Docker

```bash
# Desenvolvimento
docker-compose up -d

# Produção
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## 📦 Estrutura de Pacotes

### @rpg/shared
- Zod schemas para validação (Item, NPC, Quest, Map, Monster, Craft, Set, etc.)
- Constants (Raridades, Tipos, Elementos, Boosters, Set Effects)
- Types TypeScript compartilhados

### @rpg/database
- Prisma Schema v2 (limpo, relations corretas)
- Models: User, Character, Item, NPC, Quest, Map, Monster, Craft, Set, Event, WorldBoss, Guild, etc.
- Seed com starter items, classes, NPCs, enchantments, boosters

### @rpg/backend
- Fastify + TypeScript + Zod validation
- AI Master autônomo (loop contínuo 5s)
- Socket.io para real-time (combat, chat, AI events)
- JWT Auth + HttpOnly cookies + Refresh tokens
- AI Providers chain: Groq → Cerebras (HF Providers)
- AI Master Chat unificado (Admin + Players)

### @rpg/frontend (Game Client)
- React 18 + Vite + Phaser 3 (Canvas/WebGL)
- Phaser Scene: Map, Player, NPCs, Monsters, Combat
- Zustand (Auth, UI) + TanStack Query (Server state)
- Socket.io client (Combat real-time, Chat, AI events)

### @rpg/admin (Admin Panel)
- React 18 + Vite + shadcn/ui + TanStack Query
- CRUDs completos: Items, NPCs, Quests, Maps, Monsters, Crafts, Events, World Bosses, Guilds, Classes, etc.
- AI Master Chat integrado (executa actions reais via [ACTION] blocks)
- AI Master Control: Start/Pause/Stop + Logs em tempo real
- Dashboard com stats e AI Master control

## 🤖 IA Master - Como Funciona

### Loop Autônomo (5s):
```typescript
while (isRunning) {
  // 1. OBSERVAR - getGameStateSummary()
  // 2. ANALISAR - buildAutonomousPrompt(lore, state)
  // 3. EXECUTAR - callHFProviders(prompt) → parse [ACTION] blocks
  // 4. EXECUTAR - executeAiAction() → Prisma operations
  // 5. VALIDAR → SALVAR → CONTINUAR
  await sleep(5000);
}
```

### Action Types Suportados:
```json
{
  "action": "create_lore", "lore": "História do mundo..."
}
{"action": "create_content", "type": "map|npc|quest|item|monster|craft|boss|set|event", "description": "..."}
{"action": "delete", "target": "maps|monsters|npcs|quests|items", "filter": "all"}
{"action": "delete_one", "target": "maps", "name": "Floresta Sombria"}
{"action": "list", "target": "npcs"}
{"action": "analyze_and_plan": {}}
```

### Protegidos (NUNCA deletados):
- Encantamentos
- Itens iniciantes (Adaga, Cajado, Espada, Armadura, Capacete, Capa, Lança, Martelo, Poções)
- Classes iniciais
- Config do Gacha
- Itens do Gacha

## 🎮 Frontend - Game Client (Phaser 3)

### GameScene (Phaser.Scene):
- Tilemap com collision layers
- Player com WASD/cursors + animations
- NPCs interativos (Shop, Quest, Dialogue, Craft)
- Monsters com AI e combat system
- Socket.io para combat real-time + chat

## 🛡️ Admin Panel - Recursos

### CRUDs Completos:
- **Items** (Weapon, Armor, Helm, Cape, Ring, Necklace, Consumable, Material)
- **NPCs** (Vendor, Shop, Enchantments, Classes, Quest Giver, Dialogue, Travel, Guild)
- **Quests** (Main, Side, Event, Daily, Weekly, Guild, Craft, Exploration)
- **Maps** (Normal, Raid, Dungeon, Arena, City, Guild Hall, Event, Secret)
- **Monsters** (Normal, Elite, Boss, Raid Boss, World Boss)
- **Classes** (Starter, VIP, Custom)
- **Skills/Passives/Effects**
- **Enchantments** (6 categorias, 150 levels)
- **Shops/Event Shops/Guild Shops**
- **Events/World Bosses/Seasons**
- **Guilds/Guild Shops/Guild Quests**
- **Boostes/Gacha Config**
- **Patch Notes/Achievements/Titles**

### AI Master Hub:
- **Chat Unificado** (Admin + IA Master)
- **Execução Real** via `[ACTION]` blocks
- **Logs em Tempo Real** (WebSocket)
- **Controle**: Iniciar/Pausar/Parar (legado - novo é 100% autônomo)

## 🔄 CI/CD

```yaml
# .github/workflows/ci.yml
# - Lint + Typecheck (shared, database, backend, frontend, admin)
# - Testes unitários
# - Build Docker multi-stage
# - Deploy Railway/Fly.io
```

## 📝 Convenções

### Commits:
```
feat: nova funcionalidade
fix: correção de bug
refactor: refatoração
docs: documentação
chore: manutenção
```

### Branches:
- `main` - Produção
- `develop` - Desenvolvimento
- `feature/*` - Features
- `fix/*` - Correções
- `release/*` - Releases

## 📚 Documentação Adicional

- `AI_GAME_MASTER.md` - Diretrizes completas da IA Master
- `AI_GAME_MASTER_ADMIN.md` - Diretrizes do Admin
- `packages/shared/src/constants.ts` - Constantes do jogo
- `packages/shared/src/schemas.ts` - Schemas Zod
- `packages/database/prisma/schema.prisma` - Schema completo

## 🤝 Contribuindo

1. Fork o repo
2. Crie branch `feature/nova-funcionalidade`
3. Commit seguindo convenções
4. Push e abra PR
5. Code review + CI verde = Merge

## 📄 Licença

MIT License - Veja LICENSE para detalhes.