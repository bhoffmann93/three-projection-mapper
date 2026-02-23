/**
 * Projector Window - Receives Warp Settings from Controller
 *
 * This shows the projector setup:
 * 1. Create the SAME scene as controller using shared.ts (DRY!)
 * 2. Add WindowSync addon in projector mode
 * 3. Warp settings are received automatically from controller
 * 4. Both windows render the same content independently
 * 5. Drag controls are DISABLED (projector is receive-only)
 */

import * as THREE from 'three';
import { ProjectionMapper } from '../../src/ProjectionMapper';
import { WindowSync } from '../../src/addons/WindowSync';
import { createProjectionScene, animateScene, renderScene } from './shared';

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

// ===== 2. Create Scene Using Shared Code (SAME as controller!) =====
const sceneData = createProjectionScene();

// ===== 3. Create Projection Mapper =====
const mapper = new ProjectionMapper(renderer, sceneData.renderTarget.texture);

// ===== 4. Add Multi-Window Support (Projector Mode) =====
const sync = new WindowSync(mapper, { mode: 'projector' });

// ===== 5. Projector Configuration =====
// Hide controls and fix zoom for projector output
mapper.setControlsVisible(false);
mapper.setPlaneScale(1.0);

// CRITICAL: Disable drag controls completely (projector is receive-only)
mapper.getWarper().setDragEnabled(false);

// ===== 6. Animation Loop (SAME as controller!) =====
function animate() {
  requestAnimationFrame(animate);

  // Animate using shared function (SAME as controller!)
  animateScene(sceneData);

  // Render using shared function (SAME as controller!)
  renderScene(renderer, sceneData);

  // Render warped output to screen
  renderer.setRenderTarget(null);
  mapper.render();
}

animate();

console.log('Projector Window Ready');
console.log('Waiting for controller connection...');
