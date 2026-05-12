/**
 * Reprojection Example
 *
 * Pass 1 — Bergi rendered from viewerCamera → viewerRT
 *
 * Pass 2 — Bergi + ground in projectorScene, textured with a projective shader
 *           that maps viewerRT onto world-space geometry using the viewerCamera's
 *           projection matrix. Rendered from projectorCamera → warpRT
 *
 * Pass 3 — ProjectionMapper warps warpRT for interactive calibration output.
 *
 * Controls: G/P toggle GUI  |  T testcard  |  W toggle warp handles  |  C preview viewerRT
 */

import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ProjectionMapper } from '../../src/core/ProjectionMapper';
import { ProjectionMapperGUI, GUI_ANCHOR } from '../../src/core/ProjectionMapperGUI';

// ── Renderer ──────────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance', antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const oversamplingFactor = 1.25;
const projectionResolution = new THREE.Vector2(1920, 1080);
const renderRes = projectionResolution.clone().multiplyScalar(oversamplingFactor);
const aspect = projectionResolution.x / projectionResolution.y;

// ── Viewer scene — bergi as seen from the audience position ───────────────────
//
// Rendered into viewerRT each frame. This image is then projected onto the
// physical geometry from the projector's position, so that from the viewer's
// eye the FLUCHTEN converge correctly — anamorphic billboard effect.

const viewerScene = new THREE.Scene();
viewerScene.background = new THREE.Color(0x000000);

// Viewer camera — initial placeholder, repositioned after model loads
const viewerCamera = new THREE.PerspectiveCamera(40, aspect, 0.1, 100);
viewerCamera.position.set(0, 1.0, 4);
viewerCamera.lookAt(0, 1, 0);
viewerCamera.updateMatrixWorld();

const textureLoader = new THREE.TextureLoader();
// @ts-ignore
const concreteTexture = textureLoader.load(
  `${import.meta.env.BASE_URL}concrete_0019_1k_K4mRwL/concrete_0019_color_1k.jpg`,
);
concreteTexture.wrapS = THREE.RepeatWrapping;
concreteTexture.wrapT = THREE.RepeatWrapping;

const concreteMat = new THREE.MeshStandardMaterial({
  map: concreteTexture,
  roughness: 0.9,
  metalness: 0.0,
});

viewerScene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(3, 6, 4);
viewerScene.add(dirLight);

const loaderViewer = new OBJLoader();
// @ts-ignore
loaderViewer.load(`${import.meta.env.BASE_URL}bergi.obj`, (obj) => {
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
  viewerScene.add(obj);
  obj.updateMatrixWorld(true);

  const finalBox = new THREE.Box3().setFromObject(obj);
  const center = finalBox.getCenter(new THREE.Vector3());
  const height = finalBox.max.y - finalBox.min.y;

  // Front-center viewer position
  // viewerCamera.position.set(center.x, center.y, center.z + height * 3);

  // Slightly left of center — mild anamorphic angle
  // Closer = text appears smaller on geometry
  viewerCamera.position.set(center.x - height * 0.6, center.y, center.z + height * 1.65);
  viewerCamera.lookAt(center);
  viewerCamera.updateMatrixWorld();
  viewerCameraHelper.update();
});

// Viewer render target — what viewerCamera sees each frame
const viewerRT = new THREE.WebGLRenderTarget(renderRes.x, renderRes.y, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  generateMipmaps: false,
});

// ── Projective texture shader ─────────────────────────────────────────────────
//
// For each world-space fragment, compute where it projects into viewerCamera's
// image and sample the projected texture at that UV.

const viewerMatrixUniform = { value: new THREE.Matrix4() };

// @ts-ignore
const uvGridTexture = textureLoader.load(`${import.meta.env.BASE_URL}uv-grid.jpg`);
// @ts-ignore
const typeTexture = textureLoader.load(`${import.meta.env.BASE_URL}type.png`);

