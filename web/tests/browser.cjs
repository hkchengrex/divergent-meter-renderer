// Serve web/dist first. Optional: BROWSER_CHANNEL=msedge, PREVIEW_URL, TEST_OUTPUT.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

(async () => {
  const output = process.env.TEST_OUTPUT || await fs.mkdtemp(path.join(os.tmpdir(), 'nixie-browser-'));
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined,
    args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8765');
    await page.locator('canvas[data-ready=true]').waitFor({ timeout: 60000 });
    assert.equal(await page.locator('#error').isVisible(), false);
    await page.locator('#reading').fill('bad');
    assert.equal(await page.locator('#copy').isDisabled(), true);
    await page.locator('#brightness-value').fill('25');
    assert.equal(await page.locator('#copy').isDisabled(), true, 'invalid reading must not be silently discarded');
    await page.locator('#reading').fill('2.000001');
    assert.equal(await page.locator('#copy').isEnabled(), true);
    assert.equal(await page.locator('#advanced').getAttribute('open'), null);
    await page.locator('#advanced > summary').click();
    for (const name of ['Camera', 'Output', 'Studio light']) await page.locator('summary').filter({ hasText: new RegExp(`^${name}$`) }).click();
    for (const [key, value] of Object.entries({ width: 640, height: 360, samples: 8, studio_brightness: 30, reflection: .6, floor_roughness: .12 })) await page.locator(`#${key}-value`).fill(String(value));
    await page.locator('#camera_type-value').selectOption('PERSP');
    const before = await page.locator('#command').inputValue();
    const canvas = page.locator('#scene'); await canvas.scrollIntoViewIfNeeded();
    const rect = await canvas.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down(); await page.mouse.move(rect.x + rect.width / 2 + 30, rect.y + rect.height / 2 + 10, { steps: 5 }); await page.mouse.up();
    const after = await page.locator('#command').inputValue(); assert.notEqual(before, after, 'Orbit must update command');
    await page.locator('#reset-camera').click();
    // Orthographic zoom also has to survive export as camera_scale.
    await canvas.hover(); await page.mouse.wheel(0, -100);
    await page.waitForFunction(() => document.getElementById('command').value.includes('--camera-scale'));
    const command = await page.locator('#command').inputValue();
    const jsonDownload = page.waitForEvent('download'); await page.locator('#json').click();
    await (await jsonDownload).saveAs(path.join(output, 'browser-settings.json'));
    const config = JSON.parse(await fs.readFile(path.join(output, 'browser-settings.json'), 'utf8'));
    assert.equal(config.reading, '2.000001'); assert.equal(config.brightness, 25); assert.equal(config.studio_brightness, 30); assert.equal(config.width, 640);
    const root = path.resolve(__dirname, '../..');
    execFileSync(process.env.PYTHON || 'python', ['-m', 'nixie_renderer', ...command.split(' ').slice(1), '--write-config', path.join(output, 'cli-settings.json')], { cwd: root });
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(output, 'cli-settings.json'), 'utf8')), config);
    await fs.writeFile(path.join(output, 'command.txt'), command);
    const imageDownload = page.waitForEvent('download'); await page.locator('#preview-png').click();
    await (await imageDownload).saveAs(path.join(output, 'browser-preview.png'));
    const header = await fs.readFile(path.join(output, 'browser-preview.png'));
    assert.equal(header.readUInt32BE(16), 640); assert.equal(header.readUInt32BE(20), 360);
    await page.locator('#file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"brightness":"bad"}') });
    assert.equal(await page.locator('#error').isVisible(), true);
    await page.locator('#file').setInputFiles({ name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)) });
    assert.equal(await page.locator('#error').isVisible(), false);
    assert.equal(await page.locator('#command').inputValue(), command);
    await page.locator('#reset').click();
    await page.locator('#advanced > summary').click();
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile page must not overflow horizontally');
    assert.deepEqual(errors, []);
    console.log('PASS browser: controls, invalid input, orbit/zoom, command parity, JSON import/export, PNG size, mobile layout');
    console.log(output);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
