import crypto from "crypto";
import { NewOrderPayload } from "./types";
import dotenv from "dotenv";
dotenv.config();


const WEBHOOK_URL = process.env.WEBHOOK_URL;


export async function discordWebhook(payload: any) {
  if (!WEBHOOK_URL) {
    throw new Error("DISCORD_WEBHOOK_URL is not set");
  }

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord webhook failed: ${response.status} - ${text}`);
  }
}

export async function alertDiscord(title:string, description: string) {
  const payload = {
    embeds: [
      {
        title: title,
        description: description,
        url: "https://standx.com/perps?symbol=BTC-USD",
        color: 0xB31900,
        timestamp: new Date().toISOString(),
  
        thumbnail: {
          url: "https://standx.com/logo.png"
        },
      }
    ]
  }
  
  discordWebhook(payload);
}

export async function alertOrderFilled(
  side: 'bid' | 'ask',
  qty: number,
  entryPrice: string,
  symbol: string
) {
  const direction = side === 'bid' ? 'LONG' : 'SHORT';
  const emoji = side === 'bid' ? '📈' : '📉';
  
  const title = `${emoji} Order Filled - ${direction}`;
  
  const description = `
**Symbol:** ${symbol}
**Side:** ${side.toUpperCase()}
**Quantity:** ${Math.abs(qty)}
**Entry Price:** $${entryPrice}
**Position:** ${qty > 0 ? 'Long' : 'Short'}
**Time:** ${new Date().toLocaleString()}
  `.trim();

  const payload = {
    embeds: [
      {
        title: title,
        description: description,
        url: `https://standx.com/perps?symbol=${symbol}`,
        color: side === 'bid' ? 0x00FF00 : 0xFF0000, // Green for long, Red for short
        timestamp: new Date().toISOString(),
        thumbnail: {
          url: "https://standx.com/logo.png"
        },
      }
    ]
  }
  
  discordWebhook(payload);
}

export async function alertPositionClosed(
  symbol: string,
  side: 'buy' | 'sell',
  qty: number,
  attempt: number
) {
  const direction = side === 'sell' ? 'LONG' : 'SHORT';
  const emoji = '✅';
  
  const title = `${emoji} Position Closed - ${direction}`;
  
  const description = `
**Symbol:** ${symbol}
**Position Type:** ${side === 'sell' ? 'Long (Sold to Close)' : 'Short (Bought to Close)'}
**Quantity:** ${qty}
**Close Action:** ${side.toUpperCase()}
**Attempt:** ${attempt}${attempt > 1 ? ` (Retry)` : ''}
**Status:** Successfully Closed
**Time:** ${new Date().toLocaleString()}
  `.trim();

  const payload = {
    embeds: [
      {
        title: title,
        description: description,
        url: `https://standx.com/perps?symbol=${symbol}`,
        color: 0x00AA00, // Green for successful close
        timestamp: new Date().toISOString(),
        thumbnail: {
          url: "https://standx.com/logo.png"
        },
      }
    ]
  }
  
  discordWebhook(payload);
}

export async function newOrder(payload: NewOrderPayload, auth: any, bearerToken: string) {
  try {
    const payloadString = JSON.stringify(payload);
    const headers = auth.signRequest(payloadString, crypto.randomUUID(), Date.now());

    let response = await fetch("https://perps.standx.com/api/new_order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
        ...headers,
      },
      body: payloadString,
    });

    const data = await response.json();
    if (data.code != 0) {
      console.log("newOrderError, message:", data.message);
    }
    return data;
  } catch (error) {
    console.error("newOrderError:", error);
  }
}



export async function queryOrders(bearerToken: string) {
  try {
    let response = await fetch("https://perps.standx.com/api/query_open_orders", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
      }
    });

    const data = await response.json();
    if (data.code != 0) {
      console.log("queryOrdersError, message:", data.message);
    } else {
      return data;
    }
  } catch (error) {
    console.error("queryOrdersError:", error);
  }
}

export async function cancelOrder(order_id: number, auth: any, bearerToken: string) {
  try {
    const payload = JSON.stringify({
      order_id: order_id
    });

    const headers = auth.signRequest(payload, crypto.randomUUID(), Date.now());

    let response = await fetch("https://perps.standx.com/api/cancel_order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
        ...headers,
      },
      body: payload,
    });

    const data = await response.json();
    if (data.code != 0) {
      console.log("cancelOrderError, message:", data.message);
    }
    return data;
  } catch (error) {
    console.error("cancelOrderError:", error);
  }
}

export async function changeLeverage(new_leverage: number, symbol: string, auth: any, bearerToken: string) {
  try {
    const payload = JSON.stringify({
      leverage: new_leverage,
      symbol: symbol,
    });

    const headers = auth.signRequest(payload, crypto.randomUUID(), Date.now());

    let response = await fetch("https://perps.standx.com/api/change_leverage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
        ...headers,
      },
      body: payload,
    });

    const data = await response.json();
    if (data.code != 0) {
      console.log("changeLeverageError, message:", data.message);
    }
  } catch (error) {
    console.error("changeLeverageError:", error);
  }
}

export async function queryPositionConfig(symbol: string, bearerToken: string) {
  try {
    let response = await fetch(`https://perps.standx.com/api/query_position_config?symbol=${symbol}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
      }
    });

    const data = await response.json();
    if (data.code != 0) {
      console.log("queryPositionConfig Error, message:", data.message);
    }
    return data;
  } catch (error) {
    console.error("queryPositionConfig Error:", error);
  }
}

export async function queryPosition(bearerToken: string) {
  try {
    let response = await fetch(`https://perps.standx.com/api/query_positions`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
      }
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("queryPosition Error:", error);
  }
}