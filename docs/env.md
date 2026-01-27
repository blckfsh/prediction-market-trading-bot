# Environment Variables

This document describes the environment variables used by the prediction market trading bot.

## Database (PostgreSQL)

- `DIRECT_DATABASE_URL`: Direct database connection string for admin tasks (migrations, tooling).
- `DATABASE_URL`: Application database connection string used at runtime.

## Predict URLs

- `PREDICT_API_BASE_URL`: Base URL for the Predict HTTP API. 
- `PREDICT_WS_URL`: WebSocket URL for live Predict market streams.
For detailed endpoints and connection information, refer to [https://dev.predict.fun/](https://dev.predict.fun/).

## Predict Account Details

- `PREDICT_ACCOUNT_ADDRESS`: Predict Smart Account address; find it on the Predict Deposit page at [https://predict.fun/account/deposit](https://predict.fun/account/deposit).
- `WALLET_PRIVATE_KEY`: Signer private key for the Privy Wallet tied to your Predict Account; keep this secret. Export it from the Predict Settings page at [https://predict.fun/account/settings](https://predict.fun/account/settings).

## Predict API Key

- `PREDICT_API_KEY`: API key used to authenticate requests to the Predict API; request one in the Predict Discord server at [https://discord.gg/predictdotfun](https://discord.gg/predictdotfun).

## Predict Bot Behavior

- `PREDICT_BOT_ENABLED`: Master flag to enable or disable bot execution.
- `PREDICT_WS_ENABLED`: Enable or disable the WebSocket client.
- `PREDICT_WS_WALLET_EVENTS`: Subscribe to wallet-related events over WebSocket.
- `PREDICT_WS_AUTO_TRADE`: Enable or disable automated trading actions from WS events.

## Predict WebSocket Connection Control

- `PREDICT_WS_MAX_ATTEMPTS`: Maximum number of WebSocket reconnect attempts.
- `PREDICT_WS_MAX_RETRY_INTERVAL_MS`: Upper bound for backoff delay between reconnects (ms).
- `PREDICT_WS_LOG_INTERVAL_MS`: Interval for WebSocket status logging (ms).
- `PREDICT_WS_AUTO_TRADE_INTERVAL_MS`: Throttle interval between auto-trades (ms).
- `PREDICT_CATEGORY_REFRESH_INTERVAL_MS`: Interval for refreshing market categories (ms).

