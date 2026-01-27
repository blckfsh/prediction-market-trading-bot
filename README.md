## Prediction Market Trading Bot

**Trading Bot to farm airdrops on Predict.fun** ([https://predict.fun/](https://predict.fun/)) that connects to prediction markets, consumes live market data, and executes automated strategies. It includes websocket ingestion, market data typing, and a strategy/service layer for placing trades and managing bot behavior. The goal is to run it to increase a user's trading volume. Soon, it will handle more complex strategies across multiple categories.

![Predict UI overview](docs/images/predictdotfun-home.png)
![Predict bot interface](docs/images/predictbot-interface.png)
_The image above shows the Predict bot interface._

## Trading Strategies

- Buy the highest average price outcomes of Prediction Markets with market variant of CRYPTO Prices UP/DOWN.

## Install dependencies

```bash
pnpm install
```

## Environment variables

Environment variables are documented here: `docs/env.md`.

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
