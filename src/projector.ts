/**
 * Projector Window - Refactored with WindowSync addon
 *
 * Shows the new simplified architecture:
 * - User creates renderer and content
 * - ProjectionMapper handles warping
 * - WindowSync addon handles receiving state from controller
 */

import * as THREE from 'three';
import { ProjectionMapper } from './ProjectionMapper';
import { WindowSync } from './addons/WindowSync';
import { ContentManager } from '../examples/ContentManager';

// Hide cursor for clean projection
document.body.style.cursor = 'none';

// User creates renderer (fixed 1280x800 for projector)
const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(1280, 800);
renderer.setPixelRatio(1); // Fixed 1:1 for projector
renderer.setClearColor(0x000000);
document.body.appendChild(renderer.domElement);

// User creates content (same as controller)
const content = new ContentManager();

// User creates render target
const renderTarget = new THREE.WebGLRenderTarget(1280, 800, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  generateMipmaps: false,
});

// ✅ Create ProjectionMapper
const mapper = new ProjectionMapper(renderer, renderTarget.texture);

// ✅ Add WindowSync addon in projector mode
const sync = new WindowSync(mapper, { mode: 'projector' });

// Disable controls and fix zoom for projector
mapper.setControlsVisible(false);
mapper.setPlaneScale(1.0);

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

  // Update content (same animation as controller)
  content.update();

  // Render scene to texture
  content.render(renderer, renderTarget);

  // Render warped output to screen
  renderer.setRenderTarget(null);
  mapper.render();
}

animate();

console.log('Projector window ready (Refactored with WindowSync)');
console.log('Waiting for controller connection...');
