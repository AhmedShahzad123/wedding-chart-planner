const jsonHeaders = { "content-type": "application/json" };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders
  });
}

export async function onRequestPost(context) {
  let payload = {};
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON." }, 400);
  }

  const db = context.env?.CHARTS_DB;
  if (!db?.prepare) {
    return jsonResponse({ error: "Missing CHARTS_DB binding." }, 500);
  }

  const request = context.request;
  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ipAddress: request.headers.get("cf-connecting-ip") || "",
    userAgent: request.headers.get("user-agent") || "",
    source: String(payload.source || "download_button"),
    unlocked: payload.unlocked ? 1 : 0,
    paid: payload.paid ? 1 : 0,
    guestCount: Number(payload.guestCount || 0),
    seatedCount: Number(payload.seatedCount || 0),
    tableCount: Number(payload.tableCount || 0),
    payloadJson: JSON.stringify(payload.payload || null)
  };

  try {
    await db.prepare(
      `INSERT INTO chart_snapshots (
        id, created_at, source, unlocked, paid, guest_count, seated_count, table_count, payload_json, user_agent, ip_address
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
    ).bind(
      record.id,
      record.createdAt,
      record.source,
      record.unlocked,
      record.paid,
      record.guestCount,
      record.seatedCount,
      record.tableCount,
      record.payloadJson,
      record.userAgent,
      record.ipAddress
    ).run();
    return jsonResponse({ ok: true, id: record.id, storage: "d1" });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
}

export function onRequest() {
  return jsonResponse({ error: "Method not allowed." }, 405);
}
