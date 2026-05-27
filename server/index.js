import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fallbackParse, parseGuestInput } from "./parser.js";

const app = express();
const port = process.env.PORT || 8787;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));

app.post("/api/parse-guests", async (req, res) => {
  try {
    res.json(await parseGuestInput(req.body?.input));
  } catch (error) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    res.json({
      ...fallbackParse(req.body?.input || ""),
      warning: "Used quick import. Please review names before downloading.",
      detail: error.message
    });
  }
});

app.post("/api/save-chart", async (req, res) => {
  const payload = req.body || {};
  try {
    const now = new Date().toISOString();
    const snapshot = {
      id: typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
      ip: req.headers["cf-connecting-ip"] || req.ip || "",
      userAgent: req.headers["user-agent"] || "",
      source: String(payload.source || "download_button"),
      unlocked: Boolean(payload.unlocked),
      paid: Boolean(payload.paid),
      guestCount: Number(payload.guestCount || 0),
      seatedCount: Number(payload.seatedCount || 0),
      tableCount: Number(payload.tableCount || 0),
      payload: payload.payload || null
    };
    const logsDir = path.join(rootDir, "server", "logs");
    await fs.mkdir(logsDir, { recursive: true });
    await fs.appendFile(path.join(logsDir, "chart-snapshots.ndjson"), `${JSON.stringify(snapshot)}\n`, "utf8");
    res.json({ ok: true, id: snapshot.id, storage: "local-file" });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/meta-conversion", async (req, res) => {
  const pixelId = process.env.META_PIXEL_ID || "";
  const accessToken = process.env.META_ACCESS_TOKEN || "";
  const testEventCode = process.env.META_TEST_EVENT_CODE || "";
  if (!pixelId || !accessToken) {
    res.status(500).json({ error: "Missing Meta CAPI env vars." });
    return;
  }

  const eventName = String(req.body?.eventName || "").trim();
  if (!eventName) {
    res.status(400).json({ error: "eventName is required." });
    return;
  }

  const externalId = String(req.body?.userData?.externalId || "").trim().toLowerCase();
  const externalIdHash = externalId ? crypto.createHash("sha256").update(externalId).digest("hex") : "";
  const body = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: req.body?.eventId || crypto.randomUUID(),
        action_source: "website",
        event_source_url: req.body?.eventSourceUrl || "",
        user_data: {
          client_ip_address: req.headers["cf-connecting-ip"] || req.ip || "",
          client_user_agent: req.headers["user-agent"] || "",
          fbp: req.body?.userData?.fbp || undefined,
          fbc: req.body?.userData?.fbc || undefined,
          external_id: externalIdHash || undefined
        },
        custom_data: req.body?.customData || {}
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
    if (!response.ok) {
      res.status(response.status).json({ ok: false, result });
      return;
    }
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/gumroad-webhook", async (req, res) => {
  const expectedToken = process.env.GUMROAD_WEBHOOK_TOKEN || "";
  const token = String(req.query?.token || "");
  if (expectedToken && token !== expectedToken) {
    res.status(401).json({ error: "Unauthorized webhook token." });
    return;
  }

  const saleRaw = req.body?.sale;
  const sale = typeof saleRaw === "string" ? JSON.parse(saleRaw) : saleRaw;
  if (!sale) {
    res.status(400).json({ error: "Missing sale payload." });
    return;
  }

  const pixelId = process.env.META_PIXEL_ID || "";
  const accessToken = process.env.META_ACCESS_TOKEN || "";
  const testEventCode = process.env.META_TEST_EVENT_CODE || "";
  if (!pixelId || !accessToken) {
    res.status(500).json({ ok: false, error: "Missing Meta CAPI env vars." });
    return;
  }

  const value = Number(sale.price || sale.total_price_cents / 100 || 0);
  const currency = String(sale.currency || "USD").toUpperCase();
  const eventId = `gumroad_${sale.id || sale.sale_id || crypto.randomUUID()}`;
  const email = String(sale.email || "").trim().toLowerCase();
  const emailHash = email ? crypto.createHash("sha256").update(email).digest("hex") : "";
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
          client_ip_address: req.headers["cf-connecting-ip"] || req.ip || "",
          client_user_agent: req.headers["user-agent"] || ""
        },
        custom_data: { value, currency }
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
    if (!response.ok) {
      res.status(response.status).json({ ok: false, result });
      return;
    }
    res.json({ ok: true, eventId });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(rootDir, "dist")));
  app.use((_req, res) => {
    res.sendFile(path.join(rootDir, "dist", "index.html"));
  });
}

if (!process.env.VERCEL && !process.env.NETLIFY) {
  const server = app.listen(port, () => {
    console.log(`SeatFlow server listening on http://localhost:${port}`);
  });

  server.on("error", (error) => {
    console.error(error);
    process.exit(1);
  });
}

export default app;
