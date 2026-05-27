const gaId = import.meta.env.VITE_GA_MEASUREMENT_ID || "";
const metaPixelId = import.meta.env.VITE_META_PIXEL_ID || "";
const metaConversionApiPath = "/api/meta-conversion";

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

function getCookie(name) {
  if (typeof document === "undefined") return "";
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function getAnonymousExternalId() {
  if (typeof localStorage === "undefined") return "";
  const key = "seatflow-anon-id";
  let value = localStorage.getItem(key);
  if (!value) {
    value = generateEventId("anon");
    localStorage.setItem(key, value);
  }
  return value;
}

function logAnalyticsError(error) {
  if (import.meta.env.DEV) console.warn("[SeatFlow analytics]", error);
}

export function generateEventId(prefix = "evt") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function sendMetaConversion(eventName, { eventId, customData = {} } = {}) {
  try {
    await fetch(metaConversionApiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        eventName,
        eventId,
        eventSourceUrl: typeof window !== "undefined" ? window.location.href : "",
        customData,
        userData: {
          fbp: getCookie("_fbp"),
          fbc: getCookie("_fbc"),
          externalId: getAnonymousExternalId()
        }
      })
    });
  } catch (error) {
    logAnalyticsError(error);
  }
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

export function trackEvent(eventName, params = {}, options = {}) {
  const payload = {
    app: "seatflow",
    ...params
  };

  sendGa(eventName, payload);
  if (options.sendMeta !== false) sendMeta(eventName, payload);

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

export function trackMetaStandard(eventName, params = {}, options = {}) {
  if (typeof window.fbq === "function") {
    try {
      const trackOptions = {};
      if (options.eventId) trackOptions.eventID = options.eventId;
      window.fbq("track", eventName, params, trackOptions);
    } catch (error) {
      logAnalyticsError(error);
    }
  }
}
