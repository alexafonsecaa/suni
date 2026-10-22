// Run with SUNI_PLAYWRIGHT_MODULE pointing at a temporary Playwright install.
const { chromium } = require(process.env.SUNI_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const base = process.env.SUNI_URL || 'http://127.0.0.1:8100';
  const output = process.env.SUNI_SCREENSHOTS;
  try {
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-action="splash:registro"]').click();
    await page.waitForFunction(() => Fx.current === 'registro');
    const inputs = page.locator('.screen--registro input');
    for (const [i, text] of ['Isabel', 'Fonseca', 'isa', 'isa@example.com'].entries()) await inputs.nth(i).fill(text);
    await page.locator('[data-action="registro:login"]').click();
    await page.waitForFunction(() => Fx.current === 'home');
    await page.locator('[data-action="home:habitos"]').click();
    await page.waitForFunction(() => Fx.current === 'habitos');
    for (const [selector, count] of [['hour', 24], ['minute', 60]]) {
      for (const size of await page.locator(`select[data-part="${selector}"]`).evaluateAll(els => els.map(el => el.options.length))) assert.equal(size, count);
    }
    const row = page.locator('.row[data-day="1"] select');
    for (const [i, value] of ['00', '00', '23', '59'].entries()) await row.nth(i).selectOption(value);
    assert.deepEqual(await page.evaluate(() => SuniApp.comandosHorario().slice(0, 2)), ['SETALARM=1,00:00', 'SETSLEEP=1,23:59']);
    await page.locator('[data-action="habitos:save"]').click();
    await page.locator('#notification-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#notification-accept').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    await page.reload();
    assert.deepEqual(await page.evaluate(() => SuniApp.comandosHorario().slice(0, 2)), ['SETALARM=1,00:00', 'SETSLEEP=1,23:59']);
    await page.evaluate(() => Fx.init('buddi'));
    const bar = await page.locator('#bar').boundingBox();
    await page.mouse.click(bar.x + (6 + 297 / 2) * bar.width / 336, bar.y + bar.height / 2);
    assert.equal(await page.evaluate(() => SuniApp.volumen()), 50);
    assert.equal(await page.locator('.bar__line:not(.is-off)').count(), 25);
    assert.match(await page.locator('#volume-status').textContent(), /50 %.*pendiente/);
    await page.reload();
    assert.equal(await page.evaluate(() => SuniApp.volumen()), 50);
    await page.evaluate(() => Fx.init('perfil'));
    assert.equal(await page.locator('.p-input').first().getAttribute('readonly'), '');
    await page.locator('[data-action="perfil:editar"]').click();
    await page.locator('.p-input').first().fill('Isabel actualizada');
    await page.locator('[data-action="perfil:home"]').click();
    assert.equal(await page.locator('.perfil__name').textContent(), 'Isabel actualizada');
    for (const width of [320, 360, 390, 420, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => Fx.init('habitos'));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('[data-action="habitos:save"]').scrollIntoViewIfNeeded();
      const b = await page.locator('[data-action="habitos:save"]').boundingBox();
      assert.ok(b.y >= 0 && b.y + b.height <= 844);
    }
    if (output) {
      fs.mkdirSync(output, { recursive: true });
      await page.setViewportSize({ width: 420, height: 912 });
      await page.evaluate(() => {
        localStorage.setItem('suni.profile', JSON.stringify({ name: 'Isabel', surname: 'Fonseca', username: '@isa.duerme.de.lado', email: 'isa@example.com' }));
        localStorage.removeItem('suni.horario');
      });
      await page.reload(); await page.evaluate(() => document.fonts.ready);
      for (const name of ['splash', 'login', 'registro', 'home', 'habitos', 'buddi', 'perfil']) {
        await page.evaluate(n => { Fx.init(n); document.querySelector(`[data-screen="${n}"]`).scrollTop = 0; document.querySelector('#ble-status').textContent = ''; }, name);
        await page.locator('#device').screenshot({ path: path.join(output, name + '.png') });
      }
      await page.locator('[data-action="perfil:editar"]').click();
      await page.locator('#device').screenshot({ path: path.join(output, 'perfil-edit.png') });
      await page.evaluate(() => Fx.init('habitos'));
      await page.locator('[data-action="habitos:save"]').click();
      await page.locator('#device').screenshot({ path: path.join(output, 'permission.png') });
      await page.keyboard.press('Escape');
      await page.locator('#device').screenshot({ path: path.join(output, 'routine-saved.png') });
    }
    assert.deepEqual(errors, []);
    console.log('PASS: registration, navigation, all 28 time selectors, 24h boundaries, persistence, volume, profile states, notification dialog, 5 mobile widths; no JS errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
