# SeatFlow Wedding Seating Chart

Browser-based wedding/event seating chart MVP:

- Messy guest-list parsing with a local fallback parser
- Drag-and-drop seating planner
- Local autosave
- Gumroad PDF unlock through `?paid=true` or `?license=success`
- Printable PDF export from the same HTML preview
- GA4 and Meta Pixel event hooks
- Cloudflare Pages Functions backend for `/api/parse-guests`

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
```

## Gumroad Return

In Gumroad, set the product's post-purchase/custom delivery redirect URL to:

```txt
https://YOUR-CLOUDFLARE-PAGES-DOMAIN.pages.dev/?paid=true
```

After payment, Gumroad sends the customer back to the app, the app saves the unlock in `localStorage`, and the customer can click `Download printable PDF` immediately.

## Checks

```bash
npm run test:parser
npm run test:templates
npm run build
npx wrangler pages functions build --outdir .wrangler-build-check
```
