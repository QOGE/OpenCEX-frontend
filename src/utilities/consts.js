export const DEFAULT_TRADE_PAIR = "QOGE-USDT";
export const DEFAULT_TRADE_PATH = `/trade/${DEFAULT_TRADE_PAIR}`;
export const DEFAULT_WALLET_COIN = "QOGE";

export const TRADING_VOLUME = [
  {
    volume: "&le; 100 BTC",
    maker: 0.1,
    taker: 0.1,
  },
  {
    volume: "&ge; 100 BTC",
    maker: 0.1,
    taker: 0.1,
  },
  {
    volume: "&ge; 500 BTC",
    maker: 0.1,
    taker: 0.1,
  },
  {
    volume: "&ge; 1 000 BTC",
    maker: 0.1,
    taker: 0.1,
  },
  {
    volume: "&ge; 5 000 BTC",
    maker: 0.1,
    taker: 0.1,
  },
];
