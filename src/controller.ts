/**
 * Controller Window - Refactored with WindowSync addon
 *
 * Shows the new simplified architecture:
 * - User creates renderer and content
 * - ProjectionMapper handles warping
 * - WindowSync addon handles multi-window sync
 */

import * as THREE from 'three';
import { ProjectionMapper } from './ProjectionMapper';
import { ControllerGUI } from './gui/ControllerGUI';
import { WindowSync } from './addons/WindowSync';
import { ContentManager } from '../examples/ContentManager';

// User creates renderer
const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x000000);
document.body.appendChild(renderer.domElement);

// User creates content
const content = new ContentManager();

// User creates render target
const renderTarget = new THREE.WebGLRenderTarget(1280, 800, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  generateMipmaps: false,
});

// ✅ Create ProjectionMapper
const mapper = new ProjectionMapper(renderer, renderTarget.texture);

// ✅ Add WindowSync addon for multi-window support
const sync = new WindowSync(mapper, { mode: 'controller' });

// Shared setting for projector controls visibility
let showProjectorControls = false;

// Create GUI with callbacks
const gui = new ControllerGUI(
  mapper,
  sync.getEventChannel(),
  sync.getWindowManager(),
  'Controller',
  undefined,
  () => {
    // Grid size change callback
    console.log('[CONTROLLER] Grid size changed, re-attaching drag listener');
    setTimeout(() => {
      sync.reattachDragListener();
    }, 50);
  },
  (visible: boolean) => {
    // Projector controls visibility callback
    console.log('[CONTROLLER] Projector controls visibility changed:', visible);
    showProjectorControls = visible;
  }
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
  const width = window.innerWidth;
  const height = window.innerHeight;

  renderer.setSize(width, height);
  content.resize();
  mapper.resize(width, height);
});

// Standard Three.js animation loop
function animate() {
  requestAnimationFrame(animate);

  // Update content
  content.update();

  // Render scene to texture
  content.render(renderer, renderTarget);

  // Render warped output to screen
  renderer.setRenderTarget(null);
  mapper.render();
}

animate();

console.log('Controller ready (Refactored with WindowSync)');
console.log('Keyboard shortcuts:');
console.log('  G/P - Toggle GUI');
console.log('  T - Toggle testcard');
console.log('  H - Hide/show controls');
console.log('  O - Open projector window');
