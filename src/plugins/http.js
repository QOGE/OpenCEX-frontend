import axios from "axios";
import config from "~/local_config";
import store from "~/store";
import jwt_decode from "jwt-decode";
import { getLegacyAccessToken, hasSession } from "~/utilities/session";

export default (app) => {
  app.config.globalProperties.$http = axios.create({
    baseURL: config.api.baseURL,
    withCredentials: true,
  });

  const router = app.config.globalProperties.$router;

  const noAuthRequireRoutes = ["/account/trade/QOGE-USDT"];

  router.options.routes.forEach((item) => {
    if (!item.meta || !item.meta.authRequired) {
      if (item.path && item.path !== "/") {
        if (item.path.indexOf("/:") > 0) {
          noAuthRequireRoutes.push(
            "/account" + item.path.slice(0, item.path.indexOf("/:"))
          );
        } else {
          noAuthRequireRoutes.push("/account" + item.path);
        }
      }
    }
  });

  const noAuthRequireApis = [
    "/auth/login/",
    "/auth/registration/",
    "/auth/registration/verify-email/",
    "/auth/password/reset/",
    "/check2falogin/",
    "/checkgooglecode/",
    "/check_invite/",
    "/pairs_volume/",
    "/withdrawal/confirm-withdrawal-request",
    "/check_captcha/",
    "/auth/password/reset/confirm/",
  ].map((uri) => config.api.baseURL + uri);

  app.config.globalProperties.$http.interceptors.request.use(
    async function (config) {
      config.withCredentials = true;
      config.headers["X-API-LANG"] = localStorage.getItem("planguage") || "en";
      let token = getLegacyAccessToken();
      if (token) {
        try {
          let payload = jwt_decode(token);
          let expTime = payload.exp * 1000;
          let curTime = new Date().getTime();
          if (expTime - curTime <= 3000) {
            if (config.url !== "auth/token/refresh/") {
              await store.dispatch("core/refreshToken");
            }
          }
        } catch (err) {
          if (config.url !== "auth/token/refresh/") {
            await store.dispatch("core/refreshToken");
          }
        }
        token = getLegacyAccessToken();
        if (!noAuthRequireApis.includes(config.url) && token) {
          config.headers["Authorization"] = "Bearer " + token;
        }
      }
      return config;
    },
    function (error) {
      return Promise.reject(error);
    }
  );

  app.config.globalProperties.$http.interceptors.response.use(
    function (response) {
      return transformResponse(response);
    },
    async function (error) {
      const failedUrl = error.response?.config?.url || "";
      const skipRefresh =
        failedUrl.includes("auth/token/refresh/") ||
        failedUrl.includes("auth/logout/") ||
        noAuthRequireApis.includes(failedUrl);
      if (error.response?.status === 401 && !skipRefresh && hasSession()) {
        const originalRequest = error.config || {};
        if (!originalRequest._retried) {
          originalRequest._retried = true;
          try {
            await store.dispatch("core/refreshToken");
            const refreshed = getLegacyAccessToken();
            if (refreshed) {
              originalRequest.headers = originalRequest.headers || {};
              originalRequest.headers["Authorization"] = "Bearer " + refreshed;
            }
            originalRequest.withCredentials = true;
            return app.config.globalProperties.$http(originalRequest);
          } catch (e) {
            console.log(e);
          }
        }
        const pathname = window.location.pathname;
        const matchNotAuthViews = noAuthRequireRoutes.find((route) =>
          pathname.startsWith(route)
        );
        if (pathname !== "/" && !matchNotAuthViews) {
          const lastPage = router.currentRoute.value.fullPath;
          if (lastPage) {
            router.push({ name: "login", query: { redirectFrom: lastPage } });
          } else {
            router.push({ name: "login" });
          }
        }
      }
      if (
        error.response &&
        error.response?.data?.code?.code === "token_not_valid"
      ) {
        return Promise.reject();
      } else {
        return Promise.reject(
          error && error.response ? transformResponse(error.response) : error
        );
      }
    }
  );

  function transformResponse(response) {
    return {
      ...response,
      body: response.data,
    };
  }
};

export const http = axios.create({
  baseURL: config.api.baseURL,
  withCredentials: true,
});
