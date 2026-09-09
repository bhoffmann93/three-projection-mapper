/*
Multi Surface Example — controller window
-----------------------------------------
Three surfaces, showing that atlas slicing and per-surface media are the same
model rather than two modes.

Two square surfaces sample one shared input buffer (Resolume-style slices). That
buffer is an atlas rendered with scissor/viewport regions: left half = a 3D scene
(rotating cube), right half = a GLSL shader.

The third surface ignores the atlas and samples its own image instead — a uv grid,
so any stretch from a wrong surface resolution is immediately visible. Its shape
comes from the image's own dimensions rather than the buffer's. Each surface owns
its own texture uniform, so both kinds coexist without a mode switch.

Press O to open the projector window, which renders the same atlas and receives
this window's calibration. Textures never cross the channel — the projector
builds its own atlas and loads its own copy of the image.

Click a surface on the canvas to select it and drag its body to move it; only
the active surface shows drag handles. The input view (bottom right) shows the
shared buffer with one crop rect per surface — drag a rect to re-crop.
*/

import * as THREE from 'three';
import { ProjectionMapper, ProjectionMapperGUI } from '../../src/lib';
import { WindowSync, WINDOW_SYNC_MODE, UvRectEditor, ProjectionEventType } from '../../src/addons';
import { AtlasScene } from './AtlasScene';
import { MULTI_SURFACE_CONFIG } from './multi-surface.config';
import { loadImageSurface } from './imageSurface';

const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const atlas = new AtlasScene();

// Two resolutions, deliberately different: the output canvas is what the projector
// frames and what surfaces are arranged inside, while surfaceResolution is the
// shape surfaces get when they do not declare one — here an atlas region, so the
// square slices stay square inside a 16:9 output. Conflating the two is what made
// the first surface reset to 16:9. The controller previews at zoom 0.4 to leave
// room around the canvas, whose dashed boundary shows what is actually projected.
const mapper = new ProjectionMapper(renderer, atlas.getTexture(), {
  multiSurface: true,
  resolution: MULTI_SURFACE_CONFIG.outputResolution,
  surfaceResolution: MULTI_SURFACE_CONFIG.cubeSurfaceResolution,
  zoom: 0.4,
  appId: MULTI_SURFACE_CONFIG.appId,
});
const sync = new WindowSync(mapper, { mode: WINDOW_SYNC_MODE.CONTROLLER });

// Apply the example layout once: the two atlas surfaces are 10 world units wide
// (square), the image surface is wider because it takes the image's 4:3 aspect.
// The marker key survives reloads, so calibration afterwards restores from
// localStorage. Bump the marker version to force a fresh layout.
const LAYOUT_KEY = 'multi-surface-example-layout-v5';

// The output canvas is 16:9, so 10 world units tall and about 17.8 wide. Surfaces
// default to the full canvas height, so they are sized down here to sit in a row
// inside it — otherwise they would overflow what the projector frames. Positions
// are derived rather than written down, so the row stays centred and gapped when
// any of the sizes change.
const SURFACE_HEIGHT = 4;
const SURFACE_GAP = 0.7;

// The cube surface is 16:9 while its atlas region is square, so it samples a 16:9
// slice of that region rather than all of it. Derived from the invariant in the
// README rather than written down, so changing any of the resolutions keeps the
// crop correct: uvRect.scaleX / scaleY = surfaceAspect / bufferAspect. Sample the
// whole square instead and the cube would simply stretch.
const aspectOf = (resolution: { width: number; height: number }) => resolution.width / resolution.height;

const CUBE_ASPECT = aspectOf(MULTI_SURFACE_CONFIG.cubeSurfaceResolution);
const BUFFER_ASPECT = aspectOf(MULTI_SURFACE_CONFIG.bufferResolution);
const CUBE_UV_SCALE_X = 0.5; // the atlas region it samples is the left half
const CUBE_UV_SCALE_Y = CUBE_UV_SCALE_X / (CUBE_ASPECT / BUFFER_ASPECT);
const CUBE_UV_RECT = {
  offsetX: 0,
  offsetY: (1 - CUBE_UV_SCALE_Y) / 2, // centred in its region
  scaleX: CUBE_UV_SCALE_X,
  scaleY: CUBE_UV_SCALE_Y,
};
const CUBE_WIDTH = SURFACE_HEIGHT * CUBE_ASPECT;

const ROW_WIDTH = CUBE_WIDTH + SURFACE_GAP + SURFACE_HEIGHT + SURFACE_GAP + SURFACE_HEIGHT;
const ROW_LEFT = -ROW_WIDTH / 2;
const CUBE_CENTER_X = ROW_LEFT + CUBE_WIDTH / 2;
const SHADER_CENTER_X = ROW_LEFT + CUBE_WIDTH + SURFACE_GAP + SURFACE_HEIGHT / 2;
const IMAGE_CENTER_X = ROW_LEFT + CUBE_WIDTH + SURFACE_GAP + SURFACE_HEIGHT + SURFACE_GAP + SURFACE_HEIGHT / 2;

