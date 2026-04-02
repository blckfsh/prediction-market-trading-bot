## Prediction Market Trading Bot v5 🔥

Automated trading bot for [Predict.fun](https://predict.fun/) now running at **v5 🔥**.

It connects to Predict HTTP + WebSocket APIs, evaluates market opportunities in real time, places signed orders, and persists trading state in PostgreSQL via Prisma (generated from ZenStack ZModel).

The bot is worker-oriented:
- `BotService` handles startup, refresh loops, subscriptions, and runtime config loading.
- `TradeService` executes buy/sell logic with stop-loss and profit-taking controls.
- `PredictRepository` persists strategy and trade state (`MarketProfile`, buy/sell configs, `CryptoBet`, `SportsBet`, `Trade`).

![Predict UI overview](docs/images/predictdotfun-home.png)
![Predict bot interface](docs/images/predictbot-interface.png)
_The image above shows the Predict bot interface._

## What's New in v5 🔥

- ZenStack-first schema workflow (`schema.zmodel` is source of truth).
- Normalized strategy data with `MarketProfile` parent model.
- `CryptoBet` model naming (DB-mapped to legacy `SlugMatchRule` table).
- `SportsBet` and `CryptoBet` now support `status` (`ACTIVE` | `INACTIVE`).
- Inactive bet entries block both buy and sell decisions for matching markets.
- Expanded API routes for `market-profile`, `crypto-bet`, and `sports-bet`.

## Strategy and Rules

- Supports `CRYPTO_UP_DOWN` markets with dynamic rule matching via `CryptoBet`.
- Supports `SPORTS_TEAM_MATCH` markets via category + keyword matching in `SportsBet`.
- Applies stop-loss and profit-taking logic across supported market variants.

Backward-compatible alias endpoints are still available:
- `GET /predict/slug-match-rules`
- `POST /predict/slug-match-rule`
- `PATCH /predict/slug-match-rule/:id`

## Documentation

- Docs index: [`docs/`](docs/)
- Trading behavior: [`docs/trading.md`](docs/trading.md)
- Architecture and sequence diagrams: [`docs/architecture.md`](docs/architecture.md)
- CryptoBet rollout playbook: [`docs/crypto-bet-rules.md`](docs/crypto-bet-rules.md)
- Model relationships (with UI diagrams): [`docs/model-relationships.md`](docs/model-relationships.md)
- Environment variables: [`docs/env.md`](docs/env.md)

## Install dependencies

```bash
npm install
```

## Environment variables

See [`docs/env.md`](docs/env.md).

## Run app

```bash
# dev
npm run start:dev

# prod
npm run build
npm run start:prod
```

## Run tests

```bash
npm run test
npm run test:e2e
npm run test:cov
npm run db:check
```

## Schema and migrations (ZenStack-first)

```bash
# 1) Sync Prisma schema/client from ZModel
npm run schema:sync

# 2) Create/apply migration in dev
npm run db:migrate

# 3) Check migration state
npm run db:migrate:status

# 4) Apply pending migrations (deploy)
npm run db:migrate:deploy
```

## Optional Makefile shortcuts

If `make` is installed:

```bash
make help
make dev
make test
make test-e2e
make schema-sync
make migrate
```
