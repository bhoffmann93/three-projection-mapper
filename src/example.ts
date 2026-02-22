/**
 * Example usage of ProjectionMapper
 *
 * This demonstrates how to integrate the projection mapping library
 * into an existing Three.js project.
 */

import * as THREE from 'three';
import { ProjectionMapper } from './ProjectionMapper';
import { ProjectionMapperGUI, GUI_ANCHOR as PROJECTION_GUI_POSITION } from './ProjectionMapperGUI';

// Create renderer
const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x000000);
document.body.appendChild(renderer.domElement);

/**
//  * Calculates Projector Settings for Acer X1383WH
//  * @param distance Distance from lens to surface (any unit)
//  * @param width Actual width of the projected image (same unit)
//  * @returns Object containing Three.js camera parameters
//  */
// const getAcerProjectorSettings = (distance: number, width: number) => {
//   const measuredThrowRatio = distance / width;

//   // Acer X1383WH Hardware Constraints
//   const MIN_TR = 1.55;
//   const MAX_TR = 1.7;
//   //zoom 1,1
//   const ASPECT_RATIO = 1280 / 800; // 16:10

//   if (measuredThrowRatio < MIN_TR || measuredThrowRatio > MAX_TR) {
//     console.warn(
//       `Warning: Measured TR (${measuredThrowRatio.toFixed(2)}) is outside Acer X1383WH hardware specs (${MIN_TR}-${MAX_TR}).`,
//     );
//   }

//   // 1. Calculate Horizontal FOV in Radians
//   // FOV_h = 2 * Math.atan(1 / (2 * TR))
//   const fovHRad = 2 * Math.atan(1 / (2 * measuredThrowRatio));

//   // 2. Convert Horizontal FOV to Vertical FOV for Three.js
//   // tan(FOV_v/2) = tan(FOV_h/2) / AspectRatio
//   const fovVRad = 2 * Math.atan(Math.tan(fovHRad / 2) / ASPECT_RATIO);

//   // 3. Convert to Degrees for Three.js PerspectiveCamera
//   const fovVDeg = fovVRad * (180 / Math.PI);

//   return {
//     fov: fovVDeg,
//     aspect: ASPECT_RATIO,
//     throwRatio: measuredThrowRatio,
//     // The Y-offset for 100% shift (Lens is at the bottom of the image)
//     viewOffset: {
//       fullWidth: 1280,
//       fullHeight: 800,
//       x: 0,
//       y: 400, // half of 800
//       width: 1280,
//       height: 800,
//     },
//   };
// };

// Projection resolution in pixels - the library normalizes to small world units internally
const projectorResolution = { width: 1280, height: 800 };
const aspect = projectorResolution.width / projectorResolution.height;

//Acer X1383WH
//projection distance 1 - 11.9m
// throwratio: 1.55 - 1.7
// Zoom Setting,Throw Ratio,Vertical FOV (FOVv​)
// Wide (Max Zoom)  ,1.50   ,23.5∘
// Tele (Min Zoom)  ,1.65   ,21.5∘
//throw: distance cam to surface
//width: projection width in real world

const distToProjectionSurface = 1.5; //m
const lensCenterY = 0.05;
const throwRatio = 1.65; //1.55-1.7 based on zoom

const fovH = 2 * Math.atan(1 / (2 * throwRatio));
const fovV = 2 * Math.atan(Math.tan(fovH / 2) / aspect);
const fovDegrees = fovV * (180 / Math.PI);

const projectionWidth = distToProjectionSurface / throwRatio;
const projectionHeight = projectionWidth / aspect;
// console.log('projectionHeight: ', projectionHeight / 2 - 10);

const projectorCam = new THREE.PerspectiveCamera(fovDegrees, aspect, 0.1, 1000);

// Physical Position in the Room
projectorCam.position.set(0.0, lensCenterY, distToProjectionSurface);

// How Tilted the Porjector is
const physicalTiltDegrees = 0;
projectorCam.rotation.x = THREE.MathUtils.degToRad(physicalTiltDegrees);

projectorCam.updateProjectionMatrix();

// Internal Lens fixed Lens Offset
//1:1.12
// Vertical offset Lens (Acer) 100% (1.0) some are 110% (1.1)
// the projectors are build like this to project standing on a table / floor etc
// vertical shear matrix does not change angle
const lensShiftY = 1.0; //should be fixed for the projector
projectorCam.projectionMatrix.elements[9] = lensShiftY; //! needs to be called in resize

const renderTarget = new THREE.WebGLRenderTarget(projectorResolution.width, projectorResolution.height, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  generateMipmaps: false,
});

const contentScene = new THREE.Scene();
const cubeSize = 0.2; //m
const cubePositionY = 0.17; //bottom edge of cube
const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
cubeGeometry.translate(0, -0.2 / 2, 0); //pivot bottom

const material = new THREE.MeshNormalMaterial();
const cube = new THREE.Mesh(cubeGeometry, material);
cube.position.set(0, cubePositionY, 0);
cube.rotation.set(Math.PI, Math.PI * 0.25, Math.PI * 0.0);
// cube.rotation.x += 0.01;
// cube.rotation.y += 0.01;
contentScene.add(cube);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 1, 1);
contentScene.add(light);
contentScene.add(new THREE.AmbientLight(0x404040));

const GRID_SIZE = 2.0; // 2x2 meters total coverage
const GRID_DIVISIONS = 20; // 20 divisions = 10cm (0.1m) per square
const COLOR_AXIS = 0xff0000; // Red for center intersecting lines
const COLOR_LINES = 0xfffff; // Dark gray for the rest of the grid

// Instantiate the GridHelper
const floorGrid = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, COLOR_AXIS, COLOR_LINES);
// Position exactly on the floor plane
floorGrid.position.set(0, 0, 0);

// Add to the scene that the projector camera renders
contentScene.add(floorGrid);

const mapper = new ProjectionMapper(renderer, renderTarget.texture);

const gui = new ProjectionMapperGUI(mapper, 'Projection Mapper', PROJECTION_GUI_POSITION.LEFT);
window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'p') gui.toggle();
  if (e.key === 't') gui.toggleTestCard();
  if (e.key === 'h') {
    gui.toggleWarpUI();
  }
});

// Handle resize - render target stays at fixed projection resolution
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  renderer.setSize(width, height);

  projectorCam.aspect = projectorResolution.width / projectorResolution.height;
  projectorCam.updateProjectionMatrix();

  mapper.resize(width, height);
});

function animate() {
  requestAnimationFrame(animate);

  // cube.rotation.x += 0.01;
  // cube.rotation.y += 0.01;

  // Render content to  render target
  renderer.setRenderTarget(renderTarget);
  renderer.render(contentScene, projectorCam);

  projectorCam.projectionMatrix.elements[9] = lensShiftY;

  // Render the projection mapped output to the screen
  mapper.render();
}

animate();

console.log('ProjectionMapper Example');
console.log('Controls:');
console.log('  G/P - Toggle GUI');
console.log('  T - Toggle testcard');
console.log('  H - Hide all controls');
console.log('  S - Show all controls');
console.log('  Drag corners/grid points to adjust projection');
