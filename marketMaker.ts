import WebSocket from "ws";
import { newOrder, cancelOrder, queryOrders, queryPosition, discordWebhook, alertDiscord, alertOrderFilled, alertPositionClosed } from "./api";
import { NewOrderPayload, MarketMakerState, DepthBookMessage, QueryOrdersResponse, QueryPositionResponse } from "./types";
import {areOrdersWithinSpread, calculateOrderPrices, sleep} from "./utils";
import { ServerAuth } from './serverAuth';

import dotenv from "dotenv";
dotenv.config();

const socket_uptime = 12*60*60*1000;  // 12 hours

const symbol = process.env.SYMBOL;

const targetSpreadBps = process.env.TARGET_SPREAD_BPS;
const toleranceBps = process.env.TOLERANCE_BPS;
const qty = process.env.QTY;

const maxAttempsEnv = process.env.MAX_RETRY_ATTEMPS;
const attempSleepEnv = process.env.ATTEMP_SLEEP;
const pauseSleepEnv = process.env.PAUSE_SLEEP;

const timeWindowEnv = process.env.TIME_WINDOW;
const maxOrderWithinWindowEnv = process.env.MAX_ORDER_WITHIN_WINDOW;


if (!targetSpreadBps || !toleranceBps || !qty || !symbol || !maxAttempsEnv || !attempSleepEnv || !pauseSleepEnv || !timeWindowEnv ||! maxOrderWithinWindowEnv) {
  throw new Error('Missing required environment variables');
}
const maxAttemps = parseInt(maxAttempsEnv);
const attempSleep = parseInt(attempSleepEnv)*1000;
const pauseSleep = parseInt(pauseSleepEnv)*60*1000;
const timeWindow = 2*60*1000;
const maxOrderWithinWindow = parseInt(maxOrderWithinWindowEnv);


async function closePosition(symbol:string, positionQty: number, auth: any, bearerToken: string): Promise<void> {
  try {
    if (positionQty === 0) {
      console.log("(closePosition) No position to close");
      return;
    }

    const closeSide: "buy" | "sell" = positionQty > 0 ? "sell" : "buy";
    const closeQty = Math.abs(positionQty);

    console.log(`(closePosition) Closing position: ${closeSide} ${closeQty} at market price`);

    const closePayload: NewOrderPayload = {
      symbol: symbol,
      side: closeSide,
      price: 0,
      qty: closeQty,
      order_type: "market",
      time_in_force: "ioc",
      reduce_only: true,
    };

    // First attempt
    let closeResponse = await newOrder(closePayload, auth, bearerToken);
    await sleep(750);
    let positionResponse: QueryPositionResponse[] = await queryPosition(bearerToken);
    let position = positionResponse[0];
    if (closeResponse?.code === 0 && parseFloat(position.qty) === 0) {
      console.log(`(closePosition) Position closed successfully on 1st attempt`);
      await alertPositionClosed(symbol, closeSide, closeQty, 1);
      return;
    }
    console.error(`(closePosition) 1st attempt failed:`, closeResponse?.message);

    // Second attempt
    await sleep(6000);
    closeResponse = await newOrder(closePayload, auth, bearerToken);
    await sleep(750);
    positionResponse = await queryPosition(bearerToken);
    position = positionResponse[0];
    if (closeResponse?.code === 0 && parseFloat(position.qty) === 0) {
      console.log(`(closePosition) Position closed successfully on 2nd attempt`);
      await alertPositionClosed(symbol, closeSide, closeQty, 2);
      return;
    }
    console.error(`(closePosition) 2nd attempt failed:`, closeResponse?.message);

    // Third attempt with longer delay
    await sleep(10000);
    closeResponse = await newOrder(closePayload, auth, bearerToken);
    await sleep(750);
    positionResponse = await queryPosition(bearerToken);
    position = positionResponse[0];
    if (closeResponse?.code === 0 && parseFloat(position.qty) === 0) {
      console.log(`(closePosition) Position closed successfully on 3rd attempt`);
      await alertPositionClosed(symbol, closeSide, closeQty, 3);
      return;
    }

    // All attempts failed
    console.error(`(closePosition) All 3 attempts failed:`, closeResponse?.message);
    const payload = {
      embeds: [
        {
          title: `❌ Failed to close ${symbol} position!`,
          description: `Failed to close ${closeSide} position ${symbol} of ${closeQty} after 3 attempts`,
          url: `https://standx.com/perps?symbol=${symbol}`,
          color: 0xB31900,
          timestamp: new Date().toISOString(),
          thumbnail: {
            url: "https://standx.com/logo.png"
          },
        }
      ]
    }
    await discordWebhook(payload);
  } catch (error) {
    console.error("closePositionError: error closing position:", error);
  }
}
  


