/**
 * Projector Window - Pure 1280x800 output for physical projector
 * Receives state from controller via BroadcastChannel
 */

import { ProjectionLibrary } from './ProjectionLibrary';
import { ProjectionEventType } from './ipc/EventTypes';
import { FullProjectionState, NormalizedPoint } from './ipc/EventPayloads';
import { ContentManager } from './content/ContentManager';
import * as THREE from 'three';

// Hide cursor for clean projection
document.body.style.cursor = 'none';

// Create content using single ContentManager class
const content = new ContentManager();

// Create library instance (projector mode)
const library = new ProjectionLibrary({ mode: 'projector' });
library.start();

// Set projector to fixed resolution
library.getRenderer().setSize(1280, 800);
library.getRenderer().setPixelRatio(1); // Fixed 1:1 for projector

const mapper = library.getMapper();
const eventChannel = library.getEventChannel();

// Disable controls for projector window
mapper.setControlsVisible(false);

// CRITICAL: Fix projector zoom at fullscreen (1.0) regardless of controller zoom
mapper.setPlaneScale(1.0);

// Wait for initial state before rendering
let hasReceivedInitialState = false;

// Helper to denormalize points
function denormalizePoint(normalized: NormalizedPoint, width: number, height: number): THREE.Vector3 {
  return new THREE.Vector3(normalized.x * width - width / 2, normalized.y * height - height / 2, normalized.z);
}

// Apply full state from controller
function applyFullState(state: FullProjectionState): void {
  const warper = mapper.getWarper();

  // Get current plane dimensions
  const config = (warper as any).config;
  const width = config.width;
  const height = config.height;

  // 1. Apply grid size FIRST (critical for proper point count)
  if (state.gridSize.x !== warper.getGridSizeX() || state.gridSize.y !== warper.getGridSizeY()) {
    warper.setGridSize(state.gridSize.x, state.gridSize.y);
  }

  // 2. Apply corner points
  const cornerPoints = warper.getCornerControlPoints();
  state.cornerPoints.forEach((normalized, i) => {
    const denormalized = denormalizePoint(normalized, width, height);
    cornerPoints[i].copy(denormalized);
  });

  // 3. Apply grid points
  const gridPoints = warper.getGridControlPoints();
  state.gridPoints.forEach((normalized, i) => {
    if (i < gridPoints.length) {
      const denormalized = denormalizePoint(normalized, width, height);
      gridPoints[i].copy(denormalized);
    }
  });

  // 4. Apply reference grid points (internal to warper)
  const referenceGridPoints = (warper as any).referenceGridControlPoints;
  state.referenceGridPoints.forEach((normalized, i) => {
    if (i < referenceGridPoints.length) {
      const denormalized = denormalizePoint(normalized, width, height);
      referenceGridPoints[i].copy(denormalized);
    }
  });

  // 5. Apply warp settings
  warper.setWarpMode(state.warpMode);
  warper.setShouldWarp(state.shouldWarp);

  // 6. Apply visual settings
  mapper.setShowTestCard(state.showTestcard);
  // NOTE: Keep controls and control lines hidden on projector output
  mapper.setShowControlLines(false);
  mapper.setControlsVisible(false);

  // 7. Apply camera offset (zoom is fixed at 1.0 for projector)
  mapper.setCameraOffset(state.cameraOffset.x, state.cameraOffset.y);

  // Update mesh
  (warper as any).updateLine();

  // CRITICAL: Force shader uniform update
  const material = (warper as any).material;
  material.uniforms.uControlPoints.value = [...warper.getGridControlPoints()];

  hasReceivedInitialState = true;

  // Hide loading message
  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    loadingEl.classList.add('hidden');
  }

  console.log('Applied full state from controller');
}

// Event handlers
eventChannel.on(ProjectionEventType.FULL_STATE_SYNC, ({ state }) => {
  applyFullState(state);
});

