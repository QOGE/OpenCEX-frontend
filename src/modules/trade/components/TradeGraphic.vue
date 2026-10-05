<template>
  <div class="trade-graphic">
    <div id="graphic" ref="graphic" class="graphic"></div>
    <div class="pending-order-overlay" aria-hidden="true">
      <div
        v-for="line in overlayLines"
        :key="line.id"
        class="pending-order-line"
        :class="line.side"
        :style="line.style"
      >
        <span class="pending-order-line__label">{{ line.label }}</span>
      </div>
    </div>
  </div>
</template>

<script>
import { mapGetters } from "vuex";
import getDatafeed from "~/api/TradingView";
import { Orders } from "~/api/orders";
import { widget } from "~/assets/TradingView/charting_library/charting_library.esm.js";
import localConfig from "~/local_config";

const BUY_LINE_COLOR = "#72bb53";
const SELL_LINE_COLOR = "#ff5d55";
const PENDING_ORDERS_LIMIT = 200;
const PENDING_ORDERS_DEBOUNCE_MS = 300;
const PENDING_ORDERS_POLL_MS = 15000;

function hasDrawablePrice(order) {
  if (order == null || order.price == null || order.price === "") {
    return false;
  }
  const price = Number(order.price);
  return Number.isFinite(price) && price > 0;
}

