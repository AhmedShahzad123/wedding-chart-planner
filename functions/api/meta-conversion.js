const jsonHeaders = { "content-type": "application/json" };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders
  });
}

async function sha256(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  const bytes = new TextEncoder().encode(normalized);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((item) => item.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost(context) {
  const pixelId = context.env?.META_PIXEL_ID || "";
  const accessToken = context.env?.META_ACCESS_TOKEN || "";
  const testEventCode = context.env?.META_TEST_EVENT_CODE || "";
  if (!pixelId || !accessToken) return jsonResponse({ error: "Missing Meta CAPI env vars." }, 500);

  let payload = {};
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON." }, 400);
  }

  const eventName = String(payload.eventName || "").trim();
  if (!eventName) return jsonResponse({ error: "eventName is required." }, 400);

  const request = context.request;
  const fbp = String(payload.userData?.fbp || "");
  const fbc = String(payload.userData?.fbc || "");
  const externalIdHash = await sha256(payload.userData?.externalId || "");
  const clientIpAddress = request.headers.get("cf-connecting-ip") || "";
  const clientUserAgent = request.headers.get("user-agent") || "";

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
          fbp: fbp || undefined,
          fbc: fbc || undefined,
          external_id: externalIdHash || undefined
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

export function onRequest() {
  return jsonResponse({ error: "Method not allowed." }, 405);
}
