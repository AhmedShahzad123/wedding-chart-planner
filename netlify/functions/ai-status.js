import "dotenv/config";
import { checkAiStatus } from "../../server/parser.js";

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed." })
    };
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(await checkAiStatus())
  };
}
