import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import G from '../../nixie_renderer/data/geometry.json' with { type: 'json' };
import { framing } from './settings.js';

const color = rgb => new THREE.Color(...rgb);
const line = (points, radius) => {
  const path = new THREE.CurvePath();
  for (let i = 1; i < points.length; i++) {
    const a = new THREE.Vector3(...points[i - 1]), b = new THREE.Vector3(...points[i]);
    if (a.distanceToSquared(b) > 1e-12) path.add(new THREE.LineCurve3(a, b));
  }
  return new THREE.TubeGeometry(path, Math.max(points.length * 2, 12), radius, 6, false);
};
const merge = geometries => { const result = mergeGeometries(geometries); geometries.forEach(g => g.dispose()); return result; };
const circle = (r, z) => Array.from({ length: 97 }, (_, i) => [r * Math.cos(i * Math.PI / 48), r * Math.sin(i * Math.PI / 48), z]);

function createGeometry() {
  const wires = [], active = {};
  for (const [d, paths] of Object.entries(G.glyphs)) {
    const y = G.layer_start + Number(d) * G.layer_step;
    const glow = [];
    for (const path of paths) {
      const points = path.map(([x, z]) => [x, y, z + G.digit_center]);
      wires.push(line(points, G.wire_radius)); glow.push(line(points, G.glow_radius));
    }
    active[d] = merge(glow);
    const [x, z] = paths[0][0];
    wires.push(line([[x, y, G.digit_center + z], [x, y, .48]], .0035));
  }
  const [dx, dy, dz] = G.dot;
  wires.push(line([[dx, dy, .45], [dx, dy, dz]], .008));
  const dot = new THREE.SphereGeometry(G.dot_radius, 20, 12); dot.translate(dx, dy, dz); wires.push(dot);
  active['.'] = new THREE.SphereGeometry(G.dot_glow_radius, 20, 12); active['.'].translate(dx, dy, dz);
  for (const z of [.64, 1.94]) wires.push(line([[-.29, .2, z], [.29, .2, z]], .009));
  for (const t of [.1, .25, .5, .75, .9]) {
    const x = .32 * Math.cos(Math.PI * t), y = .32 * Math.sin(Math.PI * t);
    wires.push(line([[x, y, .62], [x, y, 1.99]], .0035));
  }
  const support = merge([-.29, .29].map(x => line([[x, .2, .46], [x, .2, 1.98]], .01)));
  // Same surface-of-revolution profile as Blender, using Z as the up axis.
  const glass = new THREE.LatheGeometry(G.profile.map(([r, z]) => new THREE.Vector2(r, z)), 80); glass.rotateX(Math.PI / 2);
  const cylinder = (r, h, z) => { const g = new THREE.CylinderGeometry(r, r, h, 64); g.rotateX(Math.PI / 2); g.translate(0, 0, z); return g; };
  return { active, wires: merge(wires), support, glass,
    socket: cylinder(.415, .24, .29), rim: cylinder(.392, .028, .425), band: cylinder(.419, .018, .193),
    grooves: merge([.245, .27, .295].map(z => line(circle(.416, z), .003))) };
}