const cubeSurface = mapper.getSurface(MULTI_SURFACE_CONFIG.cubeSurfaceId) ?? mapper.getSurfaces()[0];
const shaderSurface =
  mapper.getSurface(MULTI_SURFACE_CONFIG.shaderSurfaceId) ??
  mapper.addSurface({
    id: MULTI_SURFACE_CONFIG.shaderSurfaceId,
    uvRect: { offsetX: 0.5, offsetY: 0, scaleX: 0.5, scaleY: 1 },
    resolution: MULTI_SURFACE_CONFIG.regionResolution,
  });
// addSurface returns null on a single-surface mapper, which this example is not
if (!shaderSurface) throw new Error('multi-surface example needs multiSurface: true');

if (!localStorage.getItem(LAYOUT_KEY)) {
  mapper.setUvRect(
    CUBE_UV_RECT.offsetX,
    CUBE_UV_RECT.offsetY,
    CUBE_UV_RECT.scaleX,
    CUBE_UV_RECT.scaleY,
    cubeSurface.id,
  );
  mapper.setUvRect(0.5, 0, 0.5, 1, shaderSurface.id);
  cubeSurface.setBounds(CUBE_CENTER_X, 0, CUBE_WIDTH, SURFACE_HEIGHT);
  shaderSurface.setBounds(SHADER_CENTER_X, 0, SURFACE_HEIGHT, SURFACE_HEIGHT);
  localStorage.setItem(LAYOUT_KEY, '1');
}

loadImageSurface(mapper, {
  onCreated: (surface) => {
    // Announce before positioning: the projector has to own the surface before the
    // move that follows can be applied to it, and the image arrives whenever it
    // arrives — possibly with the projector already connected.
    sync.broadcast(ProjectionEventType.SURFACE_ADDED, {
      surfaceId: surface.id,
      uvRect: surface.getUvRect(),
      resolution: surface.getResolution(),
    });
    surface.setBounds(IMAGE_CENTER_X, 0, SURFACE_HEIGHT, SURFACE_HEIGHT);
  },
});

const gui = new ProjectionMapperGUI(mapper, {
  title: 'Projection Mapper',
  anchor: 'left',
  eventChannel: sync.getEventChannel(),
  windowManager: sync.getWindowManager(),
});

// The pane no longer edits uv rects, so the crop tool is the app's job — and so
// is telling the projector about it. Without this the projector only picks up
// crops on connect, via the full state sync.
const uvRectEditor = new UvRectEditor(mapper, {
  onUvRectChanged: (surfaceId, uvRect) => {
    sync.broadcast(ProjectionEventType.UV_RECT_CHANGED, { uvRect, surfaceId });
  },
});

const hint = document.createElement('div');
hint.style.cssText =
  'position:fixed;bottom:16px;left:16px;color:rgba(255,255,255,0.5);font:12px/1.6 monospace;pointer-events:none;transition:opacity 0.3s';
hint.innerHTML =
  '<span>G</span> toggle UI<br><span>T</span> test card<br><span>W</span> warp controls<br><span>I</span> input view<br><span>O</span> open projector<br><span>Tab</span> select warp point<br><span>&larr;&uarr;&darr;&rarr;</span> move warp point (<span>Shift</span> &times;10)<br><span>Esc</span> deselect warp point' +
  '<br>Click a surface to select it, drag its body to move it';
document.body.appendChild(hint);

let uiVisible = true;
window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'p') {
    gui.toggle();
    uvRectEditor.toggle();
    uiVisible = !uiVisible;
    hint.style.opacity = uiVisible ? '1' : '0';
  }
  if (e.key === 'i') uvRectEditor.toggle();
  if (e.key === 't') gui.toggleTestCard();
  if (e.key === 'w') gui.toggleWarpUI();
  if (e.key === 'o') sync.openProjectorWindow();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  mapper.resize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  // Feed the shader surface's live size back into the atlas, so scaling the
  // surface reproportions the content instead of stretching it. Read per frame
  // because dragging a corner changes it without any callback firing.
  atlas.setSurfaceAspect(shaderSurface.getWarpedAspect());

  atlas.animate(clock.getElapsedTime());
  atlas.render(renderer);
  mapper.render();
  uvRectEditor.update(renderer);
}

animate();

console.log('Multi Surface Example (atlas: scene + shader, plus one surface with its own image)');
console.log('Controls:');
console.log('  G/P - Toggle GUI');
console.log('  T   - Toggle testcard');
console.log('  W   - Toggle warp UI');
console.log('  I   - Toggle input view (UV rect editor)');
console.log('  O   - Open projector window');
console.log('  Click a surface to select it, drag its body to move it');
