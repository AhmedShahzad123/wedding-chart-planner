const gaId = import.meta.env.VITE_GA_MEASUREMENT_ID || "";
const metaPixelId = import.meta.env.VITE_META_PIXEL_ID || "";

function loadScript(src, id) {
  if (!src || document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function sendGa(eventName, params) {
  if (typeof window.gtag === "function") {
    try {
      window.gtag("event", eventName, params);
    } catch (error) {
      logAnalyticsError(error);
    }
  }
}

function sendMeta(eventName, params) {
  if (typeof window.fbq === "function") {
    try {
      window.fbq("trackCustom", eventName, params);
    } catch (error) {
      logAnalyticsError(error);
    }
  }
}

function logAnalyticsError(error) {
  if (import.meta.env.DEV) console.warn("[SeatFlow analytics]", error);
}

export function initAnalytics() {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };

  if (gaId) {
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`, "ga4-script");
    window.gtag("js", new Date());
    window.gtag("config", gaId, { send_page_view: true });
  }

  if (metaPixelId && !window.fbq) {
    window.fbq = function fbq() {
      window.fbq.callMethod ? window.fbq.callMethod.apply(window.fbq, arguments) : window.fbq.queue.push(arguments);
    };
    window.fbq.push = window.fbq;
    window.fbq.loaded = true;
    window.fbq.version = "2.0";
    window.fbq.queue = [];
    loadScript("https://connect.facebook.net/en_US/fbevents.js", "meta-pixel-script");
    window.fbq("init", metaPixelId);
    window.fbq("track", "PageView");
  }
}

export function trackEvent(eventName, params = {}) {
  const payload = {
    app: "seatflow",
    ...params
  };

  sendGa(eventName, payload);
  sendMeta(eventName, payload);

  if (import.meta.env.DEV) {
    try {
      const log = JSON.parse(localStorage.getItem("seatflow-analytics-debug") || "[]");
      log.push({ eventName, payload, at: new Date().toISOString() });
      localStorage.setItem("seatflow-analytics-debug", JSON.stringify(log.slice(-100)));
      console.info("[SeatFlow analytics]", eventName, payload);
    } catch (error) {
      logAnalyticsError(error);
    }
  }
}

export function trackMetaStandard(eventName, params = {}) {
  if (typeof window.fbq === "function") {
    try {
      window.fbq("track", eventName, params);
    } catch (error) {
      logAnalyticsError(error);
    }
  }
}