export class MeterRenderer {
  constructor(canvas, frame, onCameraChange, onError) {
    this.canvas = canvas; this.frame = frame; this.onCameraChange = onCameraChange;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1); this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0);
    this.geometry = createGeometry(); this.group = new THREE.Group(); this.scene.add(this.group);
    const standard = (rgb, metalness, roughness) => new THREE.MeshStandardMaterial({ color: color(rgb), metalness, roughness });
    this.materials = {
      wire: standard([.19, .22, .24], .85, .28),
      gas: new THREE.MeshStandardMaterial({ color: 0, emissive: color([1, .115, .008]), emissiveIntensity: 18 }),
      base: standard([.012, .015, .019], .4, .16),
      metal: new THREE.MeshPhysicalMaterial({ color: color([.018, .022, .028]), metalness: .7, roughness: .17, clearcoat: .65, clearcoatRoughness: .09 }),
      brass: standard([.48, .32, .14], .88, .2), pins: standard([.3, .23, .13], .8, .26),
      glass: new THREE.MeshPhysicalMaterial({ color: color([.94, .98, 1]), transmission: 1, thickness: .0012, ior: 1.46, roughness: .085, specularIntensity: .44, side: THREE.DoubleSide, depthWrite: false }),
    };
    RectAreaLightUniformsLib.init();
    this.studio = new THREE.RectAreaLight(0xffffff, 0, 5, 2); this.studio.up.set(0, 0, 1); this.scene.add(this.studio);
    this.ambient = new THREE.AmbientLight(color([.08, .12, .2]), 0); this.scene.add(this.ambient);
    const shader = { ...Reflector.ReflectorShader, uniforms: { ...Reflector.ReflectorShader.uniforms, strength: { value: 0 } },
      fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec4 vUv;
      void main(){gl_FragColor=vec4(texture2D(tDiffuse,vUv.xy/vUv.w).rgb*strength,1.);}` };
    this.floor = new Reflector(new THREE.PlaneGeometry(200, 200), { textureWidth: 1024, textureHeight: 1024, shader, multisample: 0 });
    // Blur the reflection texture in two passes at adjacent texels. Sparse,
    // widely spaced samples produce separate ghost images of bright cathodes.
    const blurTargets = [0, 1].map(() => new THREE.WebGLRenderTarget(1024, 1024, { type: THREE.HalfFloatType, depthBuffer: false }));
    const blurMaterial = new THREE.ShaderMaterial({
      uniforms: { source: { value: null }, direction: { value: new THREE.Vector2() }, sigma: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `uniform sampler2D source; uniform vec2 direction; uniform float sigma; varying vec2 vUv;
        void main(){vec3 sum=vec3(0.);float total=0.;
        for(int i=-54;i<=54;i++){float w=exp(-.5*float(i*i)/(sigma*sigma));
          sum+=texture2D(source,clamp(vUv+direction*float(i),vec2(.5/1024.),vec2(1.-.5/1024.))).rgb*w;total+=w;}
        gl_FragColor=vec4(sum/total,1.);}`,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    const blurQuad = new FullScreenQuad(blurMaterial);
    const reflect = this.floor.onBeforeRender;
    this.floor.onBeforeRender = (renderer, scene, camera) => {
      reflect.call(this.floor, renderer, scene, camera);
      const source = this.floor.getRenderTarget().texture;
      const sigma = this.config.floor_roughness ** 2 * 18;
      this.floor.material.uniforms.tDiffuse.value = source;
      if (sigma < .25) return;
      const previousTarget = renderer.getRenderTarget();
      try {
        blurMaterial.uniforms.sigma.value = sigma;
        for (let axis = 0; axis < 2; axis++) {
          blurMaterial.uniforms.source.value = axis === 0 ? source : blurTargets[0].texture;
          blurMaterial.uniforms.direction.value.set(axis === 0 ? 1 / 1024 : 0, axis === 1 ? 1 / 1024 : 0);
          renderer.setRenderTarget(blurTargets[axis]); blurQuad.render(renderer);
        }
        this.floor.material.uniforms.tDiffuse.value = blurTargets[1].texture;
      } finally { renderer.setRenderTarget(previousTarget); }
    };
    const disposeFloor = this.floor.dispose;
    this.floor.dispose = () => { blurTargets.forEach(target => target.dispose()); blurMaterial.dispose(); blurQuad.dispose(); disposeFloor.call(this.floor); };
    this.floor.position.z = -.13; this.scene.add(this.floor);
    this.composer = new EffectComposer(this.renderer); this.renderPass = new RenderPass(this.scene, new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(800, 450), .012, .05, 1.4);
    this.composer.addPass(this.renderPass); this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(frame.parentElement);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; onError('The browser lost its graphics context. Download your settings, then reload the page.'); });
  }

  rebuild(reading) {
    this.group.traverse(o => { if (o.userData.ownedGeometry) o.geometry.dispose(); });
    this.group.clear(); this.lights = [];
    const { geometry: g, materials: m } = this;
    const add = (geometry, material, x = 0, parent = this.group) => { const obj = new THREE.Mesh(geometry, material); obj.position.x = x; parent.add(obj); return obj; };
    [...reading].forEach((digit, i) => {
      const x = (i - (reading.length - 1) / 2) * G.pitch;
      const tube = new THREE.Group(); tube.name = `Tube ${i + 1}`; tube.position.x = x;
      tube.userData = { characters: '0123456789.', active: digit, dot: G.dot }; this.group.add(tube);
      for (const [geometry, material] of [[g.wires, m.wire], [g.support, m.pins], [g.socket, m.base], [g.rim, m.brass], [g.band, m.brass], [g.grooves, m.metal], [g.active[digit], m.gas], [g.glass, m.glass]]) add(geometry, material, 0, tube);
      // Approximation of local light scattered from the emissive cathodes.
      for (const offset of [-.25, .25]) {
        const light = new THREE.PointLight(0xff7722, 0, 3, 2);
        light.position.set(digit === '.' ? G.dot[0] : 0, -.08, digit === '.' ? G.dot[2] : G.digit_center + offset);
        light.userData.dot = digit === '.'; tube.add(light); this.lights.push(light);
      }
    });
    const width = reading.length * G.pitch + .3;
    const box = (size, z, material, radius) => { const geometry = new RoundedBoxGeometry(...size, 3, radius); const obj = add(geometry, material); obj.position.z = z; obj.userData.ownedGeometry = true; };
    box([width, 1.05, .27], .045, m.metal, .05);
    box([width + .008, 1.058, .018], -.055, m.brass, .008);
    box([width - .16, .93, .028], .184, m.base, .013);
    for (const x of [-width / 2 + .16, width / 2 - .16]) for (const y of [-.37, .37]) {
      const geometry = new THREE.CylinderGeometry(.038, .038, .018, 24); geometry.rotateX(Math.PI / 2);
      const obj = add(geometry, m.pins, x); obj.position.set(x, y, .192); obj.userData.ownedGeometry = true;
    }
  }

  apply(c) {
    if (!this.config || this.config.reading !== c.reading) this.rebuild(c.reading);
    this.config = structuredClone(c);
    const m = this.materials;
    m.gas.emissive.copy(color(c.glow_color)); m.gas.emissiveIntensity = c.brightness;
    // Screen-space transmission blurs much more than Cycles at the same roughness.
    // This preview mapping keeps thin glass legible; exported values stay unchanged.
    m.glass.roughness = c.glass_roughness * .35; m.glass.specularIntensity = c.glass_reflection * 2; m.glass.ior = c.glass_ior;
    m.metal.roughness = c.base_roughness;
    this.lights.forEach(l => { l.color.copy(color(c.glow_color)); l.intensity = c.brightness * (l.userData.dot ? .0006 : .014); });
    this.studio.color.copy(color(c.studio_color)); this.studio.width = c.studio_size; this.studio.height = c.studio_size_y;
    this.studio.intensity = c.studio_brightness / (c.studio_size * c.studio_size_y * Math.PI);
    this.studio.position.set(...c.studio_position); this.studio.lookAt(...c.studio_target);
    this.ambient.intensity = c.ambient_brightness;
    this.floor.visible = c.reflection > 0;
    this.floor.material.uniforms.strength.value = c.reflection * .65;
    this.renderer.toneMappingExposure = 2 ** c.exposure;
    this.bloom.enabled = c.bloom; this.bloom.threshold = c.bloom_threshold;
    const f = framing(c);
    if (!this.camera || (c.camera_type === 'ORTHO') !== this.camera.isOrthographicCamera) {
      this.controls?.dispose();
      this.camera = c.camera_type === 'ORTHO' ? new THREE.OrthographicCamera() : new THREE.PerspectiveCamera();
      this.camera.up.set(0, 0, 1);
      this.controls = new OrbitControls(this.camera, this.canvas); this.controls.enableDamping = false;
      this.controls.minDistance = .3; this.controls.maxDistance = 500; this.controls.minZoom = .02; this.controls.maxZoom = 20;
      this.controls.addEventListener('change', () => {
        if (this.applying) return;
        const patch = { camera_position: this.camera.position.toArray(), camera_target: this.controls.target.toArray() };
        if (this.camera.isOrthographicCamera) patch.camera_scale = framing(this.config).scale / this.camera.zoom;
        this.onCameraChange(patch); this.requestRender();
      });
      this.renderPass.camera = this.camera;
    }
    this.applying = true;
    if (this.camera.isOrthographicCamera) { this.camera.left = -f.width / 2; this.camera.right = f.width / 2; this.camera.top = f.height / 2; this.camera.bottom = -f.height / 2; }
    else { this.camera.fov = f.fov; this.camera.aspect = f.aspect; }
    this.camera.near = .01; this.camera.far = 1000; this.camera.zoom = 1;
    this.camera.position.set(...c.camera_position); this.controls.target.set(...c.camera_target);
    this.camera.lookAt(this.controls.target); this.camera.updateProjectionMatrix(); this.controls.update();
    this.applying = false; this.resize();
  }

  resize() {
    if (!this.config) return;
    const bounds = this.frame.parentElement.getBoundingClientRect(), aspect = this.config.width / this.config.height;
    let w = bounds.width, h = w / aspect; if (h > bounds.height) { h = bounds.height; w = h * aspect; }
    this.frame.style.width = `${w}px`; this.frame.style.height = `${h}px`;
    this.width = Math.max(1, Math.round(w)); this.height = Math.max(1, Math.round(h));
    this.renderer.setSize(this.width, this.height, false); this.composer.setSize(this.width, this.height); this.requestRender();
  }

  requestRender() {
    if (this.pending || this.lost) return;
    this.pending = requestAnimationFrame(() => { this.pending = null; this.composer.render(); this.canvas.dataset.ready = 'true'; });
  }

  async png() {
    if (this.lost) throw Error('Reload the page to restore the preview before saving a PNG.');
    const { width, height } = this.config;
    const max = this.renderer.capabilities.maxTextureSize;
    if (width > max || height > max || width * height > 16777216) throw Error('This preview export is too large for the browser. Use the Blender command, or choose a smaller output size.');
    try {
      this.renderer.setSize(width, height, false); this.composer.setSize(width, height); this.composer.render();
      const blob = await new Promise(resolve => this.canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw Error('PNG export failed. Try a smaller output size.');
      return blob;
    } finally { this.renderer.setSize(this.width, this.height, false); this.composer.setSize(this.width, this.height); this.requestRender(); }
  }
}
