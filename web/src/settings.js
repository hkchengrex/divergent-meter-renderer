import defaults from './defaults.json' with { type: 'json' };
import geometry from '../../nixie_renderer/data/geometry.json' with { type: 'json' };

export { defaults };
export const freshSettings = () => structuredClone(defaults);
const vectors = ['camera_position', 'camera_target', 'studio_position', 'studio_target', 'glow_color', 'studio_color'];
const integers = ['width', 'height', 'samples', 'seed'];
const unit = ['reflection', 'floor_roughness', 'glass_roughness', 'glass_reflection', 'base_roughness'];
const positive = ['focal_length', 'studio_size', 'studio_size_y'];

export function validateSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Settings must be a JSON object.');
  for (const key of Object.keys(input)) if (!Object.hasOwn(defaults, key)) throw Error(`Unknown setting: ${key}`);
  const c = { ...freshSettings(), ...input };
  if (typeof c.reading !== 'string' || !/^[0-9.]{1,64}$/.test(c.reading)) throw Error('Enter 1–64 digits or decimal points.');
  for (const key of integers) if (!Number.isSafeInteger(c[key]) || c[key] < (key === 'seed' ? 0 : 1)) throw Error(`${key} must be a ${key === 'seed' ? 'nonnegative' : 'positive'} integer.`);
  if (typeof c.bloom !== 'boolean') throw Error('bloom must be true or false.');
  if (!['ORTHO', 'PERSP'].includes(c.camera_type)) throw Error('camera_type must be ORTHO or PERSP.');
  for (const key of vectors) {
    if (!Array.isArray(c[key]) || c[key].length !== 3 || c[key].some(v => typeof v !== 'number' || !Number.isFinite(v))) throw Error(`${key} needs three finite numbers.`);
    if (key.endsWith('color') && c[key].some(v => v < 0 || v > 1)) throw Error(`${key} components must be between 0 and 1.`);
  }
  for (const key of Object.keys(defaults).filter(k => ![...vectors, ...integers, 'reading', 'bloom', 'camera_type'].includes(k))) {
    if (key === 'camera_scale' && c[key] === null) continue;
    if (typeof c[key] !== 'number' || !Number.isFinite(c[key])) throw Error(`${key} must be a finite number.`);
    if (key !== 'exposure' && c[key] < 0) throw Error(`${key} must be nonnegative.`);
  }
  for (const key of unit) if (c[key] > 1) throw Error(`${key} must be between 0 and 1.`);
  for (const key of positive) if (c[key] <= 0) throw Error(`${key} must be positive.`);
  if (c.camera_scale !== null && c.camera_scale <= 0) throw Error('Camera scale must be positive, or empty for automatic framing.');
  if (c.glass_ior < 1) throw Error('Glass IOR must be at least 1.');
  for (const key of ['camera', 'studio']) if (c[`${key}_position`].every((v, i) => v === c[`${key}_target`][i])) throw Error(`${key} position and target must differ.`);
  return structuredClone(c);
}

// Values are strictly validated strings of digits, enums, booleans, and finite numbers.
// No user-provided paths or shell text are interpolated into the command.
export function blenderCommand(settings) {
  const c = validateSettings(settings);
  const args = ['nixie-render'];
  for (const [key, value] of Object.entries(c)) {
    if (value === null) continue;
    if (key === 'bloom') { args.push(value ? '--bloom' : '--no-bloom'); continue; }
    args.push(`--${key.replaceAll('_', '-')}`);
    args.push(...(Array.isArray(value) ? value : [value]).map(String));
  }
  return args.join(' ') + ' --output renders/nixie';
}

export function framing(c) {
  const aspect = c.width / c.height;
  const row = c.reading.length * geometry.pitch + 0.3;
  const scale = c.camera_scale ?? (aspect >= 1 ? Math.max(row + 1.6, 3.2 * aspect) : Math.max((row + 1.6) / aspect, 3.2));
  return { aspect, scale, width: aspect >= 1 ? scale : scale * aspect, height: aspect >= 1 ? scale / aspect : scale,
    fov: 2 * Math.atan(36 / (2 * c.focal_length * Math.max(1, aspect))) * 180 / Math.PI };
}
