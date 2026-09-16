import * as THREE from 'three';
import { PathTracingRenderer, PathTracingSceneGenerator, GradientEquirectTexture, DenoiseMaterial } from 'three-gpu-pathtracer';
import { TexturePass } from 'three/addons/postprocessing/TexturePass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Use the low-level public API to compile only the shader features this scene
// uses, instead of compiling intermediate fog/DOF/preview variants at startup.
class SceneTracer {
  constructor(owner) {
    if (!owner.renderer.extensions.has('EXT_color_buffer_float')) throw Error('This GPU does not support floating-point render targets.');
    this.owner = owner; this.engine = new PathTracingRenderer(owner.renderer);
    this.generator = new PathTracingSceneGenerator();
    this.background = new GradientEquirectTexture(16);
    this.background.topColor.set(0); this.background.bottomColor.set(0); this.background.update();
    const m = this.engine.material;
    Object.assign(m.defines, { FEATURE_DOF: 0, FEATURE_FOG: 0, FEATURE_BACKGROUND_MAP: 1, CAMERA_TYPE: owner.camera.isOrthographicCamera ? 1 : 0 });
    m.bounces = 12; m.transmissiveBounces = 8; m.backgroundMap = this.background; m.backgroundAlpha = 1;
    this.engine.tiles.set(2, 2);
    this.engine.alpha = !owner.renderer.extensions.has('EXT_float_blend');
  }
  get samples() { return this.engine.samples; }
  get target() { return this.engine.target; }
  get isCompiling() { return this.engine.isCompiling; }
  setScene(scene, camera) {
    scene.updateMatrixWorld(true); this.generator.setObjects(scene);
    const result = this.generator.generate(), m = this.engine.material, a = result.geometry.attributes;
    m.bvh.updateFrom(result.bvh);
    m.attributesArray.updateFrom(a.normal, a.tangent, a.uv, a.color);
    m.materialIndexAttribute.updateFrom(a.materialIndex);
    m.textures.setTextures(this.owner.renderer, result.textures, 1024, 1024);
    m.materials.updateFrom(result.materials, result.textures);
    m.lights.updateFrom(result.lights, result.iesTextures);
    m.iesProfiles.setTextures(this.owner.renderer, result.iesTextures);
    m.environmentIntensity = scene.environment ? scene.environmentIntensity : 0;
    if (scene.environment) m.envMapInfo.updateFrom(scene.environment);
    this.setCamera(camera);
    if (!this.compiled) { this.compiled = true; m.needsUpdate = true; }
  }
  setCamera(camera) { camera.updateMatrixWorld(); this.engine.setCamera(camera); this.engine.reset(); }
  renderSample() {
    this.engine.setSize(this.owner.width, this.owner.height);
    this.engine.update();
  }
}

// Match Blender's solidify modifier: an inward offset and reversed inner faces.
function glassShell(source) {
  const outer = source.clone(), inner = source.clone();
  const p = inner.attributes.position, n = inner.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) - n.getX(i) * .0012, p.getY(i) - n.getY(i) * .0012, p.getZ(i) - n.getZ(i) * .0012);
    n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  }
  const indices = inner.index.array;
  for (let i = 0; i < indices.length; i += 3) [indices[i], indices[i + 2]] = [indices[i + 2], indices[i]];
  const result = mergeGeometries([outer, inner]);
  const faces = Array.from(result.index.array), count = p.count, rows = source.parameters.points.length;
  for (let segment = 0; segment < source.parameters.segments; segment++) {
    for (const row of [0, rows - 1]) {
      const a = segment * rows + row, b = (segment + 1) * rows + row;
      if (row === 0) faces.push(a, a + count, b, b, a + count, b + count);
      else faces.push(a, b, a + count, b, b + count, a + count);
    }
  }
  result.setIndex(faces); outer.dispose(); inner.dispose(); return result;
}

export class PathPreview {
  constructor(owner) {
    this.owner = owner;
    this.tracer = new SceneTracer(owner);
    this.pass = new TexturePass(this.tracer.target.texture); this.pass.enabled = false;
    owner.composer.insertPass(this.pass, 1);
    const denoise = new DenoiseMaterial({ sigma: 1, kSigma: 2, threshold: .12 }); denoise.toneMapped = false;
    this.denoise = new ShaderPass(denoise, 'map'); this.denoise.enabled = false;
    owner.composer.insertPass(this.denoise, 2);
    this.materials = []; this.geometries = [];
  }
  setScene() {
    this.materials.forEach(m => m.dispose()); this.geometries.forEach(g => g.dispose());
    this.materials = []; this.geometries = [];
    const o = this.owner, c = o.config;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0);
    const group = o.group.clone(true), cache = new Map();
    group.traverse(obj => {
      if (obj.isLight) { obj.visible = false; return; }
      if (!obj.isMesh) return;
      const source = obj.material;
      if (!cache.has(source)) {
        const material = source.clone();
        if (source === o.materials.glass) {
          material.roughness = c.glass_roughness; material.thickness = 0;
        }
        if (source === o.materials.gas) {
          material.color.setRGB(...c.glow_color); material.metalness = .1; material.roughness = .26;
        }
        cache.set(source, material); this.materials.push(material);
      }
      obj.material = cache.get(source);
      if (source === o.materials.glass) {
        if (!this.shell) this.shell = glassShell(o.geometry.glass);
        obj.geometry = this.shell;
      }
    });
    // Preview point lights are deliberately absent: the cathodes emit the light.
    const helpers = []; group.traverse(obj => { if (obj.isLight) helpers.push(obj); }); helpers.forEach(l => l.removeFromParent());
    scene.add(group);
    const floorMaterial = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(.0001, .0001, .0001), roughness: c.floor_roughness, specularIntensity: c.reflection });
    const floorGeometry = new THREE.PlaneGeometry(200, 200);
    this.materials.push(floorMaterial); this.geometries.push(floorGeometry);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.position.z = -.13; scene.add(floor);
    if (c.studio_brightness > 0) scene.add(o.studio.clone());
    if (c.ambient_brightness > 0) {
      const data = new Float32Array([.08, .12, .2, 1, .08, .12, .2, 1]);
      this.environment?.dispose();
      this.environment = new THREE.DataTexture(data, 2, 1, THREE.RGBAFormat, THREE.FloatType);
      this.environment.mapping = THREE.EquirectangularReflectionMapping; this.environment.needsUpdate = true;
      scene.environment = this.environment; scene.environmentIntensity = c.ambient_brightness;
    }
    this.tracer.setScene(scene, o.camera);
  }
  resetCamera() { this.tracer.setCamera(this.owner.camera); }
  show(enabled) { this.pass.enabled = enabled; this.denoise.enabled = enabled; this.owner.renderPass.enabled = !enabled; }
  render() { this.tracer.renderSample(); this.pass.map = this.tracer.target.texture; this.show(this.tracer.samples >= 1); this.owner.composer.render(); }
}
