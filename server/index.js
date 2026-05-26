import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fallbackParse, parseGuestInput } from "./parser.js";

const app = express();
const port = process.env.PORT || 8787;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

app.use(express.json({ limit: "1mb" }));

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

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(rootDir, "dist")));
  app.get("*", (_req, res) => {
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
