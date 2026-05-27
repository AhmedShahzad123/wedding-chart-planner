const jsonHeaders = { "content-type": "application/json" };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function sha256(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  const bytes = new TextEncoder().encode(normalized);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((item) => item.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost(context) {
  const request = context.request;
  const url = new URL(request.url);
  const expectedToken = context.env?.GUMROAD_WEBHOOK_TOKEN || "";
  const token = url.searchParams.get("token") || "";
  if (expectedToken && token !== expectedToken) return jsonResponse({ error: "Unauthorized webhook token." }, 401);

  const formData = await request.formData();
  const saleRaw = formData.get("sale");
  const sale = saleRaw ? JSON.parse(String(saleRaw)) : null;
  if (!sale) return jsonResponse({ error: "Missing sale payload." }, 400);

  const pixelId = context.env?.META_PIXEL_ID || "";
  const accessToken = context.env?.META_ACCESS_TOKEN || "";
  const testEventCode = context.env?.META_TEST_EVENT_CODE || "";
  if (!pixelId || !accessToken) return jsonResponse({ ok: false, error: "Missing Meta CAPI env vars." }, 500);

  const value = Number(sale.price || sale.total_price_cents / 100 || 0);
  const currency = String(sale.currency || "USD").toUpperCase();
  const eventId = `gumroad_${sale.id || sale.sale_id || crypto.randomUUID()}`;
  const emailHash = await sha256(sale.email || "");

  const body = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: sale.product_permalink || "",
        user_data: {
          em: emailHash || undefined,
          client_ip_address: request.headers.get("cf-connecting-ip") || "",
          client_user_agent: request.headers.get("user-agent") || ""
        },
        custom_data: {
          value,
          currency
        }
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

export function onRequest() {
  return jsonResponse({ error: "Method not allowed." }, 405);
}
