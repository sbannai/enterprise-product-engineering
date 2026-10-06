import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";

function sendJson(response: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

/**
 * Minimal operational endpoint only. This does not implement business APIs,
 * authenticate users, authorize roles, or establish UAT acceptance.
 */
export function createAppServer(): Server {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && requestUrl.pathname === "/health") {
      const buildId = process.env.EPER_BUILD_ID ?? "";
      const buildIdIsCommit = /^[a-f0-9]{40}$/i.test(buildId);

      sendJson(response, buildIdIsCommit ? 200 : 503, {
        status: buildIdIsCommit ? "ok" : "unconfigured",
        service: "eper-api",
        buildId: buildIdIsCommit ? buildId : null,
      });
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  });
}
