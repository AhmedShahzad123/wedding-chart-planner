import { renderPdfFromHtml } from "../../server/pdf.js";

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

  try {
    const pdf = await renderPdfFromHtml(payload.html);
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/pdf",
        "cache-control": "no-store"
      },
      body: Buffer.from(pdf).toString("base64"),
      isBase64Encoded: true
    };
  } catch (error) {
    return {
      statusCode: error.statusCode || 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: error.message || "Could not generate PDF." })
    };
  }
}