export default {
  // eslint-disable-next-line vue/require-prop-types
  props: {
    precision: {
      type: Number,
      required: true,
    },
  },
  data() {
    return {
      tvWidget: null,
      datafeed: null,
      chartReady: false,
      chartDataReady: false,
      pendingOrders: [],
      overlayMetrics: null,
      pendingOrdersRequestId: 0,
      pendingOrdersTimer: null,
      pendingOrdersPoll: null,
      chartDataReadyTimer: null,
      overlaySyncTimer: null,
    };
  },
  computed: {
    ...mapGetters({
      baseCurrency: "getCurrentBaseCurrency",
      quoteCurrency: "getCurrentQuoteCurrency",
      openOrdersByPair: "core/openOrdersByPair",
      orders: "core/orders",
    }),
    isAuthorized() {
      return !!this.$store.getters["core/isAuthorized"];
    },
    pairCode() {
      if (!this.baseCurrency || !this.quoteCurrency) return "";
      return `${this.baseCurrency}-${this.quoteCurrency}`;
    },
    pendingOrdersFromStore() {
      const lists = [
        ...(this.openOrdersByPair?.list || []),
        ...(this.orders?.list || []),
      ];
      const byId = {};
      lists.forEach((order) => {
        if (!order || order.id == null) return;
        if (order.pair && order.pair !== this.pairCode) return;
        if (!hasDrawablePrice(order)) return;
        byId[order.id] = order;
      });
      return Object.values(byId);
    },
    openOrdersSignature() {
      return this.pendingOrdersFromStore
        .map(
          (order) =>
            `${order.id}:${order.price}:${order.quantity_left}:${order.state}`
        )
        .join("|");
    },
    overlayLines() {
      const metrics = this.overlayMetrics;
      if (
        !metrics ||
        !metrics.height ||
        metrics.priceTo === metrics.priceFrom
      ) {
        return [];
      }
      const span = metrics.priceTo - metrics.priceFrom;
      if (!span) return [];
      return this.pendingOrders
        .map((order) => {
          const price = Number(order.price);
          const y = ((metrics.priceTo - price) / span) * metrics.height;
          if (y < -8 || y > metrics.height + 8) return null;
          const isBuy = order.operation === 0;
          return {
            id: String(order.id),
            side: isBuy ? "buy" : "sell",
            label: `${isBuy ? "Buy" : "Sell"} ${this.formatOrderQuantity(
              order
            )}`,
            style: {
              top: `${metrics.top + y}px`,
              left: `${metrics.left}px`,
              width: `${metrics.width}px`,
              borderTopColor: isBuy ? BUY_LINE_COLOR : SELL_LINE_COLOR,
              color: isBuy ? BUY_LINE_COLOR : SELL_LINE_COLOR,
            },
          };
        })
        .filter(Boolean);
    },
    blockColorLocal() {
      return localConfig?.themes?.[this.currentTheme]?.block_color || "#FFF";
    },
    mainTextLocal() {
      return localConfig?.themes?.[this.currentTheme]?.main_text || "#000000";
    },
    lang() {
      return this.$locale;
    },
  },
  watch: {
    lang() {
      try {
        this.setGraphColor();
        this.makeChart();
      } catch (e) {
        console.log(e);
      }
    },
    precision: {
      immediate: true,
      handler(value) {
        if (!value) return;
        try {
          this.setGraphColor();
          this.makeChart();
        } catch (e) {
          console.log(e);
        }
      },
    },
    currentTheme() {
      this.setGraphColor();
      this.makeChart();
    },
    pairCode() {
      try {
        this.makeChart();
      } catch (e) {
        console.log(e);
      }
      this.loadPendingOrders();
    },
    isAuthorized() {
      this.loadPendingOrders();
      this.restartPendingOrdersPoll();
    },
    openOrdersSignature() {
      this.scheduleLoadPendingOrders();
    },
  },

  mounted() {
    const graphInterval = setInterval(() => {
      if (this.$refs.graphic) {
        try {
          this.makeChart();
        } catch (e) {
          console.log(e);
        }
        clearInterval(graphInterval);
      }
    }, 300);
    this.setGraphColor();
    this.restartPendingOrdersPoll();
  },

  beforeUnmount() {
    this.stopPendingOrdersPoll();
    if (this.pendingOrdersTimer) {
      clearTimeout(this.pendingOrdersTimer);
      this.pendingOrdersTimer = null;
    }
    if (this.chartDataReadyTimer) {
      clearTimeout(this.chartDataReadyTimer);
      this.chartDataReadyTimer = null;
    }
    this.stopOverlaySync();
    if (this.datafeed) this.datafeed.unsubscribeBars();
    if (this.tvWidget) {
      try {
        this.tvWidget.remove();
      } catch (e) {
        console.log(e);
      }
      this.tvWidget = null;
    }
    this.chartReady = false;
    this.chartDataReady = false;
  },

  methods: {
    changeTopColor() {
      setTimeout(() => {
        let iframe = document
          .getElementById("graphic")
          .getElementsByTagName("iframe")[0];
        let element = document.createElement("style");
        element.innerHTML = `.layout__area--top { background: ${this.blockColorLocal}; height: 39px !important;} .layout__area--top * { color: ${this.mainTextLocal} !important; }`;
        if (iframe) iframe.contentWindow.document.body.appendChild(element);
      }, 1000);
    },
    makeChart() {
      if (!this.$refs.graphic) return;
      if (this.datafeed) {
        this.datafeed.unsubscribeBars();
      }
      this.chartReady = false;
      this.chartDataReady = false;
      if (this.chartDataReadyTimer) {
        clearTimeout(this.chartDataReadyTimer);
        this.chartDataReadyTimer = null;
      }
      this.stopOverlaySync();
      this.overlayMetrics = null;
      if (this.tvWidget) {
        try {
          this.tvWidget.remove();
        } catch (e) {
          console.log(e);
        }
        this.tvWidget = null;
      }
      this.datafeed = getDatafeed(this.precision);
      const intervalFromLocalStorage =
        localStorage.getItem("chart_interval") || "5";
      const tvWidget = new widget({
        symbol: this.baseCurrency + "/" + this.quoteCurrency,
        interval: intervalFromLocalStorage,
        timezone: "Etc/UTC",
        container: this.$refs.graphic,
        locale: this.lang,
        datafeed: this.datafeed,
        library_path: "/public/TV/charting_library/",
        autosize: true,
        theme: this.theme === "dark" ? "Dark" : "Light",
        toolbar_bg: this.blockColorLocal,
        disabled_features: [
          "left_toolbar",
          "header_symbol_search",
          "header_indicators",
          "header_compare",
          "header_undo_redo",
          "header_interval_dialog_button",
          "show_interval_dialog_on_key_press",
          "header_fullscreen_button",
          "timeframes_toolbar",
          "context_menus",
        ],
      });
      this.tvWidget = tvWidget;

      tvWidget.onChartReady(() => {
        if (this.tvWidget !== tvWidget) return;
        this.chartReady = true;
        try {
          tvWidget.applyOverrides({
            "tradingProperties.showOrders": true,
          });
        } catch (e) {
          console.log(e);
        }
        try {
          tvWidget
            .chart()
            .onIntervalChanged()
            .subscribe(null, (interval) =>
              localStorage.setItem("chart_interval", interval)
            );
          // eslint-disable-next-line no-empty
        } catch (e) {}
        const markDataReady = () => {
          if (this.tvWidget !== tvWidget) return;
          this.chartDataReady = true;
          this.startOverlaySync();
          this.loadPendingOrders();
        };
        try {
          tvWidget.chart().onDataLoaded().subscribe(null, markDataReady, false);
          if (tvWidget.chart().dataReady(markDataReady)) {
            markDataReady();
          }
        } catch (e) {
          console.log(e);
          markDataReady();
        }
        this.chartDataReadyTimer = setTimeout(() => {
          if (this.tvWidget !== tvWidget || this.chartDataReady) return;
          markDataReady();
        }, 2000);
      });
    },
    scheduleLoadPendingOrders() {
      if (this.pendingOrdersTimer) {
        clearTimeout(this.pendingOrdersTimer);
      }
      this.pendingOrdersTimer = setTimeout(() => {
        this.pendingOrdersTimer = null;
        this.loadPendingOrders();
      }, PENDING_ORDERS_DEBOUNCE_MS);
    },
    restartPendingOrdersPoll() {
      this.stopPendingOrdersPoll();
      if (!this.isAuthorized) return;
      this.pendingOrdersPoll = setInterval(() => {
        this.loadPendingOrders();
      }, PENDING_ORDERS_POLL_MS);
    },
    stopPendingOrdersPoll() {
      if (this.pendingOrdersPoll) {
        clearInterval(this.pendingOrdersPoll);
        this.pendingOrdersPoll = null;
      }
    },
    mergePendingOrders(fromApi) {
      const byId = {};
      this.pendingOrdersFromStore.forEach((order) => {
        byId[order.id] = order;
      });
      (fromApi || []).forEach((order) => {
        if (!hasDrawablePrice(order)) return;
        if (order.pair && order.pair !== this.pairCode) return;
        byId[order.id] = order;
      });
      return Object.values(byId);
    },
    async loadPendingOrders() {
      if (!this.isAuthorized || !this.pairCode) {
        this.pendingOrders = [];
        this.updateOverlayMetrics();
        return;
      }
      this.pendingOrders = this.mergePendingOrders([]);
      this.updateOverlayMetrics();
      const requestId = ++this.pendingOrdersRequestId;
      const pair = this.pairCode;
      try {
        const body = await Orders.list({
          opened: true,
          pair,
          limit: PENDING_ORDERS_LIMIT,
        });
        if (
          requestId !== this.pendingOrdersRequestId ||
          pair !== this.pairCode
        ) {
          return;
        }
        const results = Array.isArray(body) ? body : body?.results || [];
        this.pendingOrders = this.mergePendingOrders(results);
        this.updateOverlayMetrics();
      } catch (e) {
        if (requestId !== this.pendingOrdersRequestId) return;
        console.log(e);
        this.pendingOrders = this.mergePendingOrders([]);
        this.updateOverlayMetrics();
      }
    },
    getChart() {
      if (!this.chartReady || !this.chartDataReady || !this.tvWidget) {
        return null;
      }
      try {
        return this.tvWidget.chart();
      } catch (e) {
        console.log(e);
        return null;
      }
    },
    formatOrderQuantity(order) {
      const value =
        order.quantity_left != null ? order.quantity_left : order.quantity;
      const asNumber = Number(value);
      if (!Number.isFinite(asNumber)) {
        return String(value || "");
      }
      return String(asNumber);
    },
    startOverlaySync() {
      this.stopOverlaySync();
      this.updateOverlayMetrics();
      this.overlaySyncTimer = setInterval(() => {
        this.updateOverlayMetrics();
      }, 400);
    },
    stopOverlaySync() {
      if (this.overlaySyncTimer) {
        clearInterval(this.overlaySyncTimer);
        this.overlaySyncTimer = null;
      }
    },
    getPriceRange() {
      const chart = this.getChart();
      if (!chart) return null;
      try {
        const panes = chart.getPanes && chart.getPanes();
        const pane = panes && panes[0];
        const scale = pane && pane.getMainSourcePriceScale();
        const range = scale && scale.getVisiblePriceRange();
        if (range && range.from != null && range.to != null) {
          return range;
        }
      } catch (e) {
        console.log(e);
      }
      try {
        return chart.getVisiblePriceRange();
      } catch (e) {
        console.log(e);
        return null;
      }
    },
    getPaneBox() {
      const root = this.$el;
      const graphic = this.$refs.graphic;
      if (!root || !graphic) return null;
      const iframe = graphic.getElementsByTagName("iframe")[0];
      if (!iframe) return null;
      let pane = null;
      try {
        const doc = iframe.contentWindow && iframe.contentWindow.document;
        if (doc) {
          const panes = doc.querySelectorAll(".chart-markup-table.pane");
          pane = panes[0] || null;
        }
      } catch (e) {
        console.log(e);
      }
      const rootRect = root.getBoundingClientRect();
      const iframeRect = iframe.getBoundingClientRect();
      if (pane) {
        const paneRect = pane.getBoundingClientRect();
        return {
          top: iframeRect.top - rootRect.top + paneRect.top,
          left: iframeRect.left - rootRect.left + paneRect.left,
          width: paneRect.width,
          height: paneRect.height,
        };
      }
      return {
        top: iframeRect.top - rootRect.top + 39,
        left: iframeRect.left - rootRect.left,
        width: Math.max(iframeRect.width - 72, 0),
        height: Math.max(iframeRect.height - 39 - 28, 0),
      };
    },
    updateOverlayMetrics() {
      const range = this.getPriceRange();
      const box = this.getPaneBox();
      if (!range || !box || box.height < 8) {
        this.overlayMetrics = null;
        return;
      }
      this.overlayMetrics = {
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
        priceFrom: range.from,
        priceTo: range.to,
      };
    },
    setGraphColor() {
      let graphTheme = {
        timezone: "Etc/UTC",
        priceScaleSelectionStrategyName: "auto",
        dataWindowProperties: {
          background: this.blockColorLocal,
          border: "rgba( 96, 96, 144, 1)",
          font: "Verdana",
          fontBold: false,
          fontItalic: false,
          fontSize: 10,
          transparency: 80,
          visible: true,
        },
        paneProperties: {
          backgroundType: "solid",
          background: this.blockColorLocal,
          backgroundGradientStartColor: this.blockColorLocal,
          backgroundGradientEndColor: this.blockColorLocal,
          vertGridProperties: {
            color:
              this.theme === "dark"
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(42, 46, 57, 0.06)",
            style: 0,
          },
          horzGridProperties: {
            color:
              this.theme === "dark"
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(42, 46, 57, 0.06)",
            style: 0,
          },
          crossHairProperties: {
            color: "#9598A1",
            style: 2,
            transparency: 0,
            width: 1,
          },
          topMargin: 10,
          bottomMargin: 8,
          axisProperties: {
            autoScale: true,
            autoScaleDisabled: false,
            lockScale: false,
            percentage: false,
            percentageDisabled: false,
            indexedTo100: false,
            log: false,
            logDisabled: false,
            alignLabels: true,
            isInverted: false,
          },
          legendProperties: {
            showStudyArguments: true,
            showStudyTitles: true,
            showStudyValues: true,
            showSeriesTitle: true,
            showSeriesOHLC: true,
            showLegend: true,
            showBarChange: true,
            showBackground: true,
            backgroundTransparency: 50,
            wrapText: false,
          },
        },
        scalesProperties: {
          backgroundColor: this.blockColorLocal,
          lineColor:
            this.theme === "dark"
              ? "rgba(255, 255, 255, 0.08)"
              : "rgba(42, 46, 57, 0.14)",
          textColor: this.mainTextLocal,
          fontSize: 12,
          scaleSeriesOnly: false,
          showSeriesLastValue: true,
          seriesLastValueMode: 1,
          showSeriesPrevCloseValue: false,
          showStudyLastValue: false,
          showSymbolLabels: false,
          showStudyPlotLabels: false,
          showBidAskLabels: false,
          showPrePostMarketPriceLabel: true,
          showFundamentalNameLabel: false,
          showFundamentalLastValue: false,
          barSpacing: 6,
          showCurrency: true,
          showUnit: true,
        },
        mainSeriesProperties: {
          style: 1,
          esdShowDividends: true,
          esdShowSplits: true,
          esdShowEarnings: true,
          esdShowBreaks: false,
          esdFlagSize: 2,
          showCountdown: false,
          bidAsk: {
            visible: false,
            lineStyle: 1,
            lineWidth: 1,
            bidLineColor: "#2962FF",
            askLineColor: "#EF5350",
          },
          prePostMarket: {
            visible: true,
            lineStyle: 1,
            lineWidth: 1,
            preMarketColor: "#fb8c00",
            postMarketColor: "#2962FF",
          },
          highLowAvgPrice: {
            highLowPriceLinesVisible: false,
            highLowPriceLabelsVisible: false,
            averageClosePriceLineVisible: false,
            averageClosePriceLabelVisible: false,
          },
          showInDataWindow: true,
          visible: true,
          showPriceLine: true,
          priceLineWidth: 1,
          priceLineColor: "",
          baseLineColor: "#5d606b",
          showPrevClosePriceLine: false,
          prevClosePriceLineWidth: 1,
          prevClosePriceLineColor: "rgba( 85, 85, 85, 1)",
          minTick: "default",
          dividendsAdjustment: {},
          sessionId: "regular",
          sessVis: false,
          statusViewStyle: {
            fontSize: 16,
            showExchange: true,
            showInterval: true,
            symbolTextSource: "description",
          },
          candleStyle: {
            upColor: "#26a69a",
            downColor: "#ef5350",
            drawWick: true,
            drawBorder: true,
            borderColor: "#378658",
            borderUpColor: "#26a69a",
            borderDownColor: "#ef5350",
            wickColor: "#B5B5B8",
            wickUpColor: "#26a69a",
            wickDownColor: "#ef5350",
            barColorsOnPrevClose: false,
            drawBody: true,
          },
          hollowCandleStyle: {
            upColor: "#26a69a",
            downColor: "#ef5350",
            drawWick: true,
            drawBorder: true,
            borderColor: "#378658",
            borderUpColor: "#26a69a",
            borderDownColor: "#ef5350",
            wickColor: "#B5B5B8",
            wickUpColor: "#26a69a",
            wickDownColor: "#ef5350",
            drawBody: true,
          },
          haStyle: {
            upColor: "#26a69a",
            downColor: "#ef5350",
            drawWick: true,
            drawBorder: true,
            borderColor: "#378658",
            borderUpColor: "#26a69a",
            borderDownColor: "#ef5350",
            wickColor: "#B5B5B8",
            wickUpColor: "#26a69a",
            wickDownColor: "#ef5350",
            showRealLastPrice: false,
            barColorsOnPrevClose: false,
            inputs: {},
            inputInfo: {},
            drawBody: true,
          },
          barStyle: {
            upColor: "#26a69a",
            downColor: "#ef5350",
            barColorsOnPrevClose: false,
            dontDrawOpen: false,
            thinBars: true,
          },
          hiloStyle: {
            color: "#2962FF",
            showBorders: true,
            borderColor: "#2962FF",
            showLabels: true,
            labelColor: "#2962FF",
            fontSize: 7,
            drawBody: true,
          },
          lineStyle: {
            color: "#2962FF",
            linestyle: 0,
            linewidth: 2,
            priceSource: "close",
            styleType: 2,
          },
          areaStyle: {
            color1: "rgba(41, 98, 255, 0.28)",
            color2: "#2962FF",
            linecolor: "#2962FF",
            linestyle: 0,
            linewidth: 2,
            priceSource: "close",
            transparency: 100,
          },
          priceAxisProperties: {
            autoScale: true,
            autoScaleDisabled: false,
            lockScale: false,
            percentage: false,
            percentageDisabled: false,
            indexedTo100: false,
            log: false,
            logDisabled: false,
            isInverted: false,
            alignLabels: true,
          },
          renkoStyle: {
            upColor: "#26a69a",
            downColor: "#ef5350",
            borderUpColor: "#26a69a",
            borderDownColor: "#ef5350",
            upColorProjection: "#336854",
            downColorProjection: "#7f323f",
            borderUpColorProjection: "#336854",
            borderDownColorProjection: "#7f323f",
            wickUpColor: "#26a69a",
            wickDownColor: "#ef5350",
            inputs: {
              source: "close",
              sources: "Close",
              boxSize: 3,
              style: "ATR",
              atrLength: 14,
              wicks: true,
            },
            inputInfo: {
              source: {
                name: "source",
              },
              sources: {
                name: "Source",
              },
              boxSize: {
                name: "Box size",
              },
              style: {
                name: "Style",
              },
              atrLength: {
                name: "ATR length",
              },
              wicks: {
                name: "Wicks",
              },
            },
          },
          pbStyle: {
            upColor: "#26a69a",
            downColor: "#ef5350",
            borderUpColor: "#26a69a",
            borderDownColor: "#ef5350",
            upColorProjection: "#336854",
            downColorProjection: "#7f323f",
            borderUpColorProjection: "#336854",
            borderDownColorProjection: "#7f323f",
            inputs: {
              source: "close",
              lb: 3,
            },
            inputInfo: {
              source: {
                name: "Source",
              },
              lb: {
                name: "Number of line",
              },
            },
          },
          kagiStyle: {
            upColor: "#26a69a",
            downColor: "#ef5350",
            upColorProjection: "#336854",
            downColorProjection: "#7f323f",
            inputs: {
              source: "close",
              style: "ATR",
              atrLength: 14,
              reversalAmount: 1,
            },
            inputInfo: {
              source: {
                name: "Source",
              },
              style: {
                name: "Style",
              },
              atrLength: {
                name: "ATR length",
              },
              reversalAmount: {
                name: "Reversal amount",
              },
            },
          },
          pnfStyle: {
            upColor: "#26a69a",
            downColor: "#ef5350",
            upColorProjection: "#336854",
            downColorProjection: "#7f323f",
            inputs: {
              sources: "Close",
              reversalAmount: 3,
              boxSize: 1,
              style: "ATR",
              atrLength: 14,
              oneStepBackBuilding: false,
            },
            inputInfo: {
              sources: {
                name: "Source",
              },
              boxSize: {
                name: "Box size",
              },
              reversalAmount: {
                name: "Reversal amount",
              },
              style: {
                name: "Style",
              },
              atrLength: {
                name: "ATR length",
              },
              oneStepBackBuilding: {
                name: "One step back building",
              },
            },
          },
          baselineStyle: {
            baselineColor: "rgba( 117, 134, 150, 1)",
            topFillColor1: "rgba( 38, 166, 154, 0.28)",
            topFillColor2: "rgba( 38, 166, 154, 0.05)",
            bottomFillColor1: "rgba( 239, 83, 80, 0.05)",
            bottomFillColor2: "rgba( 239, 83, 80, 0.28)",
            topLineColor: "rgba( 38, 166, 154, 1)",
            bottomLineColor: "rgba( 239, 83, 80, 1)",
            topLineWidth: 2,
            bottomLineWidth: 2,
            priceSource: "close",
            transparency: 50,
            baseLevelPercentage: 50,
          },
          rangeStyle: {
            upColor: "#26a69a",
            downColor: "#ef5350",
            thinBars: true,
            upColorProjection: "#336854",
            downColorProjection: "#7f323f",
            inputs: {
              range: 10,
              phantomBars: false,
            },
            inputInfo: {
              range: {
                name: "Range",
              },
              phantomBars: {
                name: "Phantom bars",
              },
            },
          },
          symbol: "BTC/USDT",
          shortName: "",
          timeframe: "",
          onWidget: false,
          interval: "5",
          unitId: null,
          currencyId: null,
        },
        chartEventsSourceProperties: {
          visible: true,
          futureOnly: true,
          breaks: {
            color: "rgba(85, 85, 85, 1)",
            visible: false,
            style: 2,
            width: 1,
          },
        },
        tradingProperties: {
          showPositions: true,
          positionPL: {
            visibility: true,
            display: 0,
          },
          showOrders: true,
          showExecutions: true,
          horizontalAlignment: 0,
          extendLeft: true,
          lineLength: 5,
          lineWidth: 1,
          lineStyle: 0,
        },
        editorFontsList: {
          0: "Verdana",
          1: "Courier New",
          2: "Times New Roman",
          3: "Arial",
        },
        volumePaneSize: "large",
      };
      try {
        localStorage.setItem(
          "tradingview.chartproperties",
          JSON.stringify(graphTheme)
        );
        // eslint-disable-next-line no-empty
      } catch {}
      this.changeTopColor();
    },
  },
};
</script>

<style scoped>
.trade-graphic {
  position: relative;
  height: 100%;
  min-height: inherit;
}
.trade-graphic .graphic {
  height: 100%;
  margin-top: 0;
}
.pending-order-overlay {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 4;
}
.pending-order-line {
  position: absolute;
  height: 0;
  border-top: 1px dotted;
  box-sizing: border-box;
}
.pending-order-line__label {
  position: absolute;
  right: 4px;
  top: -15px;
  font-size: 11px;
  font-weight: 600;
  line-height: 14px;
  white-space: nowrap;
  text-shadow: 0 1px 2px #07080c;
}
</style>
