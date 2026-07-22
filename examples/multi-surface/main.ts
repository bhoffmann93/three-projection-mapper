/*
Multi Surface Example — atlas pattern
-------------------------------------
Two independently warped square surfaces sampling one shared input buffer
(Resolume-style slices). The buffer is an atlas rendered with scissor/viewport
regions: left half = a 3D scene (rotating cube), right half = a GLSL shader.
Each region renders once, straight into the shared render target — no blits.
The surfaces spawn side by side, not overlapping.

Click a surface on the canvas to select it and drag its body to move it; only
the active surface shows drag handles. The input view (bottom right) shows the
shared buffer with one crop rect per surface — drag a rect to re-crop.
*/

import * as THREE from 'three';
import { ProjectionMapper, ProjectionMapperGUI } from '../../src/lib';
import { UvRectEditor } from '../../src/addons';

const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Atlas: two square 1080x1080 regions side by side in one buffer
const regionRes = { width: 1080, height: 1080 };
const bufferRes = { width: regionRes.width * 2, height: regionRes.height };

// --- Region 1: 3D scene with a rotating cube ---

const cubeScene = new THREE.Scene();
cubeScene.background = new THREE.Color(0x101018);

const cubeCamera = new THREE.PerspectiveCamera(45, regionRes.width / regionRes.height, 0.1, 100);
cubeCamera.position.set(0, 0.75, 4);
cubeCamera.lookAt(0, 0, 0);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1.5, 1.5, 1.5),
  new THREE.MeshStandardMaterial({ color: 0xff7733, roughness: 0.35, metalness: 0.2 }),
);
cubeScene.add(cube);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(2, 3, 4);
cubeScene.add(keyLight);
cubeScene.add(new THREE.HemisphereLight(0x8899ff, 0x332211, 1.0));

// --- Region 2: fullscreen shader ---

const shaderCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const shaderScene = new THREE.Scene();

const shaderMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    // gl_FragCoord is in atlas pixels, so the shader needs its region's placement
    uRegionOffset: { value: new THREE.Vector2(regionRes.width, 0) },
    uRegionSize: { value: new THREE.Vector2(regionRes.width, regionRes.height) },
  },
  vertexShader: /* glsl */ `
    void main() {
      gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec2 uRegionOffset;
    uniform vec2 uRegionSize;

    #define TAU 6.28318530718

    //IQ palette
    vec3 palette(float t) {
      return 0.5 + 0.5 * cos(TAU * (t + vec3(0.0, 0.33, 0.67)));
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - uRegionOffset) / uRegionSize;

      vec2 p = uv - 0.5;
      p.x *= uRegionSize.x / uRegionSize.y;
      float d = length(p);
      vec3 color = palette(d - uTime * 0.1) * smoothstep(0.0, 0.05, abs(sin(d * 20.0 - uTime * 2.0)));

      gl_FragColor = vec4(color, 1.0);
    }
  `,
  depthTest: false,
  depthWrite: false,
});

shaderScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shaderMaterial));

// --- Shared atlas buffer ---
const renderTarget = new THREE.WebGLRenderTarget(bufferRes.width, bufferRes.height, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  generateMipmaps: false,
});

// resolution = one region's resolution so each surface's plane aspect
// matches the half of the atlas it samples
const mapper = new ProjectionMapper(renderer, renderTarget.texture, {
  resolution: regionRes,
  zoom: 0.4,
});

// Apply the example layout once: one surface per atlas region, side by side
// (surfaces are 10 world units wide, so ±6 leaves a 2-unit gap). The marker
// key survives reloads, so calibration afterwards restores from localStorage.
// Bump the marker version to force a fresh layout on existing storage.
const LAYOUT_KEY = 'multi-surface-example-layout-v1';
if (!localStorage.getItem(LAYOUT_KEY)) {
  const cubeSurface = mapper.getSurfaces()[0];
  const shaderSurface =
    mapper.getSurfaces()[1] ?? mapper.addSurface({ uvRect: { offsetX: 0.5, offsetY: 0, scaleX: 0.5, scaleY: 1 } });
  mapper.setUvRect(0, 0, 0.5, 1, cubeSurface.id);
  mapper.setUvRect(0.5, 0, 0.5, 1, shaderSurface.id);
  mapper.reset(); // clear any stored warp before placing
  cubeSurface.setPosition(-6, 0);
  shaderSurface.setPosition(6, 0);
  localStorage.setItem(LAYOUT_KEY, '1');
}

const gui = new ProjectionMapperGUI(mapper, {
  title: 'Projection Mapper',
  anchor: 'left',
});

const uvRectEditor = new UvRectEditor(mapper);

const hint = document.createElement('div');
hint.style.cssText =
  'position:fixed;bottom:16px;left:16px;color:rgba(255,255,255,0.5);font:12px/1.6 monospace;pointer-events:none;transition:opacity 0.3s';
hint.innerHTML =
  '<span>G</span> toggle UI<br><span>T</span> test card<br><span>W</span> warp controls<br><span>I</span> input view<br>Click a surface to select it, drag its body to move it';
document.body.appendChild(hint);

let uiVisible = true;
window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'p') {
    gui.toggle();
    uvRectEditor.toggle();
    uiVisible = !uiVisible;
    hint.style.opacity = uiVisible ? '1' : '0';
  }
  if (e.key === 'i') uvRectEditor.toggle();
  if (e.key === 't') gui.toggleTestCard();
  if (e.key === 'w') gui.toggleWarpUI();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  mapper.resize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const t = clock.getElapsedTime();
  cube.rotation.x = t * 0.5;
  cube.rotation.y = t * 0.8;
  shaderMaterial.uniforms.uTime.value = t;

  // Render both regions into the shared atlas. The render target's own
  // viewport/scissor are used (renderer.setViewport is canvas-only — it
  // scales by devicePixelRatio); setRenderTarget applies them, so re-bind
  // after each change.
  renderTarget.scissorTest = true;

  renderTarget.viewport.set(0, 0, regionRes.width, regionRes.height);
  renderTarget.scissor.set(0, 0, regionRes.width, regionRes.height);
  renderer.setRenderTarget(renderTarget);
  renderer.render(cubeScene, cubeCamera);

  renderTarget.viewport.set(regionRes.width, 0, regionRes.width, regionRes.height);
  renderTarget.scissor.set(regionRes.width, 0, regionRes.width, regionRes.height);
  renderer.setRenderTarget(renderTarget);
  renderer.render(shaderScene, shaderCamera);

  renderTarget.scissorTest = false;
  renderer.setRenderTarget(null);
  mapper.render();
  uvRectEditor.update(renderer);
}

animate();

console.log('Multi Surface Example (atlas: scene + shader in one buffer)');
console.log('Controls:');
console.log('  G/P - Toggle GUI');
console.log('  T   - Toggle testcard');
console.log('  W   - Toggle warp UI');
console.log('  I   - Toggle input view (UV rect editor)');
console.log('  Click a surface to select it, drag its body to move it');
console.log('  Surfaces folder: add / remove surfaces; input view: crop them');
