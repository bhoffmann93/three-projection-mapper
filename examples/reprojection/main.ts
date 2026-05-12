/**
 * Reprojection Example
 *
 * Implements the two-pass reprojection approach described in projection mapping
 * workflows: content is rendered from one camera, then re-projected onto a 3D
 * surface viewed from a completely different (extreme) angle.
 *
 * Pass 1 — Animated cube swarm rendered from a standard front-view
 *           content camera → contentRT
 *
 * Pass 2 — bergi.obj + ground plane textured with a projective-texture shader
 *           that maps contentRT onto world-space geometry using the content
 *           camera's projection matrix. This scene is rendered from an EXTREME
 *           oblique projector camera → warpRT
 *
 * Pass 3 — ProjectionMapper warps warpRT for interactive calibration output.
 *
 * Controls: G/P toggle GUI  |  T testcard  |  W toggle warp handles
 */

import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ProjectionMapper } from '../../src/core/ProjectionMapper';
import { ProjectionMapperGUI, GUI_ANCHOR } from '../../src/core/ProjectionMapperGUI';
import { ProjectorCamera } from '../../src/core/ProjectorCamera';

// ── Renderer ──────────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance', antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const oversamplingFactor = 1.25;
const projectionResolution = new THREE.Vector2(1920, 1080);
const renderRes = projectionResolution.clone().multiplyScalar(oversamplingFactor);
const aspect = projectionResolution.x / projectionResolution.y;

// ── Scene A: Viewer's perspective — bergi as it should appear to the audience ──
//
// This is what gets projected onto the physical geometry. The viewer stands at
// contentCamera's position. The projector takes this rendered image and warps it
// so that from the viewer's eye, FLUCHTEN converge correctly — anamorphic billboard.

const contentScene = new THREE.Scene();
contentScene.background = new THREE.Color(0x060609);

// Viewer position — in front of and slightly below the model center
const contentCamera = new THREE.PerspectiveCamera(40, aspect, 0.1, 100);
contentCamera.position.set(0, 1.5, 6);
contentCamera.lookAt(0, 1, 0);
contentCamera.updateMatrixWorld();

const textureLoader = new THREE.TextureLoader();
// @ts-ignore
const concreteTexture = textureLoader.load(`${import.meta.env.BASE_URL}concrete_0019_1k_K4mRwL/concrete_0019_color_1k.jpg`);
concreteTexture.wrapS = THREE.RepeatWrapping;
concreteTexture.wrapT = THREE.RepeatWrapping;

const concreteMat = new THREE.MeshStandardMaterial({
  map: concreteTexture,
  roughness: 0.9,
  metalness: 0.0,
});

contentScene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(3, 6, 4);
contentScene.add(dirLight);

// Load bergi into viewer scene with concrete material
const loaderContent = new OBJLoader();
// @ts-ignore
loaderContent.load(`${import.meta.env.BASE_URL}bergi.obj`, (obj) => {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      (child as THREE.Mesh).material = concreteMat;
    }
  });
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const scale = 2 / Math.max(size.x, size.y, size.z);
  obj.scale.setScalar(scale);
  box.setFromObject(obj);
  obj.position.set(0, -box.min.y * 1.3, 0);
  obj.rotation.y = -Math.PI / 2;
  contentScene.add(obj);
});

// Render target for the content pass
const contentRT = new THREE.WebGLRenderTarget(renderRes.x, renderRes.y, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  generateMipmaps: false,
});

// ── Projective texture shader ─────────────────────────────────────────────────
//
// For each world-space fragment on the projection geometry (bergi + ground),
// compute where that point would appear in the content camera's view and sample
// contentRT at that UV. This "paints" the animated cubes onto the 3D surface.

const contentMatrixUniform = { value: new THREE.Matrix4() };

