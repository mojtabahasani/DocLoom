// Static server for the E2E suite. Serves the repo root so http://127.0.0.1:<port>/MD2Html.html
// is the exact build output the user double-clicks. It deliberately has NO /api/* routes, so the
// app's one health probe 404s and it stays in offline mode — the same as opening the file directly.
// (Playwright MCP and the browser pane block file://, which is why the suite goes over http.)
import http from 'node:http';
import { createStatic } from '../../server/lib/static.js';

const PORT = Number(process.env.E2E_PORT) || 8732;
const root = new URL('../../', import.meta.url).pathname;
const serve = createStatic(root);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end('method not allowed');
    return;
  }
  if (url.pathname === '/') url.pathname = '/MD2Html.html';
  if (!serve(req, res, url.pathname, { 'Cache-Control': 'no-store' })) res.writeHead(404).end('not found');
});

server.listen(PORT, '127.0.0.1', () => console.log(`e2e static server on http://127.0.0.1:${PORT}`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