async function checkAndHandleFilledOrders(state: MarketMakerState, auth: any, bearerToken: string): Promise<void> {
  try {
    const positionResponse: QueryPositionResponse[] = await queryPosition(bearerToken);
    
    if (!positionResponse || positionResponse.length === 0) {
      console.error("(checkAndHandleFilledOrders) Failed to query position");
      return;
    }

    const position = positionResponse[0];
    const positionQty = parseFloat(position.qty);

    if (positionQty === 0) {
      return;
    }

    // Position detected - close it
    const filledSide = positionQty > 0 ? "bid" : "ask";
    console.log(`(checkAndHandleFilledOrders) Position detected! Qty: ${positionQty}, Entry: ${position.entry_price}`);
    console.log(`(checkAndHandleFilledOrders) ${filledSide} order was filled`);

    // Send Discord alert
    await alertOrderFilled(filledSide, positionQty, position.entry_price, state.symbol);


    // on close d'abord les deux orders afin d'avoir de la marge disponible pour fermer la position
    const ordersToCancel = [
      { order: state.activeOrders.bid, type: 'bid' },
      { order: state.activeOrders.ask, type: 'ask' }
    ];

    for (const { order, type } of ordersToCancel) {
      if (!order) continue;
      
      let cancelSuccess = false;
      for (let attempt = 1; attempt <= maxAttemps && !cancelSuccess; attempt++) {
        try {
          const cancelResult = await cancelOrder(order.order_id, auth, bearerToken);
          if (cancelResult && cancelResult.code === 0) {
            console.log(`(checkAndHandleFilledOrders) ${type} order cancelled successfully on attempt ${attempt}`);
            cancelSuccess = true;
          } else {
            console.error(`(checkAndHandleFilledOrders) Cancel ${type} attempt ${attempt} failed:`, cancelResult?.message);
            if (attempt < maxAttemps) await sleep(attempSleep);
          }
        } catch (error) {
          console.error(`(checkAndHandleFilledOrders) Cancel ${type} attempt ${attempt} error:`, error);
          if (attempt < maxAttemps) await sleep(attempSleep);
        }
      }
      
      if (!cancelSuccess) {
        console.error(`(checkAndHandleFilledOrders) Failed to cancel ${type} order after ${maxAttemps} attempts`);
      }
    }

    // Clear both orders
    state.activeOrders.bid = null;
    state.activeOrders.ask = null;
    
    await closePosition(state.symbol, positionQty, auth, bearerToken);

    console.log("(checkAndHandleFilledOrders) Position closed and orders cleared");

  } catch (error) {
    console.error("(checkAndHandleFilledOrders) Error:", error);
  }
}


