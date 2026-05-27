import "dotenv/config";
import crypto from "node:crypto";

const jsonHeaders = { "content-type": "application/json" };

function jsonResponse(body, statusCode = 200) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body)
  };
}

function sha256(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const pixelId = process.env.META_PIXEL_ID || "";
  const accessToken = process.env.META_ACCESS_TOKEN || "";
  const testEventCode = process.env.META_TEST_EVENT_CODE || "";
  if (!pixelId || !accessToken) return jsonResponse({ error: "Missing Meta CAPI env vars." }, 500);

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse({ error: "Invalid JSON." }, 400);
  }

  const eventName = String(payload.eventName || "").trim();
  if (!eventName) return jsonResponse({ error: "eventName is required." }, 400);

  const clientIpAddress = event.headers["x-forwarded-for"] || "";
  const clientUserAgent = event.headers["user-agent"] || "";
  const body = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: payload.eventId || crypto.randomUUID(),
        action_source: "website",
        event_source_url: payload.eventSourceUrl || "",
        user_data: {
          client_ip_address: clientIpAddress,
          client_user_agent: clientUserAgent,
          fbp: payload.userData?.fbp || undefined,
          fbc: payload.userData?.fbc || undefined,
          external_id: sha256(payload.userData?.externalId || "") || undefined
        },
        custom_data: payload.customData || {}
      }
    ]
  };

  if (testEventCode) body.test_event_code = testEventCode;

  try {
    const response = await fetch(`https://graph.facebook.com/v22.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) return jsonResponse({ ok: false, result }, response.status);
    return jsonResponse({ ok: true, result });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
}
