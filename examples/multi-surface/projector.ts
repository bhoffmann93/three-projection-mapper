/*
Multi Surface Example — projector window
----------------------------------------
Renders its own copy of the atlas and its own copy of the image, then applies the
controller's calibration for every surface. Only calibration crosses the channel;
textures are built locally in both windows.
*/

import * as THREE from 'three';
import { ProjectionMapper } from '../../src/lib';
import { WindowSync, WINDOW_SYNC_MODE } from '../../src/addons';
import { AtlasScene } from './AtlasScene';
import { MULTI_SURFACE_CONFIG } from './multi-surface.config';
import { loadImageSurface } from './imageSurface';

document.body.style.cursor = 'none';

const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);

const atlas = new AtlasScene();
const mapper = new ProjectionMapper(renderer, atlas.getTexture(), {
  resolution: MULTI_SURFACE_CONFIG.outputResolution,
  surfaceResolution: MULTI_SURFACE_CONFIG.regionResolution,
  appId: MULTI_SURFACE_CONFIG.appId,
});
new WindowSync(mapper, { mode: WINDOW_SYNC_MODE.PROJECTOR });

// The controller sends the surface, but not its pixels — bind them here too, and
// again whenever the surface list changes, since a surface removed and re-added
// on the controller is rebuilt here with the shared buffer as its texture.
loadImageSurface(mapper, { rebindOnSurfacesChanged: true });

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  mapper.resize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  atlas.animate(clock.getElapsedTime());
  atlas.render(renderer);
  mapper.render();
}

animate();

console.log('Multi Surface Projector Ready');
console.log('Waiting for controller connection...');
