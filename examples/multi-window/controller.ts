import * as THREE from 'three';
import { ProjectionMapper, ProjectionMapperGUI } from '../../src/lib';
import { WindowSync, WINDOW_SYNC_MODE } from '../../src/addons';
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
  anchor: 'left',
  eventChannel: sync.getEventChannel(),
  windowManager: sync.getWindowManager(),
});

const hint = document.createElement('div');
hint.style.cssText = 'position:fixed;bottom:36px;left:16px;color:rgba(255,255,255,0.5);font:12px/1.6 monospace;pointer-events:none;transition:opacity 0.3s';
hint.innerHTML = '<span>G</span> toggle UI<br><span>T</span> test card<br><span>W</span> warp controls<br><span>O</span> open projector';
document.body.appendChild(hint);

let uiVisible = true;
window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'p') { gui.toggle(); uiVisible = !uiVisible; hint.style.opacity = uiVisible ? '1' : '0'; }
  if (e.key === 't') gui.toggleTestCard();
  if (e.key === 'w') gui.toggleWarpUI();
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
console.log('  W - Toggle warp UI');
console.log('  O - Open projector window');
console.log('  Drag corners/grid points to warp');
