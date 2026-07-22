/*
Multi Surface Example
---------------------
Two independently warped surfaces sampling the left and right half of one
shared input texture — MadMapper/Resolume-style discrete multi-object mapping.
Use the GUI's Surfaces folder to select, add or remove surfaces; only the
active surface shows drag handles.
*/

import * as THREE from 'three';
import { ProjectionMapper, ProjectionMapperGUI } from '../../src/lib';

const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const bufferRes = { width: 1920, height: 1080 };

const shaderCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const shaderScene = new THREE.Scene();

const shaderMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(bufferRes.width, bufferRes.height) },
  },
  vertexShader: /* glsl */ `
    void main() {
      gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec2 uResolution;

    #define TAU 6.28318530718

    //IQ palette
    vec3 palette(float t) {
      return 0.5 + 0.5 * cos(TAU * (t + vec3(0.0, 0.33, 0.67)));
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / uResolution.xy;

      // Distinct halves so the uv rect split is obvious:
      // left half = flowing rings, right half = scrolling diagonals
      vec3 color;
      if (uv.x < 0.5) {
        vec2 p = uv * vec2(2.0, 1.0) - 0.5;
        float d = length(p - 0.5);
        color = palette(d * 2.0 - uTime * 0.1) * smoothstep(0.0, 0.05, abs(sin(d * 20.0 - uTime * 2.0)));
      } else {
        vec2 p = (uv - vec2(0.5, 0.0)) * vec2(2.0, 1.0);
        float stripes = sin((p.x + p.y) * 20.0 + uTime * 2.0);
        color = palette(p.y - uTime * 0.05) * smoothstep(-0.2, 0.2, stripes);
      }

      // Thin center split line
      color = mix(color, vec3(1.0), 1.0 - smoothstep(0.001, 0.003, abs(uv.x - 0.5)));

      gl_FragColor = vec4(color, 1.0);
    }
  `,
  depthTest: false,
  depthWrite: false,
});

shaderScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shaderMaterial));

const renderTarget = new THREE.WebGLRenderTarget(bufferRes.width, bufferRes.height, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  generateMipmaps: false,
});

// resolution = the crop's resolution (half the buffer width) so each
// surface's plane aspect matches what it samples
const mapper = new ProjectionMapper(renderer, renderTarget.texture, {
  resolution: { width: bufferRes.width / 2, height: bufferRes.height },
  zoom: 0.4,
});

// First run only: split the input between two surfaces.
// On reload the surface list and calibration restore from localStorage.
if (mapper.getSurfaces().length === 1) {
  mapper.setUvRect(0, 0, 0.5, 1);
  mapper.addSurface({ uvRect: { offsetX: 0.5, offsetY: 0, scaleX: 0.5, scaleY: 1 } });
}

const gui = new ProjectionMapperGUI(mapper, {
  title: 'Projection Mapper',
  anchor: 'left',
});

const hint = document.createElement('div');
hint.style.cssText = 'position:fixed;bottom:16px;left:16px;color:rgba(255,255,255,0.5);font:12px/1.6 monospace;pointer-events:none;transition:opacity 0.3s';
hint.innerHTML = '<span>G</span> toggle UI<br><span>T</span> test card<br><span>W</span> warp controls<br>Select a surface in the GUI, then drag its corners apart';
document.body.appendChild(hint);

let uiVisible = true;
window.addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'p') { gui.toggle(); uiVisible = !uiVisible; hint.style.opacity = uiVisible ? '1' : '0'; }
  if (e.key === 't') gui.toggleTestCard();
  if (e.key === 'w') gui.toggleWarpUI();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  mapper.resize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  shaderMaterial.uniforms.uTime.value = clock.getElapsedTime();

  renderer.setRenderTarget(renderTarget);
  renderer.render(shaderScene, shaderCamera);

  renderer.setRenderTarget(null);
  mapper.render();
}

animate();

console.log('Multi Surface Example');
console.log('Controls:');
console.log('  G/P - Toggle GUI');
console.log('  T   - Toggle testcard');
console.log('  W   - Toggle warp UI');
console.log('  Surfaces folder: select / add / remove surfaces, set UV rect');
