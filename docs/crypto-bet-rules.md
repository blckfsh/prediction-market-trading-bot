# CryptoBet Rules Playbook

Use this playbook to control crypto market support dynamically via `CryptoBet`, without code changes.
Legacy `slug-match-rule` endpoints still work as compatibility aliases.

## Endpoints

- `GET /predict/crypto-bets`
- `POST /predict/crypto-bet` (guarded)
- `PATCH /predict/crypto-bet/:id` (guarded)

Compatibility aliases:
- `GET /predict/slug-match-rules`
- `POST /predict/slug-match-rule` (guarded)
- `PATCH /predict/slug-match-rule/:id` (guarded)

## Rule fields

- `marketVariant`: use `CRYPTO_UP_DOWN` for crypto rules
- `configKey`: should match your config rows (`BuyPositionConfig.slugWithSuffix`, `SellPositionConfig.slugWithSuffix`), for example `daily`
- `matchType`: `prefix` | `suffix` | `regex`
- `pattern`: matcher expression (regex supported)
- `status`: `ACTIVE` | `INACTIVE` (stored in shared `BetRuleConfig`; inactive blocks buy/sell continuation)
- `enabled`: toggle rule on/off
- `priority`: lower runs first (stored in shared `BetRuleConfig`)
- `amount`: required buy amount for this specific crypto rule (stored in shared `BetRuleConfig`)
- `profitTakingPercentage`: optional profit-taking setting for this specific crypto rule (stored in shared `BetRuleConfig`)

## BTC-first rollout

Create this rule first:

```json
{
  "marketVariant": "CRYPTO_UP_DOWN",
  "configKey": "daily",
  "matchType": "regex",
  "pattern": "^bitcoin-up-or-down-on-[a-z]+-\\d{1,2}-\\d{4}$",
  "status": "ACTIVE",
  "enabled": true,
  "priority": 1,
  "amount": 25,
  "profitTakingPercentage": 40
}
```

## Add ETH support later

```json
{
  "marketVariant": "CRYPTO_UP_DOWN",
  "configKey": "daily",
  "matchType": "regex",
  "pattern": "^ethereum-up-or-down-on-[a-z]+-\\d{1,2}-\\d{4}$",
  "status": "ACTIVE",
  "enabled": true,
  "priority": 2,
  "amount": 20
}
```

## Add BNB support later

```json
{
  "marketVariant": "CRYPTO_UP_DOWN",
  "configKey": "daily",
  "matchType": "regex",
  "pattern": "^bnb-up-or-down-on-[a-z]+-\\d{1,2}-\\d{4}$",
  "status": "ACTIVE",
  "enabled": true,
  "priority": 3,
  "amount": 15
}
```

## Pause or rollback

Disable a rule without deleting it (either by `enabled = false` or `status = INACTIVE`):

`PATCH /predict/crypto-bet/:id`

```json
{
  "status": "INACTIVE"
}
```

You can also lower a rule's precedence by increasing `priority`.

## Verification checklist

1. `GET /predict/crypto-bets` shows expected rows and priorities.
2. Buy/sell config rows exist for `slugWithSuffix = daily`.
3. Every rule must define `amount`; profit-taking remains optional per rule.
4. Logs stop showing `No supported keyword found` for slugs covered by enabled active rules.
5. Logs continue to skip symbols that are intentionally not enabled yet.
