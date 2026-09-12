import * as THREE from "three";
import {
  ProjectionMapper,
  ProjectionMapperGUI,
  ProjectorCamera,
} from "three-projection-mapper";

const renderer = new THREE.WebGLRenderer({
  powerPreference: "high-performance",
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

const video = document.createElement("video");
video.src = "/trailer.mp4";
video.loop = true;
video.muted = false;
video.playsInline = true;
video.preload = "auto";
video.style.cssText =
  "position:fixed;top:0;left:0;width:500px;height:500px;opacity:1.0;pointer-events:none; display: none;";
document.body.appendChild(video);

video.addEventListener("error", () => {
  console.error("Video error:", video.error?.message);
});

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d")!;

const videoTex = new THREE.VideoTexture(video);
videoTex.colorSpace = THREE.SRGBColorSpace;

const grid = new THREE.GridHelper(200, 40, 0x334433, 0x445544);
scene.add(grid);

projectionResolution.multiplyScalar(oversamplingFactor);

const renderTarget = new THREE.WebGLRenderTarget(
  projectionResolution.x,
  projectionResolution.y,
  {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  },
);

const mapper = new ProjectionMapper(renderer, videoTex, {
  resolution: { width: 1920, height: 1080 },
});
const gui = new ProjectionMapperGUI(mapper, {
  title: "Projection Mapper",
  anchor: "left",
});

const hint = document.createElement("div");
hint.style.cssText =
  "position:fixed;bottom:16px;left:16px;color:rgba(255,255,255,0.5);font:12px/1.6 monospace;pointer-events:none;transition:opacity 0.3s";
hint.innerHTML =
  "<span>G</span> toggle UI<br><span>T</span> test card<br><span>W</span> warp controls<br><span>A</span> play video";
document.body.appendChild(hint);

let uiVisible = false;
window.addEventListener("keydown", (e) => {
  if (e.key === "g" || e.key === "p") {
    gui.toggle();
    uiVisible = !uiVisible;
    hint.style.opacity = uiVisible ? "1" : "0";
  }
  if (e.key === "t") gui.toggleTestCard();
  if (e.key === "w") gui.toggleWarpUI();
  if (e.key === "a") {
    if (!video.paused) {
      video.pause();
    } else {
      if (video.readyState === 4) {
        video.play();
      }
    }
  }
});

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = projectionResolution.x / projectionResolution.y;
  camera.updateProjectionMatrix();
  mapper.resize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const t = clock.getElapsedTime();

  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  camera.updateProjectionMatrix();

  renderer.setRenderTarget(null);
  mapper.render();
}

animate();

console.log("ProjectionMapper Example");
console.log("Controls:");
console.log("  G/P - Toggle GUI");
console.log("  T - Toggle testcard");
console.log("  W - Toggle warp UI");
console.log("  Drag corners/grid points to warp");
