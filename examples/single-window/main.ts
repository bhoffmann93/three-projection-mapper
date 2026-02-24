import * as THREE from 'three';
import { ProjectionMapper } from '../../src/core/ProjectionMapper';
import { ProjectionMapperGUI, GUI_ANCHOR } from '../../src/core/ProjectionMapperGUI';
import { ProjectorCamera } from '../../src/core/ProjectorCamera';

const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const oversamplingFactor = 1.0;
const projectionResolution = new THREE.Vector2(1920, 1080);

const aspect = projectionResolution.x / projectionResolution.y;
const throwRatio = 1.65; // Acer X1383WH
const lensShiftY = 1.0;
const camera = new ProjectorCamera(throwRatio, lensShiftY, aspect, 0.1, 1000);
//pos z zooom
//pos y move content up down without destroying perspective
camera.updateProjectionMatrix();
camera.position.set(0, 0.05, 1.5);

const cubeSize = 0.2;
const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
cubeGeometry.translate(0, -cubeSize / 2, 0); // Pivot at bottom instead of center
const cube = new THREE.Mesh(cubeGeometry, new THREE.MeshNormalMaterial());
cube.position.set(0, 0.17, 0);
cube.rotation.set(Math.PI, Math.PI * 0.25, 0);
scene.add(cube);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 1, 1);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

const grid = new THREE.GridHelper(2.0, 20, 0xff0000, 0xffffff);
scene.add(grid);

//increase resolution for warping
projectionResolution.multiplyScalar(oversamplingFactor);

const renderTarget = new THREE.WebGLRenderTarget(projectionResolution.x, projectionResolution.y, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  generateMipmaps: false,
});

const mapper = new ProjectionMapper(renderer, renderTarget.texture);
const gui = new ProjectionMapperGUI(mapper, {
  title: 'Projection Mapper',
  anchor: GUI_ANCHOR.LEFT,
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'p') gui.toggle();
  if (e.key === 't') gui.toggleTestCard();
  if (e.key === 'h') gui.toggleWarpUI();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = projectionResolution.x / projectionResolution.y;
  camera.updateProjectionMatrix();
  mapper.resize(window.innerWidth, window.innerHeight);
});

function animate() {
  cube.rotation.y += 0.01;

  requestAnimationFrame(animate);

  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  camera.updateProjectionMatrix();

  renderer.setRenderTarget(null);
  mapper.render();
}

animate();

console.log('ProjectionMapper Example');
console.log('Controls:');
console.log('  G/P - Toggle GUI');
console.log('  T - Toggle testcard');
console.log('  H - Toggle warp UI');
console.log('  Drag corners/grid points to warp');
