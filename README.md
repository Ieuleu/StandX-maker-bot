# StandX-maker-bot

Automated market maker for StandX Uptime Campaign https://docs.standx.com/docs/stand-x-campaigns/market-maker-uptime-program.
To farm Maker Uptime points we have to keep buy and sell orders within 10 bps for a duration of 30+mins/hour. 


The purpose of this program is to place orders within 10bps and cancel them if they are outside 10bps. This program also prevent
filled orders by cancelling them immediatly at the market price.
In order to keep order within 10 bps, I ensure both orders are within **TARGET_SPREAD_BPS** (by default 8) and if an order is outside by **TOLERANCE_BPS** (by default 1.5)
both order are cancelled and replaced at **TARGET_SPREAD_BPS**.

To avoid high volatility period, a logic of max order with a period is implemented: it ensures that the numbers of orders within **TIME_WINDOW** (by default 2 minutes) is 
inferior to **MAX_ORDER_WITHIN_WINDOW** (by defaumt 12). If this logic triggered, there is a cooldown of **PAUSE_SLEEP** (by default 10 minutes).

If a request to StandX fails, there is a reiteration logic: the program will retry **MAX_RETRY_ATTEMPS** (by default 3) with a pause of **ATTEMP_SLEEP** (by default 2 seconds) between each attemp.

In case of a filled order, a cooldown, or a failed request to StandX, we receive alerts from a webhook to for example a Discord channel.


