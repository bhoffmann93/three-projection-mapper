/**
 * Controller Window - Multi-Window Projection Mapping
 *
 * This shows the multi-window setup:
 * 1. Create your Three.js scene using shared.ts (DRY!)
 * 2. Add WindowSync addon for multi-window support
 * 3. Open projector window with 'O' key
 * 4. Warp settings sync automatically
 */

import * as THREE from 'three';
import { ProjectionMapper } from '../../src/ProjectionMapper';
import { ControllerGUI } from '../../src/gui/ControllerGUI';
import { WindowSync } from '../../src/addons/WindowSync';
import { createProjectionScene, animateScene, renderScene } from './shared';

// ===== 1. Setup Renderer =====
const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// ===== 2. Create Scene Using Shared Code (DRY!) =====
const sceneData = createProjectionScene();

// ===== 3. Create Projection Mapper =====
const mapper = new ProjectionMapper(renderer, sceneData.renderTarget.texture);

// ===== 4. Add Multi-Window Support =====
const sync = new WindowSync(mapper, { mode: 'controller' });

// ===== 5. Create GUI =====
const gui = new ControllerGUI(
  mapper,
  sync.getEventChannel(),
  sync.getWindowManager(),
  'Controller',
  undefined,
  () => {
    // Grid size change callback - re-attach drag listener
    setTimeout(() => {
      sync.reattachDragListener();
    }, 50);
  },
  (visible: boolean) => {
    // Projector controls visibility callback
    console.log('[Controller] Projector controls visibility:', visible);
  },
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
  sceneData.camera.aspect = 1280 / 800;
  sceneData.camera.updateProjectionMatrix();
  sceneData.camera.projectionMatrix.elements[9] = sceneData.lensShiftY;
  mapper.resize(window.innerWidth, window.innerHeight);
});

// ===== 6. Animation Loop =====
function animate() {
  requestAnimationFrame(animate);

  // Animate using shared function (DRY!)
  animateScene(sceneData);

  // Render using shared function (DRY!)
  renderScene(renderer, sceneData);

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
