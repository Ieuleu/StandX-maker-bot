import { MarketMakerState} from "./types";


export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function calculateSpreadBps(price: number, markPrice: number): number {
  return Math.abs((price - markPrice) / markPrice) * 10000;
}

export function calculateOrderPrices(markPrice: number, spreadBps: number): { bidPrice: number; askPrice: number } {
  const spreadMultiplier = spreadBps / 10000;
  
  const bidPrice = Math.round(markPrice * (1 - spreadMultiplier) * 100) / 100;
  const askPrice = Math.round(markPrice * (1 + spreadMultiplier) * 100) / 100;
  
  return { bidPrice, askPrice };
}

export function areOrdersWithinSpread(state: MarketMakerState): boolean {
  const bidOrder = state.activeOrders.bid;
  const askOrder = state.activeOrders.ask;
  const markPrice = state.currentMarkPrice;

  if (!bidOrder || !askOrder) {
    return false;
  }

  if (bidOrder.price >= markPrice) {
    console.warn("(areOrdersWithinSpread) Bid price >= mark price - invalid order placement");
    return false;
  }

  if (askOrder.price <= markPrice) {
    console.warn("(areOrdersWithinSpread) Ask price <= mark price - invalid order placement");
    return false;
  }

  const bidSpread = calculateSpreadBps(bidOrder.price, markPrice);
  const askSpread = calculateSpreadBps(askOrder.price, markPrice);

  const toleranceBps = state.toleranceBps;
  const maxAllowedSpread = state.targetSpreadBps + toleranceBps;

  const bidWithinTolerance = bidSpread <= maxAllowedSpread;
  const askWithinTolerance = askSpread <= maxAllowedSpread;

  if (!bidWithinTolerance || !askWithinTolerance) {
    console.log(`(areOrdersWithinSpread) Orders outside tolerance - Bid: ${bidSpread.toFixed(2)} bps, Ask: ${askSpread.toFixed(2)} bps, Max: ${maxAllowedSpread} bps`);
  }

  return bidWithinTolerance && askWithinTolerance;
}
