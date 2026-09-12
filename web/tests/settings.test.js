import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaults, freshSettings, validateSettings, blenderCommand, framing } from '../src/settings.js';

test('browser settings round-trip through the real Python CLI without losing fields', () => {
  const root = new URL('../../', import.meta.url);
  const temp = mkdtempSync(join(tmpdir(), 'nixie-bridge-'));
  try {
    for (const config of [freshSettings(), { ...freshSettings(), reading: '00.120', camera_position: [3.4, -12, 6.2], camera_target: [.3, 0, 1.2], camera_type: 'PERSP', camera_scale: 9.12345, brightness: 32, reflection: .7, studio_brightness: 45, bloom: false, width: 1080, height: 1920 }]) {
      const path = join(temp, 'settings.json');
      const args = blenderCommand(config).split(' ').slice(1);
      execFileSync(process.env.PYTHON || 'python', ['-m', 'nixie_renderer', ...args, '--write-config', path], { cwd: root, stdio: 'pipe' });
      assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), config);
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('partial imports use matching defaults and reject unsafe or invalid values', () => {
  assert.equal(validateSettings({ reading: '0.1' }).brightness, defaults.brightness);
  for (const input of [{ reading: '1;whoami' }, { reading: '' }, { brightness: '18' }, { reflection: 2 }, { camera_position: [0, 0, 1.13] }, { glow_color: [1, -1, 0] }, { samples: true }, { width: 0 }, { camera_scale: 0 }, { bloom: 'false' }, { unknown: 1 }, { studio_size: 0 }, { glass_ior: .1 }]) assert.throws(() => validateSettings(input));
  assert.throws(() => blenderCommand({ brightness: Infinity }));
});

test('framing matches Blender AUTO sensor fit for landscape and portrait', () => {
  const c = freshSettings(); const wide = framing(c);
  assert.ok(Math.abs(wide.scale - 9.42) < 1e-9);
  assert.ok(Math.abs(wide.width / wide.height - 16 / 9) < 1e-9);
  const tall = framing({ ...c, width: 1080, height: 1920 });
  assert.ok(Math.abs(tall.width - wide.width) < 1e-9);
  assert.ok(Math.abs(tall.fov - 2 * Math.atan(36 / 100) * 180 / Math.PI) < 1e-9);
});
