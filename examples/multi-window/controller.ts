import * as THREE from 'three';
import { Pane } from 'tweakpane';
import { ProjectionMapper } from '../../src/core/ProjectionMapper';
import { ProjectionMapperGUI, GUI_ANCHOR } from '../../src/core/ProjectionMapperGUI';
import { WindowSync, WINDOW_SYNC_MODE } from '../../src/addons/WindowSync';
import { ProjectionScene } from './ProjectionScene';
import MUTLI_WINDOW_CONFIG from './multi-window.config';
import {
  CameraSettings,
  defaultCameraSettings,
  loadCameraSettings,
  saveCameraSettings,
  CAMERA_SYNC_CHANNEL,
} from './cameraSettings';

const cameraSyncChannel = new BroadcastChannel(CAMERA_SYNC_CHANNEL);

const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio || 1);
document.body.appendChild(renderer.domElement);

const bufferResolution = {
  width: MUTLI_WINDOW_CONFIG.projectionResolution.width * MUTLI_WINDOW_CONFIG.bufferResOversampling,
  height: MUTLI_WINDOW_CONFIG.projectionResolution.height * MUTLI_WINDOW_CONFIG.bufferResOversampling,
};
const projectionScene = new ProjectionScene({ width: bufferResolution.width, height: bufferResolution.height });
const mapper = new ProjectionMapper(renderer, projectionScene.getTexture());
const sync = new WindowSync(mapper, { mode: WINDOW_SYNC_MODE.CONTROLLER });

const gui = new ProjectionMapperGUI(mapper, {
  title: 'Controller',
  anchor: GUI_ANCHOR.LEFT,
  eventChannel: sync.getEventChannel(),
  windowManager: sync.getWindowManager(),
});

// Camera calibration panel
const cameraSettings = loadCameraSettings();

function applySettings(settings: CameraSettings): void {
  projectionScene.setThrowRatio(settings.throwRatio);
  projectionScene.setLensShiftY(settings.lensShiftY);
  projectionScene.setCameraPosition(settings.camX, settings.camY, settings.camZ);
  projectionScene.setCameraRotation(settings.camRotX, settings.camRotY);
  projectionScene.setCubePitch(settings.cubeRotX);
  projectionScene.setCubeYaw(settings.cubeRotY);
}

// Apply loaded settings to the scene
applySettings(cameraSettings);

const cameraPane = new Pane({ title: 'Camera Setup', expanded: false });

const cameraFolder = cameraPane.addFolder({ title: 'Projector' });

const save = () => {
  saveCameraSettings(cameraSettings);
  cameraSyncChannel.postMessage({ ...cameraSettings });
};

cameraFolder.addBinding(cameraSettings, 'throwRatio', { min: 0.8, max: 2.5, step: 0.01, label: 'Throw Ratio' })
  .on('change', () => { projectionScene.setThrowRatio(cameraSettings.throwRatio); save(); });

cameraFolder.addBinding(cameraSettings, 'lensShiftY', { min: 0.0, max: 2.0, step: 0.01, label: 'Lens Shift Y' })
  .on('change', () => { projectionScene.setLensShiftY(cameraSettings.lensShiftY); save(); });

cameraFolder.addBinding(cameraSettings, 'camY', { min: -0.2, max: 0.5, step: 0.01, label: 'Camera Y' })
  .on('change', () => { projectionScene.setCameraPosition(cameraSettings.camX, cameraSettings.camY, cameraSettings.camZ); save(); });

cameraFolder.addBinding(cameraSettings, 'camZ', { min: 0.5, max: 3.0, step: 0.01, label: 'Camera Z' })
  .on('change', () => { projectionScene.setCameraPosition(cameraSettings.camX, cameraSettings.camY, cameraSettings.camZ); save(); });

cameraFolder.addBinding(cameraSettings, 'camRotX', { min: -0.5, max: 0.5, step: 0.01, label: 'Camera Pitch' })
  .on('change', () => { projectionScene.setCameraRotation(cameraSettings.camRotX, cameraSettings.camRotY); save(); });

cameraFolder.addBinding(cameraSettings, 'camRotY', { min: -0.5, max: 0.5, step: 0.01, label: 'Camera Yaw' })
  .on('change', () => { projectionScene.setCameraRotation(cameraSettings.camRotX, cameraSettings.camRotY); save(); });

const cubeFolder = cameraPane.addFolder({ title: 'Cube' });

cubeFolder.addBinding(cameraSettings, 'cubeRotY', { min: -Math.PI, max: Math.PI, step: 0.01, label: 'Yaw' })
  .on('change', () => { projectionScene.setCubeYaw(cameraSettings.cubeRotY); save(); });

cameraPane.addButton({ title: 'Reset to defaults' }).on('click', () => {
  Object.assign(cameraSettings, defaultCameraSettings);
  applySettings(cameraSettings);
  saveCameraSettings(cameraSettings);
  cameraPane.refresh();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'p') gui.toggle();
  if (e.key === 't') gui.toggleTestCard();
  if (e.key === 'h') gui.toggleWarpUI();
  if (e.key === 'o') sync.openProjectorWindow();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  projectionScene.updateCameraAspect(bufferResolution.width / bufferResolution.height);
  mapper.resize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  projectionScene.animate();
  projectionScene.render(renderer);
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
