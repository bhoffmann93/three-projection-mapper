/**
 * Example usage of ProjectionMapper - Simplified API
 *
 * This example shows the new simplified architecture:
 * 1. User creates their own Three.js scene
 * 2. ProjectionMapper handles only warping
 * 3. No callback inversion - standard Three.js render pattern
 */

import * as THREE from 'three';
import { ProjectionMapper } from './ProjectionMapper';
import { ProjectionMapperGUI, GUI_ANCHOR } from './ProjectionMapperGUI';
import { ContentManager } from '../examples/ContentManager';

// User creates renderer (library doesn't create it anymore)
const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x000000);
document.body.appendChild(renderer.domElement);

// User creates content (example code - replace with your own scene)
const content = new ContentManager();

// User creates render target for projection
const renderTarget = new THREE.WebGLRenderTarget(1280, 800, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  generateMipmaps: false,
});

// ✅ Simple library usage - just pass renderer and texture
const mapper = new ProjectionMapper(renderer, renderTarget.texture);

// Optional: Add GUI
const gui = new ProjectionMapperGUI(mapper, 'Projection Mapper', GUI_ANCHOR.LEFT);

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'p') gui.toggle();
  if (e.key === 't') gui.toggleTestCard();
  if (e.key === 'h') gui.toggleWarpUI();
});

// Handle resize
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  renderer.setSize(width, height);
  content.resize();
  mapper.resize(width, height);
});

// Standard Three.js animation loop - no callbacks!
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

console.log('ProjectionMapper Example (Simplified API)');
console.log('Controls:');
console.log('  G/P - Toggle GUI');
console.log('  T - Toggle testcard');
console.log('  H - Hide all controls');
console.log('  Drag corners/grid points to adjust projection');
