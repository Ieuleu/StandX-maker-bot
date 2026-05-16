export type Side = "buy" | "sell";
export type OrderType = "limit" | "market";
export type TimeInForce = "gtc" | "ioc" | "alo" ;
export type Status = "active" | "cancelled" | "filled"

export interface NewOrderPayload {
  symbol: string,
  side: Side,
  order_type: OrderType,
  qty: number,
  price: number,
  time_in_force: TimeInForce,
  reduce_only: boolean,
}

export interface Order {
  order_id: number;
  symbol: string;
  side: Side;
  price: number;
  qty: number;
  timestamp: number;
  status: Status;
}

export interface ActiveOrders {
  bid: Order | null;
  ask: Order | null;
}

export interface MarketMakerState {
  symbol: string;
  currentMarkPrice: number;
  activeOrders: ActiveOrders;
  targetSpreadBps: number; // Target spread in basis points (e.g., 7)
  toleranceBps: number,
  qty: number; // Size in BTC (max 2 for BTC-USD)
  lastUpdateTimestamp: number;
  lastFilledCheckTimestamp: number; // in order to check if an order is filled
  orderChangeTimestamps?: number[];
  cooldownUntil?: number;
}

export interface QueryOrdersResponse {
  code: number;
  message: string;
  page_size: number;
  result: Array<{
    id: number;
    cl_ord_id: string;
    symbol: string;
    side: "buy" | "sell";
    price: string;
    qty: string;
    fill_qty: string;
    status: string;
    order_type: string;
    position_id: number;
  }>;
}

export interface QueryPositionResponse {
  id: number;
  symbol: string;
  qty: string;
  entry_price: string;
  mark_price: string;
  leverage: string;
  status: string;
}

export interface DepthBookMessage {
  channel?: string;
  symbol?: string;
  data?: {
    mark_price?: number;
  };
}