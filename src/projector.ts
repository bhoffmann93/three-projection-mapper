/**
 * Projector Window - Receives Warp Settings from Controller
 *
 * This shows the projector setup:
 * 1. Create the SAME scene as controller (identical code)
 * 2. Add WindowSync addon in projector mode
 * 3. Warp settings are received automatically from controller
 * 4. Both windows render the same content independently
 */

import * as THREE from 'three';
import { ProjectionMapper } from './ProjectionMapper';
import { WindowSync } from './addons/WindowSync';

// Hide cursor for clean projection
document.body.style.cursor = 'none';

// ===== 1. Setup Renderer (Fixed 1280x800 for projector) =====
const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(1280, 800);
renderer.setPixelRatio(1); // Fixed 1:1 for projector
document.body.appendChild(renderer.domElement);

// ===== 2. Create Your Scene (SAME as controller) =====
const scene = new THREE.Scene();

// Camera (using projector specs for Acer X1383WH)
const aspect = 1280 / 800;
const throwRatio = 1.65;
const fovV = 2 * Math.atan(Math.tan(Math.atan(1 / (2 * throwRatio))) / aspect);
const camera = new THREE.PerspectiveCamera(fovV * (180 / Math.PI), aspect, 0.1, 1000);
camera.position.set(0, 0.05, 1.5);
camera.updateProjectionMatrix();

// Apply lens shift for projector (Acer has 100% vertical offset)
camera.projectionMatrix.elements[9] = 1.0;

// Add a cube (SAME as controller)
const cubeSize = 0.2;
const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
cubeGeometry.translate(0, -cubeSize / 2, 0); // Pivot at bottom
const cube = new THREE.Mesh(cubeGeometry, new THREE.MeshNormalMaterial());
cube.position.set(0, 0.17, 0);
cube.rotation.set(Math.PI, Math.PI * 0.25, 0);
scene.add(cube);

// Add lights (SAME as controller)
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 1, 1);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

// Add floor grid (SAME as controller)
const grid = new THREE.GridHelper(2.0, 20, 0xff0000, 0xffffff);
scene.add(grid);

// ===== 3. Create Render Target =====
const renderTarget = new THREE.WebGLRenderTarget(1280, 800, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  generateMipmaps: false,
});

// ===== 4. Create Projection Mapper =====
const mapper = new ProjectionMapper(renderer, renderTarget.texture);

// ===== 5. Add Multi-Window Support (Projector Mode) =====
const sync = new WindowSync(mapper, { mode: 'projector' });

// Disable controls and fix zoom for projector output
mapper.setControlsVisible(false);
mapper.setPlaneScale(1.0);

// ===== 6. Animation Loop (SAME as controller) =====
function animate() {
  requestAnimationFrame(animate);

  // Animate your content (SAME as controller)
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;

  // Render scene to texture
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  // Reapply lens shift (needed after every render)
  camera.projectionMatrix.elements[9] = 1.0;

  // Render warped output to screen
  renderer.setRenderTarget(null);
  mapper.render();
}

animate();

console.log('Projector Window Ready');
console.log('Waiting for controller connection...');
