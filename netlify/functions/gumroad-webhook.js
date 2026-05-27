import "dotenv/config";
import crypto from "node:crypto";

const jsonHeaders = { "content-type": "application/json" };

function jsonResponse(body, statusCode = 200) {
  return { statusCode, headers: jsonHeaders, body: JSON.stringify(body) };
}

function sha256(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
  const expectedToken = process.env.GUMROAD_WEBHOOK_TOKEN || "";
  const token = event.queryStringParameters?.token || "";
  if (expectedToken && token !== expectedToken) return jsonResponse({ error: "Unauthorized webhook token." }, 401);

  const params = new URLSearchParams(event.body || "");
  const saleRaw = params.get("sale");
  const sale = saleRaw ? JSON.parse(saleRaw) : null;
  if (!sale) return jsonResponse({ error: "Missing sale payload." }, 400);

  const pixelId = process.env.META_PIXEL_ID || "";
  const accessToken = process.env.META_ACCESS_TOKEN || "";
  const testEventCode = process.env.META_TEST_EVENT_CODE || "";
  if (!pixelId || !accessToken) return jsonResponse({ ok: false, error: "Missing Meta CAPI env vars." }, 500);

  const value = Number(sale.price || sale.total_price_cents / 100 || 0);
  const currency = String(sale.currency || "USD").toUpperCase();
  const eventId = `gumroad_${sale.id || sale.sale_id || crypto.randomUUID()}`;

  const body = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: sale.product_permalink || "",
        user_data: {
          em: sha256(sale.email || "") || undefined,
          client_ip_address: event.headers["x-forwarded-for"] || "",
          client_user_agent: event.headers["user-agent"] || ""
        },
        custom_data: { value, currency }
      }
    ]
  };
  if (testEventCode) body.test_event_code = testEventCode;

  const response = await fetch(`https://graph.facebook.com/v22.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) return jsonResponse({ ok: false, result }, response.status);
  return jsonResponse({ ok: true, eventId });
}
