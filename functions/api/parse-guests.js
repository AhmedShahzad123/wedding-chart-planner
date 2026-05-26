import { fallbackParse, parseGuestInput } from "../../server/parser.js";

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

  try {
    return jsonResponse(await parseGuestInput(payload.input, context.env));
  } catch (error) {
    if (error.statusCode) return jsonResponse({ error: error.message }, error.statusCode);

    return jsonResponse({
      ...fallbackParse(payload.input || ""),
      warning: "Used quick import. Please review names before downloading.",
      detail: error.message
    });
  }
}

export function onRequest() {
  return jsonResponse({ error: "Method not allowed." }, 405);
}
