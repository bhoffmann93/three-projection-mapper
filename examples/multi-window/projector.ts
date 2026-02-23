import * as THREE from 'three';
import { ProjectionMapper } from '../../src/core/ProjectionMapper';
import { WindowSync } from '../../src/addons/WindowSync';
import { ProjectionScene } from './ProjectionScene';

document.body.style.cursor = 'none';

const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(1280, 800);
renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);

const projectionScene = new ProjectionScene({ width: 1280, height: 800 });
const mapper = new ProjectionMapper(renderer, projectionScene.getTexture());
const sync = new WindowSync(mapper, { mode: 'projector' });

mapper.setControlsVisible(false);
mapper.setPlaneScale(1.0);
mapper.getWarper().setDragEnabled(false); // Projector is receive-only, no user interaction

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
