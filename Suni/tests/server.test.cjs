const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createApp } = require('../server/index.cjs');

test('persistent push schedule: authenticated updates, one send, revocation and private files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suni-test-'));
  let sent = 0;
  const push = { setVapidDetails() {}, async sendNotification(sub, text) { sent++; assert.equal(JSON.parse(text).body.includes('22:00'), true); } };
  let app = createApp({ dataDir: dir, push });
  const token = crypto.randomBytes(32).toString('base64url');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: Buffer.alloc(65, 1).toString('base64url'), auth: Buffer.alloc(16, 2).toString('base64url') } };
  const schedule = Array.from({ length: 7 }, () => ({ am: 480, pm: 1320 }));
  try {
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    let base = `http://127.0.0.1:${app.server.address().port}`;
    assert.equal((await fetch(base + '/server/data/vapid.json')).status, 404);
    assert.equal((await fetch(base + '/api/push/subscription', { method: 'PUT' })).status, 401);
    assert.equal((await fetch(base + '/api/push/subscription', { method: 'PUT', headers, body: JSON.stringify({ subscription, schedule, timeZone: 'UTC' }) })).status, 200);
    await app.tick(new Date('2026-10-22T21:00:00Z'));
    await app.tick(new Date('2026-10-22T21:00:15Z'));
    assert.equal(sent, 1);
    await new Promise(resolve => app.server.close(resolve)); app.close();
    app = createApp({ dataDir: dir, push });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${app.server.address().port}`;
    await app.tick(new Date('2026-10-22T21:01:00Z'));
    assert.equal(sent, 1, 'restart must not repeat a reminder');
    schedule[3].pm = 1440;
    assert.equal((await fetch(base + '/api/push/schedule', { method: 'PUT', headers, body: JSON.stringify({ schedule, timeZone: 'UTC' }) })).status, 400);
    assert.equal((await fetch(base + '/api/push/subscription', { method: 'DELETE', headers })).status, 200);
    await app.tick(new Date('2026-10-23T21:00:00Z'));
    assert.equal(sent, 1);
  } finally {
    await new Promise(resolve => app.server.close(resolve)); app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
