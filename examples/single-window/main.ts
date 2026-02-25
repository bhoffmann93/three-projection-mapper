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

// 1 unit = 1 m, Y pos = lens center
const camera = new ProjectorCamera(throwRatio, lensShiftY, aspect, 0.5, 500);
camera.updateProjectionMatrix();
camera.position.set(0, 0.05, 4.25);

let bergi: THREE.Object3D | null = null;

const texLoader = new THREE.TextureLoader();
//@ts-ignore
const texBase = `${import.meta.env.BASE_URL}concrete_0019_1k_K4mRwL/concrete_0019`;

function loadTex(suffix: string, colorSpace = THREE.NoColorSpace) {
  const t = texLoader.load(`${texBase}${suffix}`);
  t.colorSpace = colorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1.2);
  return t;
}

const concreteMat = new THREE.MeshStandardMaterial({
  //@ts-ignore
  map: loadTex('_color_1k.jpg', THREE.SRGBColorSpace),
  normalMap: loadTex('_normal_opengl_1k.png'),
  roughnessMap: loadTex('_roughness_1k.jpg'),
  roughness: 1.0,
  metalness: 0.1,
});

const loader = new OBJLoader();
//@ts-ignore
loader.load(`${import.meta.env.BASE_URL}bergi.obj`, (obj) => {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      (child as THREE.Mesh).material = concreteMat;
    }
  });
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const scale = 2 / Math.max(size.x, size.y, size.z);
  obj.scale.setScalar(scale);
  box.setFromObject(obj);
  obj.position.set(0, -box.min.y * 1.3, 0);
  obj.rotation.y -= Math.PI / 2.0;
  scene.add(obj);
  bergi = obj;
});

const hemiLight = new THREE.HemisphereLight(
  new THREE.Color().setHSL(0.6, 0.4, 0.7),
  new THREE.Color().setHSL(0.25, 0.3, 0.15),
  0.75,
);
scene.add(hemiLight);

const redLight = new THREE.PointLight(new THREE.Color().setHSL(0.0, 1.0, 0.5), 8, 4);
scene.add(redLight);

const blueLight = new THREE.PointLight(new THREE.Color().setHSL(0.62, 1.0, 0.5), 8, 4);
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

  redLight.position.set(-0.7 + Math.sin(t * 0.8) * 0.4, 0.5 + Math.cos(t * 1.1) * 0.3, 0.8);
  blueLight.position.set(0.7 + Math.sin(t * 0.8 + Math.PI) * 0.4, 0.6 + Math.cos(t * 1.1 + Math.PI) * 0.3, 0.8);

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
