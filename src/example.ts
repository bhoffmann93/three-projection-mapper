/**
 * Example usage of ProjectionMapper
 *
 * This demonstrates how to integrate the projection mapping library
 * into an existing Three.js project.
 */

import * as THREE from 'three';
import { ProjectionMapper } from './ProjectionMapper';
import { ProjectionMapperGUI } from './ProjectionMapperGUI';

// Create renderer
const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x000000);
document.body.appendChild(renderer.domElement);

// World units use aspect ratio, pixel resolution only for textures/renderer
const projectionResolution = { width: 1920, height: 1080 };
const aspect = projectionResolution.width / projectionResolution.height;
const planeSize = { width: 16, height: 16 / aspect }; // 16 x 9 world units

// Create a render target at full pixel resolution
const renderTarget = new THREE.WebGLRenderTarget(projectionResolution.width, projectionResolution.height);

// Your custom scene and camera (what you want to project)
const contentScene = new THREE.Scene();
const contentCamera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
contentCamera.position.z = 5;

// Add some content to your scene (example: rotating cube)
const geometry = new THREE.BoxGeometry(2, 2, 2);
const material = new THREE.MeshNormalMaterial();
const cube = new THREE.Mesh(geometry, material);
contentScene.add(cube);

// Add a light (optional, for materials that need it)
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 1, 1);
contentScene.add(light);
contentScene.add(new THREE.AmbientLight(0x404040));

// Create the projection mapper with aspect-ratio-based world units
const mapper = new ProjectionMapper(renderer, renderTarget.texture, {
  width: planeSize.width,
  height: planeSize.height,
  gridControlPoints: { x: 5, y: 5 },
});

// Optional: Add GUI for easy calibration
const gui = new ProjectionMapperGUI(mapper);

// Handle keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'p') {
    gui.toggle();
  }
  if (e.key === 't') {
    mapper.setShowTestCard(!mapper.isShowingTestCard());
  }
  if (e.key === 'h') {
    mapper.setControlsVisible(false);
  }
  if (e.key === 's') {
    mapper.setControlsVisible(true);
  }
});

// Handle resize - render target stays at fixed projection resolution
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  renderer.setSize(width, height);

  contentCamera.aspect = aspect;
  contentCamera.updateProjectionMatrix();

  mapper.resize(width, height);
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Animate your content
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;

  // Render your content to the render target
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