async function ensureOrdersWithinSpread(state: MarketMakerState, auth: any, bearerToken: string): Promise<void> {
  try {
    const { activeOrders, currentMarkPrice, symbol, qty } = state;

    if (currentMarkPrice === 0) {
      console.log("(ensureOrdersWithinSpread) Mark price not initialized yet");
      return;
    }
    
    // Initialize tracking if needed
    if (!state.orderChangeTimestamps) {
      state.orderChangeTimestamps = [];
    }
    if (!state.cooldownUntil) {
      state.cooldownUntil = 0;
    }

    const ordersValid = areOrdersWithinSpread(state);

    if (ordersValid) {
      return;
    }

    // Check cooldown BEFORE we start cancelling
    const now = Date.now();
    const needsCancellation = activeOrders.bid || activeOrders.ask;
    
    if (now < state.cooldownUntil && !needsCancellation) {
      const remainingMin = Math.ceil((state.cooldownUntil - now) / 1000 / 60);
      console.log(`(ensureOrdersWithinSpread) In cooldown. ${remainingMin} min remaining.`);
      await sleep(60*1000);
      return;
    }
    
    const cancelWithRetry = async (orderId: number) => {
      let attempts = 0;
      while (attempts < maxAttemps) {
        try {
          const response = await cancelOrder(orderId, auth, bearerToken);
          if (response && response.code === 0) {
            return true;
          }
        } catch (err) {
          console.error(`(ensureOrdersWithinSpread) Attemp ${attempts}, Cancel failed for order ${orderId}:`, err);
        }
        attempts++;
        await sleep(attempSleep);
      }
      return false;
    };

    // cancelling long order
    if (activeOrders.bid) {
      const bidCancelled = await cancelWithRetry(activeOrders.bid.order_id);

      if (!bidCancelled) {
        console.error(`(ensureOrdersWithinSpread) Failed to cancel bid order after retry: ${activeOrders.bid.order_id}`);
        await alertDiscord(`Failed to cancel bid order after retry !`,`Failed to cancel bid order after retry`);
      }
      activeOrders.bid = null;
    }

    await sleep(250);
    
    // cancelling short order
    if (activeOrders.ask) {
      const askCancelled = await cancelWithRetry(activeOrders.ask.order_id);

      if (!askCancelled) {
        console.error(`(ensureOrdersWithinSpread) Failed to cancel ask order after retry: ${activeOrders.ask.order_id}`);
        await alertDiscord(`Failed to cancel ask order after retry !`,`Failed to cancel ask order after retry`);
      }
      activeOrders.ask = null;
    }

    // NOW check if we're in cooldown after cancelling
    if (now < state.cooldownUntil) {
      const remainingMin = Math.ceil((state.cooldownUntil - now) / 1000 / 60);
      console.log(`(ensureOrdersWithinSpread) Orders cancelled. In cooldown. ${remainingMin} min remaining.`);
      return;
    }

    // Track this change AFTER cancelling orders
    state.orderChangeTimestamps.push(now);
    
    // Remove timestamps older than 3 minutes
    state.orderChangeTimestamps = state.orderChangeTimestamps.filter(
      timestamp => now - timestamp <= timeWindow
    );

    // Check if too many changes - AFTER cancelling orders
    if (state.orderChangeTimestamps.length > maxOrderWithinWindow) {
      state.cooldownUntil = now + pauseSleep;
      console.log(`(ensureOrdersWithinSpread) Too many order changes (${state.orderChangeTimestamps.length}) in ${timeWindow/(60*1000)} min. Cooldown for ${pauseSleep/(60*1000)} min.`);
      await alertDiscord(
        "⏸️ Market Maker Cooldown", 
        `Too many order changes (${state.orderChangeTimestamps.length}) in ${timeWindow/(60*1000)} minutes. Paused for ${pauseSleep/(60*1000)} minutes.`
      );
      return; // Exit AFTER cancelling orders
    }

    const { bidPrice, askPrice } = calculateOrderPrices(currentMarkPrice, state.targetSpreadBps);
    console.log(`(ensureOrdersWithinSpread) Creating new orders - Bid: ${bidPrice}, Ask: ${askPrice}`);

    // on ouvre un order long et on récupère l'order_id en effectue une requete à 
    // queryOrders en prenant le résultat le plus récent avec un tri sur l'id
    const bidPayload: NewOrderPayload = {
      symbol: symbol,
      side: "buy",
      price: bidPrice,
      qty: qty,
      order_type: "limit",
      time_in_force: "gtc",
      reduce_only: false,
    };
    // de même on ouvre un order short et on récupère l'order_id en effectue une requete à 
    // queryOrders en prenant le résultat le plus récent avec un tri sur l'id
    const askPayload: NewOrderPayload = {
      symbol: symbol,
      side: "sell",
      price: askPrice,
      qty: qty,
      order_type: "limit",
      time_in_force: "gtc",
      reduce_only: false,
    };

    // create new orders with attemps mecanic
    let attempts = 0;
    let bidResponse: any = null;
    let askResponse: any = null;

    let bidSuccess;
    let askSuccess;

    while (attempts < 2) {
      try {
        [bidResponse, askResponse] = await Promise.all([
          newOrder(bidPayload, auth, bearerToken),
          newOrder(askPayload, auth, bearerToken)
        ]);

        bidSuccess = bidResponse && bidResponse.code === 0;
        askSuccess = askResponse && askResponse.code === 0;

        if (bidSuccess && askSuccess) {
          break; // both succeeded → exit loop
        }
      } catch (err) {
        console.error("(ensureOrdersWithinSpread) Order creation threw error:", err);
      }

      attempts++;
      await sleep(attempSleep);
    }

    if (!bidSuccess) {
      console.error(`(ensureOrdersWithinSpread) Failed to create bid order after retry:`, bidResponse?.message);
      await alertDiscord(`Failed to create bid order after retry !`, `Failed to create bid order after 2 retry`);
    }

    if (!askSuccess) {
      console.error(`(ensureOrdersWithinSpread) Failed to create ask order after retry:`, askResponse?.message);
      await alertDiscord(`Failed to create ask order after retry !`, `Failed to create ask order after 2 retry`);
    }
    // Wait once for both to be in the system
    await sleep(1500);

    // rentre les infromations dans le marketMakerState en effectuant un requete à queryOrders avec plusieurs essais
    attempts = 0;
    let ordersResponse: QueryOrdersResponse | null = null;

    while (attempts < maxAttemps) {
      try {
        ordersResponse = await queryOrders(bearerToken);

        if (ordersResponse && ordersResponse.code === 0) {
          break; // success → exit loop
        }
      } catch (err) {
        console.error("(ensureOrdersWithinSpread) queryOrders failed:", err);
        await alertDiscord(`Failed to perform queryOrders request !`, `Failed to perform queryOrders request after 2 attemps`);
      }

      attempts++;
      await sleep(attempSleep);
    
    }

    if (ordersResponse && ordersResponse.code === 0) {
      console.log("putting orders into marketMakerState");
      const recentBidOrder = ordersResponse.result
        .filter(order => order.symbol === symbol && order.side === "buy")
        .sort((a, b) => b.id - a.id)[0];
      
      const recentAskOrder = ordersResponse.result
        .filter(order => order.symbol === symbol && order.side === "sell")
        .sort((a, b) => b.id - a.id)[0];
      
      if (recentBidOrder) {
          activeOrders.bid = {
            order_id: recentBidOrder.id,
            symbol: symbol,
            side: "buy",
            price: bidPrice,
            qty: qty,
            timestamp: Date.now(),
            status: "active",
          };
          console.log(`(ensureOrdersWithinSpread) New bid order created: ${activeOrders.bid.order_id}`);
        }
      
      if (recentAskOrder) {
          activeOrders.ask = {
            order_id: recentAskOrder.id,
            symbol: symbol,
            side: "sell",
            price: askPrice,
            qty: qty,
            timestamp: Date.now(),
            status: "active",
          };
          console.log(`(ensureOrdersWithinSpread) New ask order created: ${activeOrders.ask.order_id}`);
        }
    }
    state.lastUpdateTimestamp = Date.now();

  } catch (error) {
    console.error("ensureOrdersWithinSpreadError:", error);
  }
}


