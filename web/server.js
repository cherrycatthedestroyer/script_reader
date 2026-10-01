import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { nextIndex } from './public/cue-model.js';

export async function createCueServer({ scriptPath = new URL('./script.json', import.meta.url) } = {}) {
  const raw = (await readFile(scriptPath, 'utf8')).replace(/^\uFEFF/, '');
  const script = JSON.parse(raw);
  const cues = script.items?.filter(item => item.type === 'dialogue');
  if (!cues?.length || cues.some(cue => typeof cue.text !== 'string' || typeof cue.speaker !== 'string')) {
    throw new Error('script.json must contain speaking cues with text and speaker.');
  }
  const scriptVersion = createHash('sha256').update(raw).digest('hex');
  const session = randomUUID();
  let index = 0;
  let revision = 0;
  const clients = new Set();
  const snapshot = () => ({ index, revision, session, scriptVersion, cueCount: cues.length });
  const event = () => `event: state\ndata: ${JSON.stringify(snapshot())}\n\n`;
  const assets = new Map();
  for (const [path, file, type] of [
    ['/', 'index.html', 'text/html'], ['/app.js', 'app.js', 'text/javascript'],
    ['/cue-model.js', 'cue-model.js', 'text/javascript'], ['/styles.css', 'styles.css', 'text/css'],
  ]) assets.set(path, { body: await readFile(new URL(`./public/${file}`, import.meta.url)), type });

  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'");
    const json = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/api/script') return json(200, { ...script, scriptVersion });
      if (req.method === 'GET' && path === '/api/state') return json(200, snapshot());
      if (req.method === 'GET' && path === '/health') return json(200, { ok: true });
      if (req.method === 'GET' && path === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write(`retry: 1500\n\n${event()}`);
        clients.add(res);
        res.on('close', () => clients.delete(res));
        return;
      }
      if (req.method === 'POST' && path === '/api/control') {
        // JSON plus a same-origin check prevents another website issuing browser commands.
        if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'JSON required' });
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(403, { error: 'Use this website to control cues' });
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 2048) return json(413, { error: 'Command too large' });
        }
        const command = JSON.parse(body);
        // A stale screen must sync before it can move the shared cue.
        if (command.session !== session || command.revision !== revision) return json(409, { error: 'Cue changed; synced to the latest position. Tap again.', state: snapshot() });
        const target = nextIndex(index, command, cues.length);
        if (target !== index) {
          index = target;
          revision += 1;
          for (const client of clients) client.write(event());
        }
        return json(200, snapshot());
      }
      const asset = assets.get(path);
      if ((req.method === 'GET' || req.method === 'HEAD') && asset) {
        res.writeHead(200, { 'Content-Type': `${asset.type}; charset=utf-8` });
        return res.end(req.method === 'HEAD' ? undefined : asset.body);
      }
      if (req.method === 'GET' && path === '/robots.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('User-agent: *\nDisallow: /\n');
      }
      json(404, { error: 'Not found' });
    } catch (error) {
      if (!res.headersSent) json(400, { error: 'Invalid request' });
      else res.end();
    }
  });
  const heartbeat = setInterval(() => {
    for (const client of clients) client.write(event());
  }, 5000);
  heartbeat.unref();
  server.on('close', () => clearInterval(heartbeat));
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createCueServer();
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Script Cue is running: http://localhost:${port}`);
    for (const addresses of Object.values(networkInterfaces())) {
      for (const address of addresses || []) {
        if (address.family === 'IPv4' && !address.internal) console.log(`Phone / tablet on the same Wi-Fi: http://${address.address}:${port}`);
      }
    }
    console.log('Keep this window open. Press Ctrl+C to stop.');
  });
}
