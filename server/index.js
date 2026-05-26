import "dotenv/config";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fallbackParse, parseGuestInput } from "./parser.js";

const app = express();
const port = process.env.PORT || 8787;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

app.use(express.json({ limit: "2mb" }));

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
