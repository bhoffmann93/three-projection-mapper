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

// ── Scene A: Content (animated cube swarm) ────────────────────────────────────

const contentScene = new THREE.Scene();
contentScene.background = new THREE.Color(0x060609);

// Standard front-view camera — this defines the "intended audience perspective"
const contentCamera = new THREE.PerspectiveCamera(58, aspect, 0.1, 100);
contentCamera.position.set(0, 1.8, 5.2);
contentCamera.lookAt(0, 0.7, 0);

// Cube swarm orbiting the origin at varying radii, speeds, and heights
const NUM_CUBES = 50;
const palette = [0xff2255, 0x2299ff, 0xffcc00, 0x33ee88, 0xff6600, 0xaa33ff, 0x00ddff, 0xff3399];

interface CubeData {
  mesh: THREE.Mesh;
  r: number;
  speed: number;
  phase: number;
  h: number;
  hSpeed: number;
  hPhase: number;
}

const cubes: CubeData[] = [];

for (let i = 0; i < NUM_CUBES; i++) {
  const s = 0.06 + Math.random() * 0.22;
  const col = palette[i % palette.length];
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(s, s, s),
    new THREE.MeshStandardMaterial({
      color: col,
      emissive: new THREE.Color(col).multiplyScalar(0.45),
      roughness: 0.2,
      metalness: 0.75,
    }),
  );
  cubes.push({
    mesh,
    r: 0.4 + Math.random() * 2.4,
    speed: (0.2 + Math.random() * 0.6) * (Math.random() > 0.5 ? 1 : -1),
    phase: Math.random() * Math.PI * 2,
    h: Math.random() * 2.4,
    hSpeed: 0.18 + Math.random() * 0.5,
    hPhase: Math.random() * Math.PI * 2,
  });
  contentScene.add(mesh);
}

// Content scene lighting
contentScene.add(new THREE.HemisphereLight(0x3355aa, 0x221100, 0.5));
const cL1 = new THREE.PointLight(0xff2255, 10, 7);
const cL2 = new THREE.PointLight(0x2299ff, 10, 7);
const cL3 = new THREE.PointLight(0xffcc00, 7, 6);
contentScene.add(cL1, cL2, cL3);

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
    uniform mat4 uContentMatrix;

    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      // Project this vertex into content-camera clip space
      vProjCoord = uContentMatrix * worldPos;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec4 vProjCoord;
    uniform sampler2D uContentTexture;

    void main() {
      // Behind the content camera — show dark fallback
      if (vProjCoord.w <= 0.0) {
        gl_FragColor = vec4(0.03, 0.03, 0.05, 1.0);
        return;
      }
      vec2 uv = (vProjCoord.xy / vProjCoord.w) * 0.5 + 0.5;
      // Outside content frustum — show dark fallback
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.03, 0.03, 0.05, 1.0);
        return;
      }
      gl_FragColor = texture2D(uContentTexture, uv);
    }
  `,
  uniforms: {
    uContentTexture: { value: contentRT.texture },
    uContentMatrix: contentMatrixUniform,
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

const projectorCamera = new ProjectorCamera(
  0.55,  // throw ratio — very short/wide: extreme perspective compression
  1.75,  // lensShiftY  — frustum pushed far off-axis: steep oblique angle
  aspect,
  0.1,
  200,
);
projectorCamera.position.set(2.8, 5.2, 5.8);
projectorCamera.lookAt(0, 0.3, 0);
projectorCamera.updateProjectionMatrix();

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

window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'p') gui.toggle();
  if (e.key === 't') gui.toggleTestCard();
  if (e.key === 'w') gui.toggleWarpUI();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  mapper.resize(window.innerWidth, window.innerHeight);
});

// ── Animation loop ─────────────────────────────────────────────────────────────

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  // Orbit + bob + spin each cube
  cubes.forEach((c) => {
    const angle = t * c.speed + c.phase;
    c.mesh.position.set(
      Math.cos(angle) * c.r,
      c.h + Math.sin(t * c.hSpeed + c.hPhase) * 0.38,
      Math.sin(angle) * c.r,
    );
    c.mesh.rotation.set(t * 0.9, t * 0.65, t * 0.45);
  });

  // Orbit the content lights around the swarm
  cL1.position.set(Math.sin(t * 0.65) * 2.2, 1.6 + Math.cos(t * 0.9) * 0.7, Math.cos(t * 0.65) * 2.2);
  cL2.position.set(
    Math.sin(t * 0.65 + Math.PI) * 2.2,
    1.3 + Math.cos(t * 0.9 + Math.PI) * 0.7,
    Math.cos(t * 0.65 + Math.PI) * 2.2,
  );
  cL3.position.set(Math.sin(t * 1.15) * 3.0, 3.0, Math.cos(t * 1.35) * 3.0);

  // Recompute content projection matrix each frame (camera is static here,
  // but kept dynamic so it stays correct if you move it at runtime)
  contentCamera.updateMatrixWorld();
  contentMatrixUniform.value.multiplyMatrices(contentCamera.projectionMatrix, contentCamera.matrixWorldInverse);

  // Pass 1: Render cube animation from content camera
  renderer.setRenderTarget(contentRT);
  renderer.render(contentScene, contentCamera);

  // Pass 2: Render bergi with projected content, from extreme projector angle
  renderer.setRenderTarget(warpRT);
  renderer.render(projScene, projectorCamera);

  // Pass 3: Warp & output to screen
  renderer.setRenderTarget(null);
  mapper.render();
}

animate();
