import './style.css';
import { defaults, freshSettings, validateSettings, blenderCommand } from './settings.js';
import { MeterRenderer } from './renderer.js';

let state = freshSettings(), meter, invalid = false;
const $ = id => document.getElementById(id);
const groups = [
  ['Glow', true, [
    ['brightness', 'Brightness', 0, 80, .5], ['bloom', 'Glow halo'], ['bloom_threshold', 'Halo threshold', 0, 5, .1],
    ['exposure', 'Exposure · stops', -4, 4, .1], ['glow_color', 'Glow color · linear RGB'],
  ]],
  ['Glass & surface', true, [
    ['glass_roughness', 'Glass roughness', 0, 1, .005], ['glass_reflection', 'Glass highlights', 0, 1, .01], ['glass_ior', 'Glass IOR', 1, 2.5, .01],
    ['reflection', 'Floor reflection', 0, 1, .01], ['floor_roughness', 'Floor roughness', 0, 1, .01], ['base_roughness', 'Base roughness', 0, 1, .01],
  ]],
  ['Studio light', false, [
    ['studio_brightness', 'Power · watts', 0, 500, 1], ['studio_position', 'Light position · XYZ'], ['studio_target', 'Point light toward · XYZ'],
    ['studio_size', 'Light width', .01, 10, .1], ['studio_size_y', 'Light height', .01, 10, .1], ['studio_color', 'Light color · linear RGB'],
    ['ambient_brightness', 'Ambient light', 0, 2, .01],
  ]],
  ['Camera', false, [
    ['camera_type', 'Projection'], ['camera_position', 'Camera position · XYZ'], ['camera_target', 'Look at · XYZ'],
    ['camera_scale', 'Orthographic scale', null], ['focal_length', 'Focal length · mm', 10, 150, 1],
  ]],
  ['Output', false, [
    ['width', 'Width · pixels', null], ['height', 'Height · pixels', null], ['samples', 'Blender samples', null], ['seed', 'Blender seed', null],
  ]],
];

const hints = {
  'Glow': 'The active cathodes light the tubes. A small dot casts less light than a numeral.',
  'Glass & surface': 'Lower roughness makes highlights sharper. Enable floor reflection to see its roughness change.',
  'Studio light': 'Off by default. Light travels from its position toward the target.',
  'Camera': 'Z is up. Orbiting the preview updates these coordinates. Leave scale empty for automatic framing.',
  'Output': 'Preview framing follows this aspect ratio. Samples and seed apply to Blender only.',
};

const commonKeys = ['brightness', 'bloom', 'reflection', 'glass_reflection', 'width', 'height'];
const common = document.createElement('div'); common.className = 'common-controls';
const advanced = document.createElement('details'); advanced.className = 'advanced-controls'; advanced.id = 'advanced';
const advancedSummary = document.createElement('summary'); advancedSummary.textContent = 'Advanced'; advanced.append(advancedSummary);
$('fields').append(common, advanced);
const commonFields = new Map();

for (const [title, open, fields] of groups) {
  const section = document.createElement('details'); section.className = 'control-group'; section.open = open;
  const summary = document.createElement('summary'); summary.textContent = title; section.append(summary);
  const content = document.createElement('div'); content.className = 'group-content';
  const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = hints[title]; content.append(hint);
  for (const [key, label, min, max, step] of fields) {
    let element;
    if (Array.isArray(defaults[key])) {
      element = document.createElement('fieldset'); element.className = 'vector';
      const legend = document.createElement('legend'); legend.textContent = label; element.append(legend);
      const row = document.createElement('div');
      (key.endsWith('color') ? ['R', 'G', 'B'] : ['X', 'Y', 'Z']).forEach((axis, i) => {
        const l = document.createElement('label'); l.textContent = axis;
        const input = document.createElement('input'); input.type = 'number'; input.step = 'any'; input.dataset.key = key; input.dataset.index = i;
        input.setAttribute('aria-label', `${label} ${axis}`); l.append(input); row.append(l);
      }); element.append(row);
    } else {
      element = document.createElement('div'); element.className = 'field';
      const l = document.createElement('label'); l.textContent = label; l.htmlFor = `${key}-value`; element.append(l);
      const row = document.createElement('div'); row.className = 'inputs';
      let input;
      if (typeof defaults[key] === 'boolean') {
        input = document.createElement('input'); input.type = 'checkbox'; element.classList.add('checkbox');
      } else if (key === 'camera_type') {
        input = document.createElement('select');
        for (const [value, text] of [['ORTHO', 'Orthographic'], ['PERSP', 'Perspective']]) { const option = document.createElement('option'); option.value = value; option.textContent = text; input.append(option); }
      } else {
        input = document.createElement('input'); input.type = 'number'; input.step = 'any';
        if (min !== null && min !== undefined) {
          const slider = document.createElement('input'); slider.type = 'range'; slider.min = min; slider.max = max; slider.step = step;
          slider.dataset.key = key; slider.setAttribute('aria-label', `${label} slider`); row.append(slider);
        } else element.classList.add('wide');
        if (key === 'camera_scale') input.placeholder = 'Automatic';
      }
      input.id = `${key}-value`; input.dataset.key = key; row.append(input); element.append(row);
    }
    if (commonKeys.includes(key)) commonFields.set(key, element);
    else content.append(element);
  }
  section.append(content); advanced.append(section);
}
for (const key of commonKeys) common.append(commonFields.get(key));

