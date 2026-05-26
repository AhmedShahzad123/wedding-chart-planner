import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";

const logsPath = path.resolve(process.cwd(), "server", "logs", "chart-snapshots.ndjson");

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed." })
    };
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON." })
    };
  }

  const record = {
    id: typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    source: String(payload.source || "download_button"),
    unlocked: Boolean(payload.unlocked),
    paid: Boolean(payload.paid),
    guestCount: Number(payload.guestCount || 0),
    seatedCount: Number(payload.seatedCount || 0),
    tableCount: Number(payload.tableCount || 0),
    payload: payload.payload || null,
    userAgent: event.headers["user-agent"] || "",
    ipAddress: event.headers["x-forwarded-for"] || ""
  };

  try {
    await fs.mkdir(path.dirname(logsPath), { recursive: true });
    await fs.appendFile(logsPath, `${JSON.stringify(record)}\n`, "utf8");
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, id: record.id, storage: "local-file" })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: error.message })
    };
  }
}
