const http = require('node:http');
const { RecordRepository, authorize, validateBusinessConditions, appendAudit, report } = require('./domain');

// The pilot has no configured identity provider. Without a trusted resolver,
// API routes fail closed instead of borrowing a hard-coded test identity.
function createServer({ resolveContext } = {}) {
  const repo = new RecordRepository();
  const server = http.createServer((req, res) => {
    const send = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.url === '/health' && req.method === 'GET') return send(200, { status: 'ok' });
      const isRecordsRoute = req.url === '/api/v1/records' && (req.method === 'GET' || req.method === 'POST');
      if (!isRecordsRoute) return send(404, { error: 'not found' });
      const ctx = typeof resolveContext === 'function' ? resolveContext(req) : null;
      if (!ctx || ctx.authenticated !== true || !ctx.principalId ||
          !Array.isArray(ctx.tenantIds) || !Array.isArray(ctx.permissions)) {
        return send(401, { error: 'authentication required' });
      }
      if (req.url === '/api/v1/records' && req.method === 'GET') {
        return send(200, { items: report(repo, ctx) });
      }
      if (req.url === '/api/v1/records' && req.method === 'POST') {
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', () => {
          try {
            const input = JSON.parse(raw);
            authorize(ctx, 'record:create');
            validateBusinessConditions(input);
            const value = repo.create(ctx, input);
            appendAudit(repo.audit, ctx, 'record:create', value.id, 'SUCCESS');
            send(201, value);
          } catch (error) {
            try { appendAudit(repo.audit, ctx, 'record:create', 'UNKNOWN', 'DENIED'); } catch {}
            send(error.name === 'AuthorizationError' ? 403 : 400, { error: error.message });
          }
        });
        return;
      }
      return send(404, { error: 'not found' });
    } catch {
      return send(500, { error: 'internal error' });
    }
  });
  return server;
}

const server = createServer();
if (require.main === module) server.listen(process.env.PORT || 3000);
module.exports = { server, createServer };