const projTexMat = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    varying vec4 vProjCoord;
    varying vec2 vUv;
    uniform mat4 uViewerMatrix;

    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vProjCoord = uViewerMatrix * worldPos;
      vUv = uv;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec4 vProjCoord;
    varying vec2 vUv;
    uniform sampler2D uProjectedTexture;
    uniform sampler2D uModelTexture;
    uniform float uMix;

    void main() {
      vec4 modelColor = texture2D(uModelTexture, vUv);

      if (vProjCoord.w <= 0.0) {
        gl_FragColor = modelColor;
        return;
      }
      vec2 projUv = (vProjCoord.xy / vProjCoord.w) * 0.5 + 0.5;
      if (projUv.x < 0.0 || projUv.x > 1.0 || projUv.y < 0.0 || projUv.y > 1.0) {
        gl_FragColor = modelColor;
        return;
      }

      vec4 projColor = texture2D(uProjectedTexture, projUv);
      gl_FragColor = mix(modelColor, projColor, uMix);
    }
  `,
  uniforms: {
    uProjectedTexture: { value: typeTexture }, // swap to uvGridTexture to debug
    uModelTexture: { value: concreteTexture },
    uViewerMatrix: viewerMatrixUniform,
    uMix: { value: 1.0 },
  },
});

// ── Projector scene — physical geometry receiving the projection ───────────────

const projectorScene = new THREE.Scene();
projectorScene.background = new THREE.Color(0x000000);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), projTexMat);
ground.rotation.x = -Math.PI / 2;
projectorScene.add(ground);

const loaderProjector = new OBJLoader();
// @ts-ignore
loaderProjector.load(`${import.meta.env.BASE_URL}bergi.obj`, (obj) => {
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
  projectorScene.add(obj);
});

// ── Projector camera — output view, orbitable ─────────────────────────────────

const projectorCamera = new THREE.PerspectiveCamera(50, aspect, 0.1, 200);
projectorCamera.position.set(0, 1, 6);
projectorCamera.lookAt(0, 1, 0);

// ProjectorCamera with lens shift (uncomment to simulate real projector optics):
// import { ProjectorCamera } from '../../src/core/ProjectorCamera';
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
gui.collapse();

// ── Camera controls ───────────────────────────────────────────────────────────

const controls = new OrbitControls(projectorCamera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = false;
controls.autoRotate = false;

// Viewer camera visualized in projector scene (orange = where type is projected from)
const viewerCameraHelper = new THREE.CameraHelper(viewerCamera);
viewerCameraHelper.scale.setScalar(0.2);
projectorScene.add(viewerCameraHelper);

const viewerCameraMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.05, 6, 6),
  new THREE.MeshBasicMaterial({ color: 0xff6600 }),
);
viewerCameraMarker.position.copy(viewerCamera.position);
projectorScene.add(viewerCameraMarker);

const viewerDir = new THREE.Vector3(0, 0, -1).applyQuaternion(viewerCamera.quaternion).normalize();
const arrowHelper = new THREE.ArrowHelper(viewerDir, viewerCamera.position, 1, 0xff6600);
projectorScene.add(arrowHelper);

// ── Animation loop ─────────────────────────────────────────────────────────────

let showViewerRT = false;

const viewerRTPreviewMat = new THREE.MeshBasicMaterial({ map: viewerRT.texture });
const viewerRTPreviewScene = new THREE.Scene();
viewerRTPreviewScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), viewerRTPreviewMat));
const viewerRTPreviewCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

function updateViewerRTPreviewCam() {
  const screenAspect = window.innerWidth / window.innerHeight;
  const rtAspect = projectionResolution.x / projectionResolution.y;
  if (screenAspect > rtAspect) {
    const s = screenAspect / rtAspect;
    viewerRTPreviewCam.left = -s;
    viewerRTPreviewCam.right = s;
    viewerRTPreviewCam.top = 1;
    viewerRTPreviewCam.bottom = -1;
  } else {
    const s = rtAspect / screenAspect;
    viewerRTPreviewCam.left = -1;
    viewerRTPreviewCam.right = 1;
    viewerRTPreviewCam.top = s;
    viewerRTPreviewCam.bottom = -s;
  }
  viewerRTPreviewCam.updateProjectionMatrix();
}
updateViewerRTPreviewCam();

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'c') showViewerRT = !showViewerRT;
  if (e.key === 'g' || e.key === 'p') gui.toggle();
  if (e.key === 't') gui.toggleTestCard();
  if (e.key === 'w') gui.toggleWarpUI();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  mapper.resize(window.innerWidth, window.innerHeight);
  updateViewerRTPreviewCam();
});

function animate() {
  requestAnimationFrame(animate);

  controls.update();
  viewerCameraHelper.update();
  viewerCameraMarker.position.copy(viewerCamera.position);

  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(viewerCamera.quaternion).normalize();
  arrowHelper.setDirection(dir);
  arrowHelper.position.copy(viewerCamera.position);

  viewerCamera.updateMatrixWorld();
  viewerMatrixUniform.value.multiplyMatrices(viewerCamera.projectionMatrix, viewerCamera.matrixWorldInverse);

  // Pass 1: Render bergi from viewer's perspective
  renderer.setRenderTarget(viewerRT);
  renderer.render(viewerScene, viewerCamera);

  // Pass 2: Project onto geometry from projector's position
  // (uProjectedTexture is currently typeTexture — swap to viewerRT.texture for live reprojection)
  renderer.setRenderTarget(warpRT);
  renderer.render(projectorScene, projectorCamera);

  // Pass 3: Output — or press C to preview viewerRT
  renderer.setRenderTarget(null);
  if (showViewerRT) {
    renderer.render(viewerRTPreviewScene, viewerRTPreviewCam);
  } else {
    mapper.render();
  }
}

animate();
