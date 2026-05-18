# StandX-maker-bot

Automated market maker for the [StandX Uptime Campaign](https://docs.standx.com/docs/stand-x-campaigns/market-maker-uptime-program).

## Overview

To farm Maker Uptime points, buy and sell orders must remain within **10 bps** for at least **30 minutes per hour**. This bot automates that process by placing orders within 10 bps and cancelling them the moment they drift outside — it also prevents filled orders by cancelling them immediately at market price.

## How It Works

### Spread Management

Both orders are kept within **`TARGET_SPREAD_BPS`** (default: `8`). If either order drifts outside by more than **`TOLERANCE_BPS`** (default: `1.5`), both orders are cancelled and replaced at `TARGET_SPREAD_BPS`.

### Volatility Guard

To avoid high-volatility periods, a rate-limit is enforced: if the number of orders placed within **`TIME_WINDOW`** (default: `2 minutes`) exceeds **`MAX_ORDER_WITHIN_WINDOW`** (default: `12`), the bot pauses for **`PAUSE_SLEEP`** (default: `10 minutes`).

### Retry Logic

If a request to StandX fails, the bot retries up to **`MAX_RETRY_ATTEMPTS`** times (default: `3`), with a **`ATTEMPT_SLEEP`** pause (default: `2 seconds`) between each attempt.

### Alerts

Discord (or any webhook-compatible) notifications are sent on:
- Filled order detected
- Volatility cooldown triggered
- Failed request after all retry attempts

---

## Supported Markets

| Symbol | Description |
|--------|-------------|
| `BTC-USD` | Bitcoin / US Dollar |
| `ETH-USD` | Ethereum / US Dollar |
| `XAU-USD` | Gold / US Dollar |
| `XAG-USD` | Silver / US Dollar |
| `CL-USD`  | CrudeOil / US Dollar |

---

## Configuration

`.env` example:

```env
# Market
SYMBOL=BTC-USD           # BTC-USD | ETH-USD | XAU-USD | XAG-USD
QTY=0.01                 # Position size per order (with leverage)

# Spread parameters
TARGET_SPREAD_BPS=8      # Target spread in basis points (must be < 10)
TOLERANCE_BPS=1.5        # Drift tolerance before rebalancing

# Auth & alerts
PRIVATE_KEY=             # Your wallet private key
WEBHOOK_URL=             # Discord (or other) webhook URL for alerts

# Retry logic
MAX_RETRY_ATTEMPTS=3     # Max retries on failed StandX requests
ATTEMPT_SLEEP=2          # Seconds between retry attempts

# Volatility guard
MAX_ORDER_WITHIN_WINDOW=12   # Max orders allowed within TIME_WINDOW
TIME_WINDOW=120              # Time window in seconds (default: 2 minutes)
PAUSE_SLEEP=600              # Cooldown duration in seconds (default: 10 minutes)
```

You can set the leverage manually on StandX website.

---

## Getting Started

1. Clone the repository
2. Install dependencies
3. Copy and configure your `.env` file
4. Create authToken.json using generateToken.ts
6. Start marketMaker.ts

```bash
git clone https://github.com/Ieuleu/StandX-maker-bot.git
cd StandX-maker-bot
touch .env
# Edit .env with your values
npm install
tsx generateToken.ts
tsx marketMaker.ts
```

---

## License

MIT




