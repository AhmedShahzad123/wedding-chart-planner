import puppeteer from "@cloudflare/puppeteer";

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

  if (!payload || typeof payload !== "object") return jsonResponse({ error: "Missing payload." }, 400);

  const browserBinding = context.env?.BROWSER;
  if (!browserBinding) return jsonResponse({ error: "Missing BROWSER binding." }, 500);

  const origin = new URL(context.request.url).origin;
  const printUrl = `${origin}/?print=1&autoprint=0&server_pdf=1`;
  const browser = await puppeteer.launch(browserBinding);

  try {
    const page = await browser.newPage();
    const state = JSON.stringify(payload);
    await page.evaluateOnNewDocument((serializedState) => {
      localStorage.setItem("seatflow-state", serializedState);
      localStorage.setItem("seatflow-print-state", serializedState);
    }, state);

    await page.goto(printUrl, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document?.body?.dataset?.printReady === "true", { timeout: 15000 });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" }
    });

    return new Response(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "attachment; filename=\"seatflow-seating-plan.pdf\"",
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  } finally {
    await browser.close();
  }
}

export function onRequest() {
  return jsonResponse({ error: "Method not allowed." }, 405);
}
