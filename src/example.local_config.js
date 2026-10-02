//###########################################################################
//   OpenCEX Frontend configuration file. More info
//   https://polygant.notion.site/Settings-3f9e0aae880e433a9d23e76f62a4a456
//###########################################################################

const localConfig = {
  wss_url: "wss://",
  two_fa: "${PROJECT_NAME}",
  project_title: "${PROJECT_NAME}",
  api: {
    baseURL: "https://${DOMAIN}/api/v1/",
    basePublicURL: "https://${DOMAIN}/api/public/v1/",
    host: "${DOMAIN}",
  },
  api_url: "https://${DOMAIN}",
  api_url_plane: "${DOMAIN}",
  recaptcha_site_key: "${RECAPTCHA}",
  vue_v: "prod",
  site_domain: "${DOMAIN}",
  host: "${DOMAIN}",
  help_widget: "${HELP_WIDGET}",
  logo: "${LOGO}",
  themes: [
    {
      main_color: "#2A2259",
      second_color: "#ffac2a",
      cancel_color: "#d93d47",
      login_background: "#36373c",
      login_text: "white",
      main_background: "#edf1fa",
      main_text: "#2a2259",
      input_color: "white",
      input_text: "#2a2259",
      block_color: "white",
      border_color: "#f0f0f0",
    },
    {
      main_color: "#6d7cff",
      second_color: "#2ee6c8",
      cancel_color: "#f43f5e",
      login_background: "#07080c",
      login_text: "#f1f2f6",
      main_background: "#07080c",
      main_text: "#c5c9d6",
      input_color: "#12151e",
      input_text: "#e8eaf2",
      block_color: "#0e1118",
      border_color: "#222838",
    },
  ],
  socials: {
    telegram: {
      link: "${TELEGRAM}",
      title: "sitechange",
    },
    telegramNews: {
      link: "${TG_NEWS}",
      title: "site_news",
    },
    mail: "${SUPPORT_EMAIL}",
    facebook: {
      link: "${FACEBOOK}",
      title: "Exchange",
    },
    twitter: {
      link: "${TWITTER}",
      title: "@",
    },
  },
};

export default localConfig;
