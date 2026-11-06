import http from "node:http";
import { InventoryRepository, report } from "./domain.js";

function createServer({ resolveContext } = {}) {
  const repository = new InventoryRepository();
  return http.createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };
    if (req.url === "/health" && req.method === "GET") {
      return send(200, { status: "ok", service: "chapter-465-inventory-pilot" });
    }
    if (req.url !== "/report" || req.method !== "GET") return send(404, { error: "not found" });

    // Never manufacture an identity or tenant in the HTTP application.
    const ctx = typeof resolveContext === "function" ? resolveContext(req) : null;
    if (!ctx || ctx.authenticated !== true ||
        typeof ctx.actorId !== "string" || !ctx.actorId ||
        typeof ctx.tenantId !== "string" || !ctx.tenantId ||
        !Array.isArray(ctx.permissions)) {
      return send(401, { error: "authentication required" });
    }
    try {
      return send(200, report(ctx, repository, ctx.tenantId));
    } catch (error) {
      if (error?.name === "AuthorizationError") return send(403, { error: "forbidden" });
      return send(500, { error: "internal error" });
    }
  });
}

const server = createServer();
if (import.meta.url === new URL(process.argv[1], "file:").href) {
  server.listen(process.env.PORT || 3000);
}
export { server, createServer };
