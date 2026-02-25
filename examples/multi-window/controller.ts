import * as THREE from 'three';
import { ProjectionMapper } from '../../src/core/ProjectionMapper';
import { ProjectionMapperGUI, GUI_ANCHOR } from '../../src/core/ProjectionMapperGUI';
import { WindowSync, WINDOW_SYNC_MODE } from '../../src/addons/WindowSync';
import { ProjectionScene } from './ProjectionScene';
import MUTLI_WINDOW_CONFIG from './multi-window.config';

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

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  projectionScene.animate(clock.getElapsedTime());
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
