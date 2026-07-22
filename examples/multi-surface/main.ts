/*
Multi Surface Example — atlas pattern
-------------------------------------
Three surfaces, showing that atlas slicing and per-surface media are the same
model rather than two modes.

Two square surfaces sample one shared input buffer (Resolume-style slices). That
buffer is an atlas rendered with scissor/viewport regions: left half = a 3D scene
(rotating cube), right half = a GLSL shader. Each region renders once, straight
into the shared render target — no blits.

The third surface ignores the atlas and samples its own image instead, taking
that image's 4:3 aspect while the atlas surfaces stay square. Each surface owns
its own texture uniform, so both kinds coexist without a mode switch.

Click a surface on the canvas to select it and drag its body to move it; only
the active surface shows drag handles. The input view (bottom right) shows the
shared buffer with one crop rect per surface — drag a rect to re-crop.
*/

import * as THREE from 'three';
import { ProjectionMapper, ProjectionMapperGUI } from '../../src/lib';
import { UvRectEditor } from '../../src/addons';

const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Atlas: two square 1080x1080 regions side by side in one buffer
const regionRes = { width: 1080, height: 1080 };
const bufferRes = { width: regionRes.width * 2, height: regionRes.height };

// --- Region 1: 3D scene with a rotating cube ---

const cubeScene = new THREE.Scene();
cubeScene.background = new THREE.Color(0x101018);

const cubeCamera = new THREE.PerspectiveCamera(45, regionRes.width / regionRes.height, 0.1, 100);
cubeCamera.position.set(0, 0.75, 4);
cubeCamera.lookAt(0, 0, 0);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1.5, 1.5, 1.5),
  new THREE.MeshStandardMaterial({ color: 0xff7733, roughness: 0.35, metalness: 0.2 }),
);
cubeScene.add(cube);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(2, 3, 4);
cubeScene.add(keyLight);
cubeScene.add(new THREE.HemisphereLight(0x8899ff, 0x332211, 1.0));

// --- Region 2: wave shader ---

const shaderCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const shaderScene = new THREE.Scene();

const shaderMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    // gl_FragCoord is in atlas pixels, so the shader needs its region's placement
    uRegionOffset: { value: new THREE.Vector2(regionRes.width, 0) },
    uRegionSize: { value: new THREE.Vector2(regionRes.width, regionRes.height) },
  },
  vertexShader: /* glsl */ `
    void main() {
      gl_Position = vec4(position, 1.0);
    }
  `,
  // Same wave shader as the fullscreen-shader example, sampled over this
  // region's rect instead of the whole buffer
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec2 uRegionOffset;
    uniform vec2 uRegionSize;

    #define PI 3.14159265358979

    //Tonemapping from https://www.shadertoy.com/view/4ccBRB
    vec3 acesApprox(vec3 v) {
        v *= 0.6;
        float a = 2.51;
        float b = 0.03;
        float c = 2.43;
        float d = 0.59;
        float e = 0.14;
        return clamp((v * (a * v + b)) / (v * (c * v + d) + e), 0.0, 1.0);
    }

    //IQ
    vec3 paletteEarthy(float t) {
        vec3 a = vec3(0.5, 0.5, 0.5);
        vec3 b = vec3(0.5, 0.5, 0.5);
        vec3 c = vec3(1.0, 1.0, 1.0);
        vec3 d = vec3(0.0, 0.10, 0.20);
        return a + b * cos(6.28318 * (c * t + d));
    }

    void main() {
      // gl_FragCoord is in atlas pixels, so subtract this region's placement
      vec2 uv = (gl_FragCoord.xy - uRegionOffset) / uRegionSize;

      float time = uTime * 0.075;

      float amount = 10.0;

      //https://www.shadertoy.com/view/W3dSD7
      vec3 sumColor = vec3(0.0);
      for(float i = 1.0; i <= amount; i++) {
          float n = i / amount;
          float osc = -cos(time * 4.0 * PI - i) * 0.5 + 0.5;

          float edgeYrange = 0.2;
          edgeYrange *= smoothstep(0.0, 0.75, uv.x); // rising from left
          float edgeY = mix(0.5 - edgeYrange, 0.5 + edgeYrange, sin(time * PI - i) * 0.5 + 0.5);

          float freq = 2.0 * mix(0.5, 1.0, n);
          float amp = 0.15;

          float phaseOffset = 1.5 * i;

          float waveOffset = sin(uv.x * PI * freq - time * 16.0 - phaseOffset);
          edgeY -= waveOffset * amp;

          float distToWave = uv.y - edgeY; //signed wave
          distToWave *= sign(mod(i, 2.0) - 0.5); // flip sign every other wave
          distToWave = max(-distToWave * 1.0, distToWave * 10.0); // like abs but tweakable for sign

          float blend = mix(1.0, 1.75, osc);
          float weight = 1.0 / (0.001 + pow(distToWave, blend));

          if(mod(i, 3.0) == 1.0)
              weight *= 1.5;// add more variation

          float b = -cos(uv.x - n * PI * 2.0 - time) * 0.5 + 0.5;
          b = mix(0.3, 0.6, b);
          vec3 waveColor = paletteEarthy(b);

          float brightness = 0.3 / amount;
          sumColor += waveColor * weight * brightness;
      }

      sumColor = acesApprox(sumColor);

      gl_FragColor = vec4(sumColor, 1.0);
    }
  `,
  depthTest: false,
  depthWrite: false,
});

shaderScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shaderMaterial));

// --- Shared atlas buffer ---
const renderTarget = new THREE.WebGLRenderTarget(bufferRes.width, bufferRes.height, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  generateMipmaps: false,
});

// The mapper's resolution is the view aspect and the default for surfaces that
// do not declare their own. Each surface below sets its own regionRes, so its
// plane matches the square half of the atlas it samples rather than the
// 2:1 shape of the whole buffer.
const mapper = new ProjectionMapper(renderer, renderTarget.texture, {
  resolution: regionRes,
  zoom: 0.4,
  appId: 'multi-surface',
});

// Apply the example layout once: the two atlas surfaces are 10 world units wide
// (square), the image surface is wider because it takes the image's 4:3 aspect.
// The marker key survives reloads, so calibration afterwards restores from
// localStorage. Bump the marker version to force a fresh layout.
const LAYOUT_KEY = 'multi-surface-example-layout-v2';
const IMAGE_SURFACE_ID = 'image';
const freshLayout = !localStorage.getItem(LAYOUT_KEY);

if (freshLayout) {
  const cubeSurface = mapper.getSurfaces()[0];
  const shaderSurface =
    mapper.getSurfaces()[1] ??
    mapper.addSurface({
      uvRect: { offsetX: 0.5, offsetY: 0, scaleX: 0.5, scaleY: 1 },
      resolution: regionRes,
    });
  mapper.setUvRect(0, 0, 0.5, 1, cubeSurface.id);
  mapper.setUvRect(0.5, 0, 0.5, 1, shaderSurface.id);
  mapper.reset(); // clear any stored warp before placing
  cubeSurface.setPosition(-13, 0);
  shaderSurface.setPosition(0, 0);
  localStorage.setItem(LAYOUT_KEY, '1');
}

// A third surface that ignores the atlas entirely: it samples its own image
// rather than a uv rect of the shared buffer, and takes that image's aspect.
// Each surface owns its own texture uniform, so mixing the two costs nothing.
new THREE.TextureLoader().load('/static/screenshot-warp.png', (imageTexture) => {
  imageTexture.colorSpace = THREE.SRGBColorSpace;

  // The surface is created from the loaded image's real dimensions, so its plane
  // is 4:3 while the atlas surfaces stay square
  const existing = mapper.getSurface(IMAGE_SURFACE_ID);
  const imageSurface =
    existing ??
    mapper.addSurface({
      id: IMAGE_SURFACE_ID,
      resolution: { width: imageTexture.image.width, height: imageTexture.image.height },
    });

  mapper.setTexture(imageTexture, imageSurface.id); // only this surface
  if (!existing) imageSurface.setPosition(13, 0);
});

const gui = new ProjectionMapperGUI(mapper, {
  title: 'Projection Mapper',
  anchor: 'left',
});

const uvRectEditor = new UvRectEditor(mapper);

const hint = document.createElement('div');
hint.style.cssText =
  'position:fixed;bottom:16px;left:16px;color:rgba(255,255,255,0.5);font:12px/1.6 monospace;pointer-events:none;transition:opacity 0.3s';
hint.innerHTML =
  '<span>G</span> toggle UI<br><span>T</span> test card<br><span>W</span> warp controls<br><span>I</span> input view<br>Click a surface to select it, drag its body to move it';
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
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  mapper.resize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const t = clock.getElapsedTime();
  cube.rotation.x = t * 0.5;
  cube.rotation.y = t * 0.8;
  shaderMaterial.uniforms.uTime.value = t;

  // Render both regions into the shared atlas. The render target's own
  // viewport/scissor are used (renderer.setViewport is canvas-only — it
  // scales by devicePixelRatio); setRenderTarget applies them, so re-bind
  // after each change.
  renderTarget.scissorTest = true;

  renderTarget.viewport.set(0, 0, regionRes.width, regionRes.height);
  renderTarget.scissor.set(0, 0, regionRes.width, regionRes.height);
  renderer.setRenderTarget(renderTarget);
  renderer.render(cubeScene, cubeCamera);

  renderTarget.viewport.set(regionRes.width, 0, regionRes.width, regionRes.height);
  renderTarget.scissor.set(regionRes.width, 0, regionRes.width, regionRes.height);
  renderer.setRenderTarget(renderTarget);
  renderer.render(shaderScene, shaderCamera);

  renderTarget.scissorTest = false;
  renderer.setRenderTarget(null);
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
console.log('  Click a surface to select it, drag its body to move it');
console.log('  Surfaces folder: add / remove surfaces; input view: crop them');
