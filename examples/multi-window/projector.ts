/**
 * Projector Window - Receives Warp Settings from Controller
 *
 * Clean separation of concerns:
 * - ProjectionScene: Manages 3D content (SAME as controller)
 * - ProjectionMapper: Manages warping (library code)
 * - WindowSync: Receives sync updates (library code)
 *
 * Key: Drag controls disabled - projector is receive-only
 */

import * as THREE from 'three';
import { ProjectionMapper } from '../../src/core/ProjectionMapper';
import { WindowSync } from '../../src/addons/WindowSync';
import { ProjectionScene } from './ProjectionScene';

// Hide cursor for clean projection
document.body.style.cursor = 'none';

// Setup renderer (fixed 1280x800 for projector)
const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(1280, 800);
renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);

// Create scene (SAME class as controller - ensures identical rendering)
const projectionScene = new ProjectionScene({
  width: 1280,
  height: 800,
});

// Setup projection mapper (library code)
const mapper = new ProjectionMapper(renderer, projectionScene.getTexture());

// Add multi-window support in projector mode (library code)
const sync = new WindowSync(mapper, { mode: 'projector' });

// Projector configuration: receive-only, no interaction
mapper.setControlsVisible(false);
mapper.setPlaneScale(1.0);
mapper.getWarper().setDragEnabled(false); // CRITICAL: Disable drag controls

// Animation loop - Clean and simple
function animate() {
  requestAnimationFrame(animate);

  // Update scene animation (SAME as controller)
  projectionScene.animate();

  // Render scene to texture (SAME as controller)
  projectionScene.render(renderer);

  // Render warped output to screen
  renderer.setRenderTarget(null);
  mapper.render();
}

animate();

console.log('Projector Window Ready');
console.log('Waiting for controller connection...');