function priceWebSocket(state:MarketMakerState, auth: any, bearerToken: string): void {
  const WS_URL: string = "wss://perps.standx.com/ws-stream/v1";
  const ws = new WebSocket(WS_URL);
  
  let isProcessing = false;
  let reconnectTimeout;
  
  // Auto-reconnect after 12 hours
  const autoReconnect = setTimeout(() => {
    console.log("(priceWebSocket) 12-hour reconnection triggered");
    ws.close();
  }, socket_uptime);
  
  ws.on("open", (): void => {
    console.log("(priceWebSocket) Connected to WebSocket");
    
    const subscribeMessage = {
      subscribe: {
        channel: "depth_book",
        symbol: state.symbol,
      },
    };
    
    ws.send(JSON.stringify(subscribeMessage));
    console.log(`(priceWebSocket) Subscribed to ${state.symbol}$ depth_book`);
  });
  
  ws.on("message", async (data: WebSocket.Data): Promise<void> => {
    try {
      const message: DepthBookMessage = JSON.parse(data.toString());
      
      if (message.channel === "depth_book" && message.symbol === state.symbol) {
        const markPrice = message.data?.mark_price;
        
        if (markPrice !== undefined) {
          if (isProcessing) {
            return;
          }
          
          isProcessing = true;
          try {
            marketMakerState.currentMarkPrice = markPrice;

            await ensureOrdersWithinSpread(marketMakerState, auth, bearerToken);
          } catch (error) {
            console.error("(priceWebSocket) processMarkPriceError:", error);
          } finally {
            isProcessing = false;
          }
        }
      }
    } catch (error) {
      console.error("(priceWebSocket) error parsing message:", error);
    }
  });

  ws.on("error", (error: Error): void => {
    console.error("(priceWebSocket) WebSocket error:", error);
  });
  
  ws.on("close", (): void => {
    console.log("(priceWebSocket) WebSocket closed. Reconnecting in 3 seconds...");
    clearTimeout(autoReconnect);
    reconnectTimeout = setTimeout(() => priceWebSocket(state, auth, bearerToken), 3000);
  });
}

