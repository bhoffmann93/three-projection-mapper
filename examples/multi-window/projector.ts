import * as THREE from 'three';
import { ProjectionMapper } from '../../src/core/ProjectionMapper';
import { WindowSync, WINDOW_SYNC_MODE } from '../../src/addons/WindowSync';
import { ProjectionScene } from './ProjectionScene';
import MUTLI_WINDOW_CONFIG from './multi-window.config';

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

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  projectionScene.animate(clock.getElapsedTime());
  projectionScene.render(renderer);
  renderer.setRenderTarget(null);
  mapper.render();
}

animate();

console.log('Projector Window Ready');
console.log('Waiting for controller connection...');
