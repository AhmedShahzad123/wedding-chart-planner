import { checkAiStatus } from "../../server/parser.js";

const jsonHeaders = { "content-type": "application/json" };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders
  });
}

export async function onRequestGet(context) {
  return jsonResponse(await checkAiStatus(context.env));
}

export function onRequest() {
  return jsonResponse({ error: "Method not allowed." }, 405);
}
