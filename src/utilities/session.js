export const LOGGED_IN_KEY = "logged_in";
export const LEGACY_ACCESS_KEY = "token";
export const LEGACY_REFRESH_KEY = "refresh_token";

export function hasSession() {
  return (
    localStorage.getItem(LOGGED_IN_KEY) === "1" || !!getLegacyAccessToken()
  );
}

export function getLegacyAccessToken() {
  const token = localStorage.getItem(LEGACY_ACCESS_KEY);
  if (!token || token === "undefined") {
    return null;
  }
  return token;
}

export function getLegacyRefreshToken() {
  const token = localStorage.getItem(LEGACY_REFRESH_KEY);
  if (!token || token === "undefined") {
    return null;
  }
  return token;
}

export function persistSessionFromLogin() {
  localStorage.setItem(LOGGED_IN_KEY, "1");
  localStorage.removeItem(LEGACY_ACCESS_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
  localStorage.removeItem("show_security_notice");
}

export function clearSession() {
  localStorage.removeItem(LOGGED_IN_KEY);
  localStorage.removeItem(LEGACY_ACCESS_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
  localStorage.removeItem("email");
}

export function attachWsAuth(wsMessage) {
  const token = getLegacyAccessToken();
  if (token) {
    wsMessage.token = token;
  }
  return wsMessage;
}

export function wsHelloMessage() {
  return attachWsAuth({});
}