eventChannel.on(ProjectionEventType.CORNER_POINTS_UPDATED, ({ points }) => {
  console.log('[PROJECTOR] Received CORNER_POINTS_UPDATED');

  const warper = mapper.getWarper();
  const config = (warper as any).config;
  const cornerPoints = warper.getCornerControlPoints();

  points.forEach((normalized, i) => {
    const denormalized = denormalizePoint(normalized, config.width, config.height);
    cornerPoints[i].set(denormalized.x, denormalized.y, denormalized.z);
  });

  (warper as any).updateLine();
  console.log('[PROJECTOR] Updated corner points');
});

eventChannel.on(ProjectionEventType.GRID_POINTS_UPDATED, ({ points, referencePoints }) => {
  console.log('[PROJECTOR] Received GRID_POINTS_UPDATED', points.length, 'points');

  const warper = mapper.getWarper();
  const config = (warper as any).config;
  const gridPoints = warper.getGridControlPoints();
  const referenceGridPoints = (warper as any).referenceGridControlPoints;

  points.forEach((normalized, i) => {
    if (i < gridPoints.length) {
      const denormalized = denormalizePoint(normalized, config.width, config.height);
      gridPoints[i].set(denormalized.x, denormalized.y, denormalized.z);
    }
  });

  referencePoints.forEach((normalized, i) => {
    if (i < referenceGridPoints.length) {
      const denormalized = denormalizePoint(normalized, config.width, config.height);
      referenceGridPoints[i].set(denormalized.x, denormalized.y, denormalized.z);
    }
  });

  (warper as any).updateLine();
  console.log('[PROJECTOR] Updated grid points, first point:', gridPoints[0]);
});

eventChannel.on(ProjectionEventType.GRID_SIZE_CHANGED, ({ gridSize }) => {
  console.log('[PROJECTOR] Received GRID_SIZE_CHANGED:', gridSize);
  mapper.setGridSize(gridSize.x, gridSize.y);
  // Note: setGridSize already updates material internally
});

eventChannel.on(ProjectionEventType.WARP_MODE_CHANGED, ({ mode }) => {
  mapper.getWarper().setWarpMode(mode);
});

eventChannel.on(ProjectionEventType.SHOULD_WARP_CHANGED, ({ shouldWarp }) => {
  mapper.setShouldWarp(shouldWarp);
});

eventChannel.on(ProjectionEventType.TESTCARD_TOGGLED, ({ show }) => {
  mapper.setShowTestCard(show);
});

// NOTE: Controls and control lines always hidden on projector output
// eventChannel.on(ProjectionEventType.CONTROL_LINES_TOGGLED, ({ show }) => {
//   mapper.setShowControlLines(show);
// });

// eventChannel.on(ProjectionEventType.CONTROLS_VISIBILITY_CHANGED, ({ visible }) => {
//   mapper.setControlsVisible(visible);
// });

eventChannel.on(ProjectionEventType.CAMERA_OFFSET_CHANGED, ({ offset }) => {
  mapper.setCameraOffset(offset.x, offset.y);
});

// NOTE: PLANE_SCALE_CHANGED not handled - projector zoom is fixed at 1.0

eventChannel.on(ProjectionEventType.RESET_WARP, () => {
  mapper.reset();
  setTimeout(() => {
    window.location.reload();
  }, 100);
});

// Request full state from controller on startup
eventChannel.emit(ProjectionEventType.PROJECTOR_READY, {});
eventChannel.emit(ProjectionEventType.REQUEST_FULL_STATE, {});

// Handle resize (maintain aspect ratio)
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  library.getRenderer().setSize(width, height);
  content.resize();
  mapper.resize(width, height);
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Only render after receiving initial state from controller
  if (!hasReceivedInitialState) {
    return;
  }

  // Update content
  content.update();

  // Render via library
  library.render((renderer, renderTarget) => {
    content.render(renderer, renderTarget);
  });
}

animate();

console.log('Projector window ready - waiting for controller state');