const projTexMat = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    varying vec4 vProjCoord;
    varying vec2 vUv;
    uniform mat4 uContentMatrix;

    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vProjCoord = uContentMatrix * worldPos;
      vUv = uv;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec4 vProjCoord;
    varying vec2 vUv;
    uniform sampler2D uContentTexture;
    uniform sampler2D uModelTexture;
    uniform float uMix;

    void main() {
      vec4 modelColor = texture2D(uModelTexture, vUv);

      // Outside projector frustum — show only model texture
      if (vProjCoord.w <= 0.0) {
        gl_FragColor = modelColor;
        return;
      }
      vec2 projUv = (vProjCoord.xy / vProjCoord.w) * 0.5 + 0.5;
      if (projUv.x < 0.0 || projUv.x > 1.0 || projUv.y < 0.0 || projUv.y > 1.0) {
        gl_FragColor = modelColor;
        return;
      }

      vec4 projColor = texture2D(uContentTexture, projUv);
      gl_FragColor = mix(modelColor, projColor, uMix);
    }
  `,
  uniforms: {
    uContentTexture: { value: contentRT.texture },
    uModelTexture: { value: concreteTexture },
    uContentMatrix: contentMatrixUniform,
    uMix: { value: 0.75 },
  },
});

// ── Scene B: Projection surface (bergi + ground with projected content) ────────

const projScene = new THREE.Scene();
projScene.background = new THREE.Color(0x020204);

// Ground plane — receives the projected cube animation
const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), projTexMat);
ground.rotation.x = -Math.PI / 2;
projScene.add(ground);

// bergi.obj — the sculptural surface the content is reprojected onto
const loader = new OBJLoader();
// @ts-ignore
loader.load(`${import.meta.env.BASE_URL}bergi.obj`, (obj) => {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      (child as THREE.Mesh).material = projTexMat;
    }
  });
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const scale = 2 / Math.max(size.x, size.y, size.z);
  obj.scale.setScalar(scale);
  box.setFromObject(obj);
  obj.position.set(0, -box.min.y * 1.3, 0);
  obj.rotation.y = -Math.PI / 2;
  projScene.add(obj);
});

// ── Extreme perspective projector camera ──────────────────────────────────────
//
// Simulates a short-throw projector mounted high and far to one side, aimed
// steeply downward at the sculpture. The combination of a low throw ratio
// (wide-angle optics) and heavy lens shift produces severe oblique keystoning —
// exactly the kind of distortion that the ProjectionMapper is designed to correct.

// TEST: Use standard perspective camera first to verify geometry renders
const projectorCamera = new THREE.PerspectiveCamera(50, aspect, 0.1, 200);
projectorCamera.position.set(2.8, 5.2, 5.8);
projectorCamera.lookAt(0, 0.3, 0);

// Uncomment this to use the actual ProjectorCamera with lens shift:
// const projectorCamera = new ProjectorCamera(0.55, 1.75, aspect, 0.1, 200);
// projectorCamera.position.set(2.8, 5.2, 5.8);
// projectorCamera.lookAt(0, 0.3, 0);
// projectorCamera.updateProjectionMatrix();

// ── Warp render target → ProjectionMapper ─────────────────────────────────────

const warpRT = new THREE.WebGLRenderTarget(renderRes.x, renderRes.y, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  generateMipmaps: false,
});

const mapper = new ProjectionMapper(renderer, warpRT.texture);
const gui = new ProjectionMapperGUI(mapper, {
  title: 'Reprojection Demo',
  anchor: GUI_ANCHOR.LEFT,
});

// ── Camera controls ──────────────────────────────────────────────────────────

const controls = new OrbitControls(projectorCamera, renderer.domElement);
controls.target.set(0, 0.3, 0);
controls.enableDamping = false;
controls.autoRotate = false;

// Visualize the texture projector (contentCamera) in the projection scene
const contentCameraHelper = new THREE.CameraHelper(contentCamera);
contentCameraHelper.scale.setScalar(0.2);
projScene.add(contentCameraHelper);

const contentCameraMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.05, 6, 6),
  new THREE.MeshBasicMaterial({ color: 0xff6600 })
);
contentCameraMarker.position.copy(contentCamera.position);
projScene.add(contentCameraMarker);

const contentViewDir = new THREE.Vector3(0, 0, -1).applyQuaternion(contentCamera.quaternion).normalize();
const arrowHelper = new THREE.ArrowHelper(contentViewDir, contentCamera.position, 1, 0xff6600);
projScene.add(arrowHelper);

// ── Animation loop ─────────────────────────────────────────────────────────────

const clock = new THREE.Clock();

window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'p') gui.toggle();
  if (e.key === 't') gui.toggleTestCard();
  if (e.key === 'w') gui.toggleWarpUI();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  mapper.resize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);

  controls.update();
  contentCameraHelper.update();
  contentCameraMarker.position.copy(contentCamera.position);

  const contentViewDir = new THREE.Vector3(0, 0, -1).applyQuaternion(contentCamera.quaternion).normalize();
  arrowHelper.setDirection(contentViewDir);
  arrowHelper.position.copy(contentCamera.position);

  // Recompute content projection matrix each frame
  contentCamera.updateMatrixWorld();
  contentMatrixUniform.value.multiplyMatrices(contentCamera.projectionMatrix, contentCamera.matrixWorldInverse);

    // Pass 1: Render bergi from viewer's perspective
  renderer.setRenderTarget(contentRT);
  renderer.render(contentScene, contentCamera);

  // Pass 2: Project viewer's render onto physical geometry from projector angle
  renderer.setRenderTarget(warpRT);
  renderer.render(projScene, projectorCamera);

  // Pass 3: Warp & output to screen
  renderer.setRenderTarget(null);
  mapper.render();
}

animate();
