# Predict WebSocket Environment Variables

Copy the block below into your `.env` file and fill in the values.

```
# General Predict WebSocket API Information
PREDICT_WS_URL=wss://ws.predict.fun/ws

# API key for websocket auth (optional for public streams)
# Will be appended as ?apiKey=YOUR_KEY if set
PREDICT_WS_API_KEY=

# Websocket connection control
PREDICT_WS_ENABLED=false
PREDICT_WS_MAX_ATTEMPTS=5
PREDICT_WS_MAX_RETRY_INTERVAL_MS=30000
PREDICT_WS_REFRESH_INTERVAL_MS=60000
PREDICT_WS_LOG_INTERVAL_MS=60000
PREDICT_WS_AUTO_TRADE=false
PREDICT_WS_AUTO_TRADE_INTERVAL_MS=60000
PREDICT_CATEGORY_REFRESH_INTERVAL_MS=900000

# Subscriptions
# Orderbook subscriptions are created when a market is selected in code.
# Price feed subscriptions can be created dynamically via priceFeedId.
PREDICT_WS_WALLET_EVENTS=false
```

