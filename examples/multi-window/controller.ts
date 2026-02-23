import * as THREE from 'three';
import { ProjectionMapper } from '../../src/core/ProjectionMapper';
import { ControllerGUI } from '../../src/gui/ControllerGUI';
import { WindowSync } from '../../src/addons/WindowSync';
import { ProjectionScene } from './ProjectionScene';

const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const projectionScene = new ProjectionScene({ width: 1280, height: 800 });
const mapper = new ProjectionMapper(renderer, projectionScene.getTexture());
const sync = new WindowSync(mapper, { mode: 'controller' });

const gui = new ControllerGUI(
  mapper,
  sync.getEventChannel(),
  sync.getWindowManager(),
  'Controller',
  undefined,
  () => setTimeout(() => sync.reattachDragListener(), 50),
  (visible: boolean) => console.log('[Controller] Projector controls visibility:', visible),
);

window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'p') gui.toggle();
  if (e.key === 't') gui.toggleTestCard();
  if (e.key === 'h') gui.toggleWarpUI();
  if (e.key === 'o') sync.openProjectorWindow();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  projectionScene.updateCameraAspect(1280 / 800);
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
