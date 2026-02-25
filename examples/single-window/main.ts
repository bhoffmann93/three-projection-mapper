import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
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

const oversamplingFactor = 1.25;
const projectionResolution = new THREE.Vector2(1920, 1080);

const aspect = projectionResolution.x / projectionResolution.y;
const throwRatio = 1.65; // Acer X1383WH
const lensShiftY = 1.0;

// 1 unit = 1 metre. Camera ~40m away, 1.7m eye height, near/far for outdoor scene.
const camera = new ProjectorCamera(throwRatio, lensShiftY, aspect, 0.5, 500);
camera.updateProjectionMatrix();
camera.position.set(0, 1.7, 40);

let bergi: THREE.Object3D | null = null;

const loader = new OBJLoader();
loader.load('/bergi.obj', (obj) => {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      (child as THREE.Mesh).material = new THREE.MeshPhongMaterial({
        color: new THREE.Color().setHSL(0.1, 0.15, 0.78), // warm stone
      });
    }
  });
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const scale = 20 / Math.max(size.x, size.y, size.z);
  obj.scale.setScalar(scale);
  box.setFromObject(obj);
  obj.position.set(0, -box.min.y * 1.45, 0);
  obj.rotation.y -= Math.PI / 2.0;
  scene.add(obj);
  bergi = obj;
});

const hemiLight = new THREE.HemisphereLight(
  new THREE.Color().setHSL(0.6, 0.4, 0.7), // sky blue
  new THREE.Color().setHSL(0.25, 0.3, 0.15), // ground green-dark
  0.25,
);
scene.add(hemiLight);

const redLight = new THREE.PointLight(new THREE.Color().setHSL(0.0, 1.0, 0.5), 160, 40);
redLight.position.set(-5, 1, 8);
scene.add(redLight);

const blueLight = new THREE.PointLight(new THREE.Color().setHSL(0.62, 1.0, 0.5), 180, 40);
blueLight.position.set(5, 1, 8);
scene.add(blueLight);

const grid = new THREE.GridHelper(200, 40, 0x334433, 0x445544);
scene.add(grid);

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

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const t = clock.getElapsedTime();

  redLight.position.set(-5 + Math.sin(t * 0.8) * 4, 5 + Math.cos(t * 1.1) * 3, 8);
  blueLight.position.set(5 + Math.sin(t * 0.8 + Math.PI) * 4, 6 + Math.cos(t * 1.1 + Math.PI) * 3, 8);

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
