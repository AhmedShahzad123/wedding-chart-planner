# SeatFlow Wedding Seating Chart

Browser-based wedding/event seating chart MVP:

- Messy guest-list parsing with a local fallback parser
- Drag-and-drop seating planner
- Local autosave
- Gumroad PDF unlock through `?paid=true` or `?license=success`
- Printable PDF export from the same HTML preview
- GA4, Meta Pixel, and Meta Conversions API hooks
- Cloudflare Pages Functions backend for `/api/parse-guests`
- Snapshot logging for `/api/save-chart` (download attempts, paid or unpaid)

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Environment

Copy `.env.example` to `.env`:

```bash
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-flash-lite-latest
VITE_GUMROAD_URL=https://chartplan.gumroad.com/l/hgdfr
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_META_PIXEL_ID=000000000000000
META_PIXEL_ID=000000000000000
META_ACCESS_TOKEN=EAAB...
META_TEST_EVENT_CODE=TEST12345
GUMROAD_WEBHOOK_TOKEN=your_long_random_token
```

Analytics still works without IDs in local dev by writing debug events to `localStorage`.

## Cloudflare Pages

Use these Cloudflare Pages settings:

```txt
Build command: npm run build
Build output directory: dist
```

The repo includes `wrangler.toml` with the same output directory, and Cloudflare Pages will pick up the `functions/` directory for API routes.

Add these variables in Cloudflare Pages under Settings > Variables and Secrets:

```txt
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-flash-lite-latest
VITE_GUMROAD_URL=https://chartplan.gumroad.com/l/hgdfr
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_META_PIXEL_ID=000000000000000
META_PIXEL_ID=000000000000000
META_ACCESS_TOKEN=EAAB...
META_TEST_EVENT_CODE=TEST12345
GUMROAD_WEBHOOK_TOKEN=your_long_random_token
```

Add this binding in Cloudflare Pages under **Settings > Bindings > Add > D1 database**:

```txt
Variable name: CHARTS_DB
```

Create the table once in D1 (Console or Wrangler SQL):

```sql
CREATE TABLE IF NOT EXISTS chart_snapshots (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL,
  unlocked INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  guest_count INTEGER NOT NULL DEFAULT 0,
  seated_count INTEGER NOT NULL DEFAULT 0,
  table_count INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT,
  user_agent TEXT,
  ip_address TEXT
);
```

You can inspect stored user chart data in Cloudflare D1 by running:

```sql
SELECT id, created_at, paid, guest_count, table_count
FROM chart_snapshots
ORDER BY created_at DESC
LIMIT 50;
```

## Gumroad Return

In Gumroad, set the product's post-purchase/custom delivery redirect URL to:

```txt
https://YOUR-CLOUDFLARE-PAGES-DOMAIN.pages.dev/?paid=true
```

After payment, Gumroad sends the customer back to the app, the app saves the unlock in `localStorage`, and the customer can click `Download printable PDF` immediately.

For authoritative purchase tracking in Meta (recommended), also configure Gumroad webhook URL:

```txt
https://YOUR-CLOUDFLARE-PAGES-DOMAIN.pages.dev/api/gumroad-webhook?token=YOUR_GUMROAD_WEBHOOK_TOKEN
```

This endpoint sends server-side `Purchase` events to Meta CAPI with dedup-ready `event_id`.

## Checks

```bash
npm run test:parser
npm run test:templates
npm run build
npx wrangler pages functions build --outdir .wrangler-build-check
```
