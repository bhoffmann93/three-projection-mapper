/**
 * Simple Example - Single Window Projection Mapping
 *
 * This shows the basic usage:
 * 1. Create your Three.js scene (cube, camera, lights)
 * 2. Render it to a texture
 * 3. ProjectionMapper warps the texture
 */

import * as THREE from 'three';
import { ProjectionMapper } from '../../src/core/ProjectionMapper';
import { ProjectionMapperGUI, GUI_ANCHOR } from '../../src/core/ProjectionMapperGUI';

// ===== 1. Setup Renderer =====
const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// ===== 2. Create Your Scene =====
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

// Add a cube
const cubeSize = 0.2;
const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
cubeGeometry.translate(0, -cubeSize / 2, 0); // Pivot at bottom
const cube = new THREE.Mesh(cubeGeometry, new THREE.MeshNormalMaterial());
cube.position.set(0, 0.17, 0);
cube.rotation.set(Math.PI, Math.PI * 0.25, 0);
scene.add(cube);

// Add lights
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 1, 1);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

// Add floor grid
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

// ===== 5. Optional GUI =====
const gui = new ProjectionMapperGUI(mapper, 'Projection Mapper', GUI_ANCHOR.LEFT);

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'p') gui.toggle();
  if (e.key === 't') gui.toggleTestCard();
  if (e.key === 'h') gui.toggleWarpUI();
});

// Handle resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = 1280 / 800;
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[9] = 1.0;
  mapper.resize(window.innerWidth, window.innerHeight);
});

// ===== 6. Animation Loop =====
function animate() {
  requestAnimationFrame(animate);

  // Animate your content
  // cube.rotation.x += 0.01;
  // cube.rotation.y += 0.01;

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

console.log('ProjectionMapper Example');
console.log('Controls:');
console.log('  G/P - Toggle GUI');
console.log('  T - Toggle testcard');
console.log('  H - Toggle warp UI');
console.log('  Drag corners/grid points to warp');
