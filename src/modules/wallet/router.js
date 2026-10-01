import lazyLoadView from "~/utilities/lazyLoad";
import { DEFAULT_WALLET_COIN } from "~/utilities/consts";

export default [
  {
    path: "/wallet",
    name: "wallet",
    component: lazyLoadView(import("~/modules/wallet/pages/Index.vue")),
    meta: {
      authRequired: true,
    },
  },
  {
    path: "/wallet/deposit/:walletitem",
    name: "wallet-deposit",
    component: lazyLoadView(import("~/modules/wallet/pages/Deposit.vue")),
    meta: {
      authRequired: true,
    },
  },
  {
    path: "/wallet/deposit",
    name: "wallet-deposit-root",
    redirect: `/wallet/deposit/${DEFAULT_WALLET_COIN}`,
    meta: {
      authRequired: true,
    },
  },
  {
    path: "/wallet/withdrawal/:walletitem",
    name: "wallet-withdrawal",
    component: lazyLoadView(import("~/modules/wallet/pages/Withdrawal.vue")),
    meta: {
      authRequired: true,
    },
  },
  {
    path: "/wallet/withdrawal",
    name: "wallet-withdrawal-root",
    redirect: `/wallet/withdrawal/${DEFAULT_WALLET_COIN}`,
    meta: {
      authRequired: true,
    },
  },
  {
    path: "/wallet/history/:walletitem",
    name: "wallet-history",
    component: lazyLoadView(import("~/modules/wallet/pages/History.vue")),
    meta: {
      authRequired: true,
    },
  },
  {
    path: "/wallet/history",
    name: "wallet-history-root",
    redirect: `/wallet/history/${DEFAULT_WALLET_COIN}`,
    meta: {
      authRequired: true,
    },
  },
];
