// Serves the synthetic job postings in ./postings on http://localhost:5175 for the import
// end-to-end tests (feature 002). The e2e API is allowed to fetch only this host and port.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const PORT = Number(process.env.POSTING_PORT ?? 5175);
const root = new URL('./postings/', import.meta.url);

createServer(async (req, res) => {
  const name = (req.url ?? '/').split('?')[0].slice(1);
  if (!/^[\w-]+\.html$/.test(name)) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }
  try {
    const page = await readFile(new URL(name, root));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
}).listen(PORT, () => console.log(`Fixture postings on http://localhost:${PORT}`));
