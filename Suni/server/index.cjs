'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const webpush = require('web-push');
const { validateSchedule, dueReminder } = require('./scheduler.cjs');
const ROOT = path.resolve(__dirname, '..');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');

function validSubscription(sub) {
  if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 4096) return false;
  try {
    const url = new URL(sub.endpoint);
    const host = url.hostname;
    const trusted = ['fcm.googleapis.com', 'updates.push.services.mozilla.com'].includes(host) || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !trusted) return false;
    if (!/^[\w-]+$/.test(sub.keys?.p256dh || '') || !/^[\w-]+$/.test(sub.keys?.auth || '')) return false;
    return Buffer.from(sub.keys.p256dh, 'base64url').length === 65 && Buffer.from(sub.keys.auth, 'base64url').length === 16;
  } catch { return false; }
}

function createApp({ dataDir = process.env.SUNI_DATA_DIR || path.join(__dirname, 'data'), push = webpush, origin = process.env.PUBLIC_ORIGIN || '', subject = process.env.VAPID_SUBJECT || origin || 'https://localhost' } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const keyPath = path.join(dataDir, 'vapid.json');
  if (!fs.existsSync(keyPath)) fs.writeFileSync(keyPath, JSON.stringify(webpush.generateVAPIDKeys()), { mode: 0o600, flag: 'wx' });
  const keys = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  push.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  const db = new DatabaseSync(path.join(dataDir, 'notifications.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY, endpoint TEXT UNIQUE NOT NULL, subscription TEXT NOT NULL, schedule TEXT NOT NULL, zone TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS deliveries (owner TEXT NOT NULL, event TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, PRIMARY KEY(owner,event));`);
  let running = false;
  async function tick(now = new Date()) {
    if (running) return;
    running = true;
    try {
      for (const row of db.prepare('SELECT * FROM subscriptions').all()) {
        const rows = JSON.parse(row.schedule);
        // Recover brief interruptions only. Never send a stale bedtime reminder.
        for (let lag = 0; lag < 5; lag++) {
          const scheduled = new Date(Math.floor(now.getTime() / 60000) * 60000 - lag * 60000);
          const reminder = dueReminder(rows, row.zone, scheduled);
          if (!reminder) continue;
          const delivery = db.prepare('SELECT * FROM deliveries WHERE owner=? AND event=?').get(row.id, reminder.key);
          if (delivery?.state === 'sent' || delivery?.state === 'failed' || delivery?.retry_at > now.getTime()) continue;
          if (!delivery) db.prepare('INSERT INTO deliveries(owner,event,state,created) VALUES(?,?,?,?)').run(row.id, reminder.key, 'pending', now.getTime());
          try {
            await push.sendNotification(JSON.parse(row.subscription), JSON.stringify(reminder), { TTL: Math.max(1, 300 - lag * 60), urgency: 'high', timeout: 10000 });
            db.prepare("UPDATE deliveries SET state='sent' WHERE owner=? AND event=?").run(row.id, reminder.key);
          } catch (error) {
            if ([404, 410].includes(error.statusCode)) {
              db.prepare('DELETE FROM subscriptions WHERE id=?').run(row.id);
              break;
            }
            const attempts = (delivery?.attempts || 0) + 1;
            db.prepare('UPDATE deliveries SET state=?,attempts=?,retry_at=? WHERE owner=? AND event=?').run(attempts >= 4 ? 'failed' : 'pending', attempts, now.getTime() + 30000 * attempts, row.id, reminder.key);
            console.warn('Push no entregado al servicio:', error.statusCode || error.code || 'error de red');
          }
        }
      }
      db.prepare('DELETE FROM deliveries WHERE created < ?').run(now.getTime() - 14 * 86400000);
    } finally { running = false; }
  }
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  async function body(req) {
    let text = '';
    for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 16384) throw new Error('Solicitud demasiado grande'); }
    return JSON.parse(text);
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      if (route.startsWith('/api/')) {
        const expectedOrigin = origin || `http://${req.headers.host}`;
        if (req.headers.origin && req.headers.origin !== expectedOrigin) return json(res, 403, { error: 'Origen no permitido' });
        if (route === '/api/push/config' && req.method === 'GET') return json(res, 200, { publicKey: keys.publicKey, enabled: true });
        const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '')?.[1];
        if (!token) return json(res, 401, { error: 'Identificador de instalación requerido' });
        const id = hash(token);
        if (route === '/api/push/subscription' && req.method === 'PUT') {
          const payload = await body(req);
          if (!validSubscription(payload.subscription) || !validateSchedule(payload.schedule, payload.timeZone)) return json(res, 400, { error: 'Suscripción, horario o zona horaria inválidos' });
          const duplicate = db.prepare('SELECT id FROM subscriptions WHERE endpoint=?').get(payload.subscription.endpoint);
          if (duplicate && duplicate.id !== id) return json(res, 409, { error: 'La suscripción pertenece a otra instalación; vuelve a suscribirte' });
          db.prepare(`INSERT INTO subscriptions VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET endpoint=excluded.endpoint, subscription=excluded.subscription, schedule=excluded.schedule, zone=excluded.zone`).run(id, payload.subscription.endpoint, JSON.stringify(payload.subscription), JSON.stringify(payload.schedule), payload.timeZone);
          return json(res, 200, { scheduled: true, timeZone: payload.timeZone });
        }
        if (route === '/api/push/schedule' && req.method === 'PUT') {
          const payload = await body(req);
          if (!validateSchedule(payload.schedule, payload.timeZone)) return json(res, 400, { error: 'Horario o zona horaria inválidos' });
          const result = db.prepare('UPDATE subscriptions SET schedule=?,zone=? WHERE id=?').run(JSON.stringify(payload.schedule), payload.timeZone, id);
          return json(res, result.changes ? 200 : 404, { scheduled: !!result.changes });
        }
        if (route === '/api/push/subscription' && req.method === 'DELETE') {
          db.prepare('DELETE FROM subscriptions WHERE id=?').run(id);
          db.prepare('DELETE FROM deliveries WHERE owner=?').run(id);
          return json(res, 200, { removed: true });
        }
        return json(res, 404, { error: 'Ruta no disponible' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
      const file = decodeURIComponent(route === '/' ? '/index.html' : route);
      if (!/^\/(?:index\.html|sw\.js|manifest\.webmanifest|(?:css|js|assets)\/[\w.-]+)$/.test(file)) { res.writeHead(404); return res.end(); }
      const location = path.join(ROOT, file);
      if (!fs.existsSync(location)) { res.writeHead(404); return res.end(); }
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(location).pipe(res);
    } catch (error) { if (!res.headersSent) json(res, 400, { error: 'No se pudo procesar la solicitud' }); else res.end(); }
  });
  return { server, tick, close: () => db.close() };
}
if (require.main === module) {
  const app = createApp();
  const port = Number(process.env.PORT || 8099);
  app.server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Suni: http://127.0.0.1:${port} · programador Push activo`));
  const timer = setInterval(() => app.tick().catch(console.error), 15000);
  app.tick().catch(console.error);
  process.on('SIGINT', () => { clearInterval(timer); app.server.close(() => { app.close(); process.exit(0); }); });
}
module.exports = { createApp, validSubscription };
