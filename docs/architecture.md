# Architecture

This document describes how the prediction market trading bot is structured and how its worker/refresh loops execute end-to-end.

## Components (high level)

- **BotService** (`src/bot/bot.service.ts`): Orchestrates startup, authentication, initial data loading, WebSocket subscriptions, and background refresh loops.
- **TradeService** (`src/trade/trade.service.ts`): Implements buy/sell execution logic, auto-trade decisions from orderbook events, stop-loss, and profit-taking.
- **PredictService** (`src/predict/predict.service.ts`): Handles referral setup, approvals, and config-oriented service methods.
- **PredictRepository** (`src/predict/predict.repository.ts`): Prisma data access for trades, wallet approvals, and strategy config records.
- **PredictController** (`src/predict/predict.controller.ts`): REST endpoints for creating/updating buy/sell configuration.
- **Data layer**: PostgreSQL via Prisma (`Trade`, `BuyPositionConfig`, `SellPositionConfig`, `WalletApproval`, `SportsBet`).

## Architecture diagram

![Prediction bot architecture diagram](images/predict-bot-architecture-design.png)
_Rendered architecture diagram._

```mermaid
flowchart LR
  subgraph EXT[External Systems]
    PAPI[Predict API<br/>HTTP endpoints]
    PWS[Predict WebSocket<br/>Realtime orderbook / wallet events]
    BSC[BSC / Wallet / OrderBuilder<br/>Signing + on-chain interactions]
  end

  subgraph APP[Prediction Market Trading Bot]
    BOT[BotService<br/>Startup orchestration<br/>Auth, refresh loops, subscriptions]
    TRADE[TradeService<br/>Auto-trade, stop-loss,<br/>profit-taking, order creation]
    PRED[PredictService<br/>Referral code,<br/>wallet approvals, config service]
    REPO[PredictRepository<br/>Prisma data access]
    CTRL[PredictController<br/>REST endpoints for config management]
  end

  subgraph DB[PostgreSQL via Prisma]
    TBL1[(Trade)]
    TBL2[(BuyPositionConfig)]
    TBL3[(SellPositionConfig)]
    TBL4[(WalletApproval)]
    TBL5[(SportsBet)]
  end

  PAPI --> BOT
  PWS --> BOT

  BOT --> PRED
  BOT --> TRADE
  BOT --> REPO

  TRADE --> PAPI
  TRADE --> BSC
  TRADE --> REPO

  PRED --> PAPI
  PRED --> REPO

  CTRL --> PRED

  REPO --> TBL1
  REPO --> TBL2
  REPO --> TBL3
  REPO --> TBL4
  REPO --> TBL5
```

## Sequence diagram (short worker flow)

![Prediction bot worker sequence diagram](images/predict-bot-sequence-diagram.png)
_Rendered short worker sequence diagram._

```mermaid
sequenceDiagram
  autonumber

  participant Bot as BotService
  participant API as Predict API
  participant WS as Predict WebSocket
  participant Trade as TradeService
  participant DB as Database

  Bot->>API: Authenticate + load markets/positions
  API-->>Bot: Token + initial data
  Bot->>DB: Load trading configs
  DB-->>Bot: Buy/Sell configs
  Bot->>WS: Subscribe to orderbook events

  loop Refresh loop
    Bot->>API: Refresh categories/positions
    API-->>Bot: Latest data
    Bot->>Trade: Check profit-taking / stop-loss
    Trade->>DB: Read existing trade
    DB-->>Trade: Trade data
  end

  loop Realtime market event
    WS-->>Bot: Orderbook update
    Bot->>Trade: Evaluate buy opportunity
    Trade->>API: Get market/orderbook details
    API-->>Trade: Latest prices
    alt Buy conditions met
      Trade->>API: Create buy order
      API-->>Trade: Order accepted
      Trade->>DB: Save trade as BOUGHT
    else Skip
      Trade-->>Bot: No trade
    end
  end

  alt Sell condition met
    Bot->>Trade: Trigger sell
    Trade->>API: Create sell order
    API-->>Trade: Order accepted
    Trade->>DB: Update trade as SOLD
  end
```

## Key runtime notes

- `PREDICT_BOT_ENABLED` gates startup execution.
- WebSocket-driven auto-trade is controlled by `PREDICT_WS_ENABLED` and `PREDICT_WS_AUTO_TRADE`.
- Refresh intervals and throttling are driven by env vars (see `docs/env.md`).
- Trade lifecycle state is persisted in `Trade` records (`BOUGHT` -> `SOLD`).