function positionWebSocket(auth: any, bearerToken: string): void {
  const ws = new WebSocket("wss://perps.standx.com/ws-stream/v1");

  let reconnectTimeout: NodeJS.Timeout;
  
  const autoReconnect = setTimeout(() => {
    console.log("(positionWebSocket) 12-hour reconnection triggered");
    ws.close();
  }, socket_uptime);

  ws.on("open", () => {
    console.log("(positionWebSocket) Connected to WebSocket");

    ws.send(JSON.stringify({
      auth: {
        token: bearerToken,
      },
    }));

    setTimeout(() => {
      ws.send(JSON.stringify({
        subscribe: {
          channel: "position",
        },
      }));
    }, 200); // wait for the socket to acknowledge the auth
  });

  ws.on("message", async (data): Promise<void> => {

    try {
      const message = JSON.parse(data.toString());
        if (message.channel === 'position') {
          const qty = message.data?.qty;
          if (qty != 0){
            await checkAndHandleFilledOrders(marketMakerState, auth, bearerToken);
          }
        }
    } catch (error) {
      console.error("(positionWebSocket) error parsing message:", error);
    }

  });

  ws.on("error", (error: Error): void => {
    console.error("(positionWebSocket) WebSocket error:", error);
  });

  ws.on("close", (): void => {
    console.log("(positionWebSocket) WebSocket closed. Reconnecting in 3 seconds...");
    clearTimeout(autoReconnect);
    reconnectTimeout = setTimeout(() => positionWebSocket(auth, bearerToken), 3000);
  });
}


const marketMakerState: MarketMakerState = {
  symbol: symbol,
  currentMarkPrice: 0,
  activeOrders: {
    bid: null,
    ask: null,
  },
  targetSpreadBps: parseFloat(targetSpreadBps),
  toleranceBps: parseFloat(toleranceBps),
  qty: parseFloat(qty),
  lastUpdateTimestamp: Date.now(),
  lastFilledCheckTimestamp: 0,
};


async function main() {
  try {
    // load the auth token
    const serverAuth = new ServerAuth('./auth-token.json');
    
    const auth = serverAuth.getAuth();
    const bearerToken = serverAuth.getToken();
    console.log('(main) Successful login')
    priceWebSocket(marketMakerState, auth, bearerToken);
    positionWebSocket(auth, bearerToken);

    
  } catch (error) {
    console.error('Authentication failed:', error);
    console.log('');
    console.log('   To fix this:');
    console.log('   1. On your local machine: npx generate-token.ts');
    console.log('   2. Upload auth-token.json to the server');
    console.log('   3. Restart the application');
    process.exit(1);
  }
}

main();
