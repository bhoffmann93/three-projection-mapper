/**
 * Controller Window - Multi-Window Projection Mapping
 *
 * Clean separation of concerns:
 * - ProjectionScene: Manages 3D content (user code)
 * - ProjectionMapper: Manages warping (library code)
 * - WindowSync: Manages multi-window sync (library code)
 */

import * as THREE from 'three';
import { ProjectionMapper } from '../../src/core/ProjectionMapper';
import { ControllerGUI } from '../../src/gui/ControllerGUI';
import { WindowSync } from '../../src/addons/WindowSync';
import { ProjectionScene } from './ProjectionScene';

// Setup renderer
const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Create scene (user code - encapsulated complexity)
const projectionScene = new ProjectionScene({
  width: 1280,
  height: 800,
});

// Setup projection mapper (library code)
const mapper = new ProjectionMapper(renderer, projectionScene.getTexture());

// Add multi-window support (library code)
const sync = new WindowSync(mapper, { mode: 'controller' });

// Create GUI
const gui = new ControllerGUI(
  mapper,
  sync.getEventChannel(),
  sync.getWindowManager(),
  'Controller',
  undefined,
  () => setTimeout(() => sync.reattachDragListener(), 50),
  (visible: boolean) => console.log('[Controller] Projector controls visibility:', visible),
);

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'p') gui.toggle();
  if (e.key === 't') gui.toggleTestCard();
  if (e.key === 'h') gui.toggleWarpUI();
  if (e.key === 'o') sync.openProjectorWindow();
});

// Handle resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  projectionScene.updateCameraAspect(1280 / 800);
  mapper.resize(window.innerWidth, window.innerHeight);
});

// Animation loop - Clean and simple
function animate() {
  requestAnimationFrame(animate);

  // Update scene animation
  projectionScene.animate();

  // Render scene to texture
  projectionScene.render(renderer);

  // Render warped output to screen
  renderer.setRenderTarget(null);
  mapper.render();
}

animate();

console.log('Controller Window Ready');
console.log('Controls:');
console.log('  G/P - Toggle GUI');
console.log('  T - Toggle testcard');
console.log('  H - Toggle warp UI');
console.log('  O - Open projector window');
console.log('  Drag corners/grid points to warp');
