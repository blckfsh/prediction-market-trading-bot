## Prediction Market Trading Bot v4 🔥

Automated trading bot for [Predict.fun](https://predict.fun/) (now at **v4**) that connects to the Predict HTTP + WebSocket APIs, evaluates market opportunities in real time, places signed orders, and tracks trades/configuration in PostgreSQL via Prisma.

The bot is worker-oriented: `BotService` handles startup and refresh loops, `TradeService` executes auto-trade and sell logic (stop-loss/profit-taking), and `PredictRepository` persists trade/config state. This is designed for continuous execution to increase trading activity while enforcing configurable risk and timing controls across supported market variants.

![Predict UI overview](docs/images/predictdotfun-home.png)
![Predict bot interface](docs/images/predictbot-interface.png)
_The image above shows the Predict bot interface._

## Trading Strategies

- Supports `CRYPTO_UP_DOWN` markets (binary crypto price direction with dynamic DB-driven slug matching via `SlugMatchRule`, for example BTC-only `daily` rollout).
- Supports `SPORTS_TEAM_MATCH` markets (sports/esports match winner flow using category + keyword matching via `SportsBet`).
- Applies stop-loss and profit-taking sell logic across supported market variants.

## Dynamic slug matching

`SlugMatchRule` lets you control which slugs map to which config key at runtime without code edits.

- `GET /predict/slug-match-rules`
- `POST /predict/slug-match-rule` (guarded)
- `PATCH /predict/slug-match-rule/:id` (guarded)

This enables phased rollouts such as BTC daily first, then ETH/BNB later, while keeping `BuyPositionConfig.slugWithSuffix` stable (for example `daily`).

## Documentation

- Docs index (folder): [`docs/`](docs/)
- Trading behavior and supported variants: [`docs/trading.md`](docs/trading.md)
- Slug rule rollout playbook: [`docs/slug-match-rules.md`](docs/slug-match-rules.md)
- Architecture and sequence diagrams: [`docs/architecture.md`](docs/architecture.md)
- Environment variables: [`docs/env.md`](docs/env.md)

## Install dependencies

```bash
pnpm install
```

## Environment variables

Environment variables are documented here: `docs/env.md`.

## Architecture and flow

- Architecture overview and responsibilities: `docs/architecture.md`
- End-to-end worker refresh/auto-trade sequence: `docs/architecture.md#sequence-diagram-short-worker-flow`
- Trading behavior by market variant (`CRYPTO_UP_DOWN`, `SPORTS_TEAM_MATCH`): `docs/trading.md`

![Architecture diagram preview](docs/images/predict-bot-architecture-design.png)
_See the full diagrams in `docs/architecture.md`._

## Run tests

```bash
# unit tests
pnpm run test

# e2e tests
pnpm run test:e2e

# test coverage
pnpm run test:cov
```

## Run migrations

```bash
pnpm run migration:run
```

## Start the app

```bash
# development
pnpm run start

# watch mode
pnpm run start:dev

# production mode
pnpm run start:prod
```
