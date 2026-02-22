/**
 * Controller Window - Interactive calibration UI with infinite workspace
 * Broadcasts state changes to projector via BroadcastChannel
 */

import { ProjectionLibrary } from './ProjectionLibrary';
import { ControllerGUI } from './gui/ControllerGUI';
import { ProjectionEventType } from './ipc/EventTypes';
import { FullProjectionState, NormalizedPoint } from './ipc/EventPayloads';
import { ContentManager } from './content/ContentManager';
import * as THREE from 'three';

// Create content using single ContentManager class
const content = new ContentManager();

// Create library instance (controller mode)
const library = new ProjectionLibrary({ mode: 'controller' });
library.start();

const mapper = library.getMapper();
const eventChannel = library.getEventChannel();
const windowManager = library.getWindowManager();

// Helper to normalize points
function normalizePoint(point: THREE.Vector3, width: number, height: number): NormalizedPoint {
  return {
    x: (point.x + width / 2) / width,
    y: (point.y + height / 2) / height,
    z: point.z,
  };
}

// Get full state for synchronization
function getFullState(): FullProjectionState {
  const warper = mapper.getWarper();
  const config = (warper as any).config;

  const cornerPoints = warper.getCornerControlPoints();
  const gridPoints = warper.getGridControlPoints();
  const referenceGridPoints = (warper as any).referenceGridControlPoints;

  return {
    cornerPoints: cornerPoints.map(p => normalizePoint(p, config.width, config.height)),
    gridPoints: gridPoints.map(p => normalizePoint(p, config.width, config.height)),
    referenceGridPoints: referenceGridPoints.map(p => normalizePoint(p, config.width, config.height)),
    gridSize: {
      x: warper.getGridSizeX(),
      y: warper.getGridSizeY(),
    },
    warpMode: warper.getWarpMode(),
    shouldWarp: warper.getShouldWarp(),
    showTestcard: mapper.isShowingTestCard(),
    showControlLines: mapper.isShowingControlLines(),
    showControls: true, // Always show controls in controller
    cameraOffset: mapper.getCameraOffset(),
    // NOTE: planeScale not synchronized - projector uses fixed 1.0, controller manages locally
  };
}

// Function to attach drag event listener
function attachDragListener() {
  const warper = mapper.getWarper();
  const dragControls = (warper as any).dragControls;

  dragControls.addEventListener('drag', () => {
    const config = (warper as any).config;
    const cornerPoints = warper.getCornerControlPoints();
    const gridPoints = warper.getGridControlPoints();
    const referenceGridPoints = (warper as any).referenceGridControlPoints;

    console.log('[CONTROLLER] Broadcasting points update, grid points:', gridPoints.length);

    // Broadcast corner points
    eventChannel.emit(ProjectionEventType.CORNER_POINTS_UPDATED, {
      points: cornerPoints.map(p => normalizePoint(p, config.width, config.height)),
    });

    // Broadcast grid points
    eventChannel.emit(ProjectionEventType.GRID_POINTS_UPDATED, {
      points: gridPoints.map(p => normalizePoint(p, config.width, config.height)),
      referencePoints: referenceGridPoints.map(p => normalizePoint(p, config.width, config.height)),
    });
  });
}

// Attach initial drag listener
attachDragListener();

// Handle projector ready event
eventChannel.on(ProjectionEventType.PROJECTOR_READY, () => {
  updateConnectionStatus(true);
});

eventChannel.on(ProjectionEventType.REQUEST_FULL_STATE, () => {
  eventChannel.emit(ProjectionEventType.FULL_STATE_SYNC, {
    state: getFullState(),
  });
});

// Update connection status UI
function updateConnectionStatus(connected: boolean) {
  const statusElement = document.getElementById('connection-status')!;
  statusElement.textContent = connected ? 'Connected' : 'Disconnected';
  statusElement.className = connected ? 'connected' : 'disconnected';
}

// Window manager callbacks
windowManager.onProjectorClose(() => {
  updateConnectionStatus(false);
});

// Create GUI with event channel and grid size change callback
const gui = new ControllerGUI(
  mapper,
  eventChannel,
  windowManager,
  'Controller',
  undefined, // Use default anchor (LEFT)
  () => {
    console.log('[CONTROLLER] Grid size changed, re-attaching drag listener');
    // Wait for drag controls to be recreated by setGridSize
    setTimeout(() => {
      attachDragListener();
    }, 50);
  }
);

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'p') gui.toggle();
  if (e.key === 't') gui.toggleTestCard();
  if (e.key === 'h') gui.toggleWarpUI();
  if (e.key === 'o') windowManager.openProjectorWindow();
});

// Handle resize
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

  // Update content
  content.update();

  // Render via library
  library.render((renderer, renderTarget) => {
    content.render(renderer, renderTarget);
  });
}

animate();

// Announce controller ready
eventChannel.emit(ProjectionEventType.CONTROLLER_READY, {});

console.log('Controller ready');
console.log('Keyboard shortcuts:');
console.log('  G/P - Toggle GUI');
console.log('  T - Toggle testcard');
console.log('  H - Hide/show controls');
console.log('  O - Open projector window');
