# Model Relationships (v5)

This document explains how strategy/trade models relate to each other in v5 and how those relationships impact runtime behavior.

![Model relationships UI diagram](./images/model-relationships-v5-doc.png)
_v5 model relationships visual._

## Core idea

`MarketProfile` is the parent strategy key (`marketVariant + configKey`) and is referenced by:
- `BuyPositionConfig` (1:1)
- `SellPositionConfig` (1:1)
- `CryptoBet` (1:N)
- `SportsBet` (1:N)

`BuyPositionConfig` and `SellPositionConfig` provide shared defaults per strategy key.

`CryptoBet` and `SportsBet` now carry outcome-level sizing directly:
- `amount`
- `profitTakingPercentage`
- `priority` for deterministic winner selection when multiple matches are possible

`Trade` stores executed buy/sell lifecycle records and ownership keys.

## ER-style relationship diagram

```mermaid
erDiagram
    MarketProfile ||--o| BuyPositionConfig : has
    MarketProfile ||--o| SellPositionConfig : has
    MarketProfile ||--o{ CryptoBet : has
    MarketProfile ||--o{ SportsBet : has

    MarketProfile {
      int id PK
      MarketVariant marketVariant
      string configKey
      datetime createdAt
      datetime updatedAt
    }

    BuyPositionConfig {
      int id PK
      int marketProfileId FK
      int amount
      int entry
      BuyTradeType tradeType
    }

    SellPositionConfig {
      int id PK
      int marketProfileId FK
      int stopLossPercentage
      int amountPercentage
    }

    CryptoBet {
      int id PK
      int marketProfileId FK
      SlugMatchType matchType
      string pattern
      int amount
      int profitTakingPercentage
      BetStatus status
      bool enabled
      int priority
    }

    SportsBet {
      int id PK
      int marketProfileId FK
      string category
      string keyword
      int priority
      int amount
      int profitTakingPercentage
      BetStatus status
    }

    Trade {
      int id PK
      int marketId
      string slug
      string marketSlug
      string outcomeOnChainId
      TradeStatus status
      datetime buyTimestamp
      datetime sellTimestamp
    }
```

## Runtime decision flow (UI-oriented)

```mermaid
flowchart TD
  A[Incoming market slug + variant] --> B{Variant}
  B -->|CRYPTO_UP_DOWN| C[Match CryptoBet by pattern/priority]
  B -->|SPORTS_TEAM_MATCH| D[Match SportsBet by category+keyword+priority]

  C --> E{CryptoBet status}
  E -->|ACTIVE| F[Resolve MarketProfile configKey]
  E -->|INACTIVE| X[Skip buy/sell]

  D --> G{SportsBet status}
  G -->|ACTIVE| F
  G -->|INACTIVE| X

  F --> H[Load BuyPositionConfig + SellPositionConfig]
  H --> I[Apply optional CryptoBet or SportsBet overrides]
  I --> J[TradeService decides buy or sell]
  J --> K[Persist/Update Trade]
```

## Status behavior

- `BetStatus.ACTIVE`:
  - matching `CryptoBet` / `SportsBet` is allowed for decisioning.
- `BetStatus.INACTIVE`:
  - matching entry blocks continuation of buy/sell flow for the slug.

This allows temporary pause/rollout control without deleting rules.

## Override behavior

- Buy amount resolution:
  - `SportsBet.amount` / `CryptoBet.amount` (required)
- Profit-taking resolution:
  - `SportsBet.profitTakingPercentage` / `CryptoBet.profitTakingPercentage` when present
  - otherwise env `PREDICT_PROFIT_TAKING_PERCENTAGE`
- Sports team selection:
  - if multiple `SportsBet` rows match the same slug, lower `priority` wins
  - ties fall back to lower `id`

## API mapping

Current strategy endpoints:
- `GET /predict/market-profiles`
- `POST /predict/market-profile`
- `GET /predict/crypto-bets`
- `POST /predict/crypto-bet`
- `PATCH /predict/crypto-bet/:id`
- `GET /predict/sports-bets`
- `POST /predict/sports-bet`
- `PATCH /predict/sports-bet/:id`

Backward-compatible alias endpoints:
- `GET /predict/slug-match-rules`
- `POST /predict/slug-match-rule`
- `PATCH /predict/slug-match-rule/:id`