function syncFields() {
  $('reading').value = state.reading;
  for (const input of document.querySelectorAll('[data-key]')) {
    const value = input.dataset.index === undefined ? state[input.dataset.key] : state[input.dataset.key][Number(input.dataset.index)];
    if (input.type === 'checkbox') input.checked = value;
    else input.value = value === null ? '' : typeof value === 'number' ? Number(value.toPrecision(10)) : value;
  }
}
function exportState() {
  $('command').value = blenderCommand(state);
  $('render-size').textContent = `${state.width} × ${state.height} · ${state.samples} samples`;
  $('aspect-label').textContent = `${state.width} × ${state.height}`;
}
function error(message) {
  $('error').textContent = message || ''; $('error').hidden = !message;
}
function validity(ok) {
  invalid = !ok; ['copy', 'json', 'preview-png'].forEach(id => { $(id).disabled = !ok; });
}
function apply(next, updateFields = true) {
  try {
    state = validateSettings(next); validity(true); error('');
    if (updateFields) syncFields(); exportState(); meter?.apply(state);
    try { localStorage.setItem('nixie-settings-v1', JSON.stringify(state)); } catch { /* Optional persistence. */ }
  } catch (e) { validity(false); error(e.message); }
}
function status(text) { $('status').textContent = text; }
function download(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

$('settings').addEventListener('submit', e => e.preventDefault());
$('settings').addEventListener('input', e => {
  const input = e.target;
  if (input.id !== 'reading' && !input.dataset.key) return;
  if (input.type === 'range') $(`${input.dataset.key}-value`).value = input.value;
  const next = structuredClone(state); next.reading = $('reading').value;
  for (const field of document.querySelectorAll('[data-key]:not([type=range])')) {
    const key = field.dataset.key;
    const value = field.type === 'checkbox' ? field.checked : key === 'camera_type' ? field.value : field.value === '' ? (key === 'camera_scale' ? null : NaN) : Number(field.value);
    if (field.dataset.index !== undefined) next[key][Number(field.dataset.index)] = value; else next[key] = value;
  }
  apply(next, false);
  if (!invalid) for (const slider of document.querySelectorAll('[type=range][data-key]')) slider.value = state[slider.dataset.key];
});
$('reset').onclick = () => { apply(freshSettings()); status(''); };
$('reset-camera').onclick = () => { apply({ ...state, camera_position: defaults.camera_position, camera_target: defaults.camera_target, camera_scale: null, camera_type: 'ORTHO', focal_length: 50 }); status('View reset.'); };
$('copy').onclick = async () => {
  if (invalid) return;
  try { await navigator.clipboard.writeText(blenderCommand(state)); status('Blender command copied.'); }
  catch { $('command').focus(); $('command').select(); status('Select the command and copy it with Ctrl+C or ⌘C.'); }
};
$('json').onclick = () => { if (!invalid) { download(new Blob([JSON.stringify(state, null, 2) + '\n'], { type: 'application/json' }), 'nixie-settings.json'); status('Settings downloaded. Use: nixie-render --config nixie-settings.json --output renders/nixie'); } };
$('import').onclick = () => $('file').click();
$('file').onchange = async () => {
  try {
    const file = $('file').files[0]; if (!file) return;
    if (file.size > 100000) throw Error('Choose a JSON settings file smaller than 100 KB.');
    const next = validateSettings(JSON.parse((await file.text()).replace(/^\uFEFF/, '')));
    apply(next); status('Settings imported.');
  } catch (e) { error(`Could not import settings. ${e.message}`); }
  finally { $('file').value = ''; }
};
$('preview-png').onclick = async () => {
  if (invalid) return;
  try { $('preview-png').disabled = true; status('Saving preview…'); download(await meter.png(), `nixie-${state.reading}.png`); status('Browser preview saved.'); }
  catch (e) { error(e.message); }
  finally { $('preview-png').disabled = invalid; }
};

try {
  const saved = localStorage.getItem('nixie-settings-v1'); if (saved) state = validateSettings(JSON.parse(saved));
} catch { state = freshSettings(); }
syncFields(); exportState();
try {
  meter = new MeterRenderer($('scene'), $('frame'), patch => {
    state = validateSettings({ ...state, ...patch }); validity(true); error(''); syncFields(); exportState();
    try { localStorage.setItem('nixie-settings-v1', JSON.stringify(state)); } catch { /* Optional persistence. */ }
  }, error);
  meter.apply(state); $('loading').hidden = true;
} catch (e) {
  $('loading').textContent = '3D preview unavailable'; $('preview-png').disabled = true;
  error('The 3D preview could not start. Try a browser with WebGL 2 enabled. You can still edit settings and export a Blender command.');
  console.error(e);
}
