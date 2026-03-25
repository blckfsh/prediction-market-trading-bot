# Slug Match Rules Playbook

Use this playbook to control crypto market support dynamically via `SlugMatchRule`, without code changes.

## Endpoints

- `GET /predict/slug-match-rules`
- `POST /predict/slug-match-rule` (guarded)
- `PATCH /predict/slug-match-rule/:id` (guarded)

## Rule fields

- `marketVariant`: use `CRYPTO_UP_DOWN` for crypto rules
- `configKey`: should match your config rows (`BuyPositionConfig.slugWithSuffix`, `SellPositionConfig.slugWithSuffix`), for example `daily`
- `matchType`: `prefix` | `suffix` | `regex`
- `pattern`: matcher expression (regex supported)
- `enabled`: toggle rule on/off
- `priority`: lower runs first

## BTC-first rollout

Create this rule first:

```json
{
  "marketVariant": "CRYPTO_UP_DOWN",
  "configKey": "daily",
  "matchType": "regex",
  "pattern": "^bitcoin-up-or-down-on-[a-z]+-\\d{1,2}-\\d{4}$",
  "enabled": true,
  "priority": 1
}
```

## Add ETH support later

```json
{
  "marketVariant": "CRYPTO_UP_DOWN",
  "configKey": "daily",
  "matchType": "regex",
  "pattern": "^ethereum-up-or-down-on-[a-z]+-\\d{1,2}-\\d{4}$",
  "enabled": true,
  "priority": 2
}
```

## Add BNB support later

```json
{
  "marketVariant": "CRYPTO_UP_DOWN",
  "configKey": "daily",
  "matchType": "regex",
  "pattern": "^bnb-up-or-down-on-[a-z]+-\\d{1,2}-\\d{4}$",
  "enabled": true,
  "priority": 3
}
```

## Pause or rollback

Disable a rule without deleting it:

`PATCH /predict/slug-match-rule/:id`

```json
{
  "enabled": false
}
```

You can also lower a rule's precedence by increasing `priority`.

## Verification checklist

1. `GET /predict/slug-match-rules` shows expected rows and priorities.
2. Buy/sell config rows exist for `slugWithSuffix = daily`.
3. Logs stop showing `No supported keyword found` for slugs covered by enabled rules.
4. Logs continue to skip symbols that are intentionally not enabled yet.

