import "dotenv/config";
import { fallbackParse, parseGuestInput } from "../../server/parser.js";

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
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await parseGuestInput(payload.input))
    };
  } catch (error) {
    if (error.statusCode) {
      return {
        statusCode: error.statusCode,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: error.message })
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...fallbackParse(payload.input || ""),
        warning: "Used quick import. Please review names before downloading.",
        detail: error.message
      })
    };
  }
}
