/**
 * Example usage of ProjectionMapper
 *
 * This demonstrates how to integrate the projection mapping library
 * into an existing Three.js project.
 */

import * as THREE from 'three';
import { ProjectionMapper } from './ProjectionMapper';
import { ProjectionMapperGUI, GUI_ANCHOR as PROJECTION_GUI_POSITION } from './ProjectionMapperGUI';

// Create renderer
const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x000000);
document.body.appendChild(renderer.domElement);

// Projection resolution in pixels - the library normalizes to small world units internally
const projectionResolution = { width: 1920, height: 1080 };

const renderTarget = new THREE.WebGLRenderTarget(projectionResolution.width, projectionResolution.height, {
  magFilter: THREE.LinearFilter,
  minFilter: THREE.LinearFilter,
  generateMipmaps: false,
});

// Your custom scene and camera (what you want to project)
const contentScene = new THREE.Scene();
const contentCamera = new THREE.PerspectiveCamera(
  75,
  projectionResolution.width / projectionResolution.height,
  0.1,
  1000,
);
contentCamera.position.z = 5;

const geometry = new THREE.BoxGeometry(2, 2, 2);
const material = new THREE.MeshNormalMaterial();
const cube = new THREE.Mesh(geometry, material);
contentScene.add(cube);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 1, 1);
contentScene.add(light);
contentScene.add(new THREE.AmbientLight(0x404040));

const mapper = new ProjectionMapper(renderer, renderTarget.texture);

const gui = new ProjectionMapperGUI(mapper, 'Projection Mapper', PROJECTION_GUI_POSITION.LEFT);
window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'p') gui.toggle();
  if (e.key === 't') gui.toggleTestCard();
  if (e.key === 'h') {
    gui.toggleWarpUI();
  }
});

// Handle resize - render target stays at fixed projection resolution
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  renderer.setSize(width, height);

  contentCamera.aspect = projectionResolution.width / projectionResolution.height;
  contentCamera.updateProjectionMatrix();

  mapper.resize(width, height);
});

function animate() {
  requestAnimationFrame(animate);

  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;

  // Render content to  render target
  renderer.setRenderTarget(renderTarget);
  renderer.render(contentScene, contentCamera);

  // Render the projection mapped output to the screen
  mapper.render();
}

animate();

console.log('ProjectionMapper Example');
console.log('Controls:');
console.log('  G/P - Toggle GUI');
console.log('  T - Toggle testcard');
console.log('  H - Hide all controls');
console.log('  S - Show all controls');
console.log('  Drag corners/grid points to adjust projection');
