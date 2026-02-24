import * as THREE from 'three';
import { ProjectionMapper } from '../../src/core/ProjectionMapper';
import { WindowSync, WINDOW_SYNC_MODE } from '../../src/addons/WindowSync';
import { ProjectionScene } from './ProjectionScene';
import MUTLI_WINDOW_CONFIG from './multi-window.config';
import { loadCameraSettings, CAMERA_SYNC_CHANNEL, CameraSettings } from './cameraSettings';

document.body.style.cursor = 'none';

const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
const projectionResolution = MUTLI_WINDOW_CONFIG.projectionResolution;
renderer.setSize(projectionResolution.width, projectionResolution.height);
renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);

const bufferResolution = {
  width: projectionResolution.width * MUTLI_WINDOW_CONFIG.bufferResOversampling,
  height: projectionResolution.height * MUTLI_WINDOW_CONFIG.bufferResOversampling,
};
const projectionScene = new ProjectionScene({ width: bufferResolution.width, height: bufferResolution.height });
const mapper = new ProjectionMapper(renderer, projectionScene.getTexture());
const sync = new WindowSync(mapper, { mode: WINDOW_SYNC_MODE.PROJECTOR });

function applySettings(s: CameraSettings): void {
  projectionScene.setThrowRatio(s.throwRatio);
  projectionScene.setLensShiftY(s.lensShiftY);
  projectionScene.setCameraPosition(s.camX, s.camY, s.camZ);
  projectionScene.setCameraRotation(s.camRotX, s.camRotY);
  projectionScene.setCubePitch(s.cubeRotX);
  projectionScene.setCubeYaw(s.cubeRotY);
}

// Apply persisted settings on startup
applySettings(loadCameraSettings());

// Apply live updates from controller
const cameraSyncChannel = new BroadcastChannel(CAMERA_SYNC_CHANNEL);
cameraSyncChannel.onmessage = (e: MessageEvent<CameraSettings>) => applySettings(e.data);

function animate() {
  requestAnimationFrame(animate);
  projectionScene.animate();
  projectionScene.render(renderer);
  renderer.setRenderTarget(null);
  mapper.render();
}

animate();

console.log('Projector Window Ready');
console.log('Waiting for controller connection...');
