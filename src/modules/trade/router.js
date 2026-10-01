import lazyLoadView from "~/utilities/lazyLoad";
import { DEFAULT_TRADE_PATH } from "~/utilities/consts";

export default [
  {
    path: "/trade/:pairprop",
    name: "trade-pair",
    component: lazyLoadView(import("~/modules/trade/pages/Trade.vue")),
    props: true,
  },
  {
    path: "/trade",
    name: "trade",
    redirect: DEFAULT_TRADE_PATH,
  },
];
