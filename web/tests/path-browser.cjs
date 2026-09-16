// Run against a local build on a GPU-capable browser; not a software-rendered CI test.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const output = process.env.TEST_OUTPUT || await fs.mkdtemp(path.join(os.tmpdir(), 'nixie-path-'));
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined, headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8768');
    await page.locator('canvas[data-ready=true]').waitFor();
    const refine = async (samples = 16) => {
      const progress = setInterval(async () => console.log(await page.locator('#quality-status').textContent()), 15000);
      try { await page.waitForFunction(n => Number(document.getElementById('scene').dataset.samples) >= n, samples, { timeout: 240000 }); }
      finally { clearInterval(progress); }
      assert.equal(await page.locator('#error').isVisible(), false);
    };
    await page.locator('#high-quality').check(); await refine(1024);
    await page.locator('#scene').screenshot({ path: path.join(output, 'path-default.png') });
    const download = page.waitForEvent('download'); await page.locator('#preview-png').click();
    const file = path.join(output, 'path-export.png'); await (await download).saveAs(file);
    const png = await fs.readFile(file);
    const size = await page.locator('#scene').evaluate(c => [c.width, c.height]);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], size);
    await page.locator('#brightness-value').fill('25'); await refine();
    await page.locator('#reading').fill('2.000001'); await refine();
    assert.match(await page.locator('#command').inputValue(), /--reading 2\.000001/);
    await page.locator('#reflection-value').fill('1'); await refine();
    await page.locator('#advanced > summary').click();
    await page.locator('summary').filter({ hasText: /^Camera$/ }).click();
    await page.locator('#camera_type-value').selectOption('PERSP'); await refine();
    await page.locator('summary').filter({ hasText: /^Studio light$/ }).click();
    await page.locator('#studio_brightness-value').fill('30'); await refine();
    await page.locator('#ambient_brightness-value').fill('.1'); await refine();
    await page.locator('#scene').screenshot({ path: path.join(output, 'path-studio.png') });
    await page.locator('#high-quality').uncheck();
    await page.waitForFunction(() => document.getElementById('quality-status').textContent === 'Live preview');
    await page.locator('#reset').click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log('PASS path tracing: convergence, export, scene/material/camera/light changes, fallback, mobile layout');
    console.log(output);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
