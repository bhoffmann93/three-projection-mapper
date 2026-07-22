/*
AtlasScene
----------
The shared input buffer for the multi surface example: two square regions in one
render target, drawn with scissor/viewport rather than blits. Both the controller
and the projector build their own copy, because a texture cannot cross a
BroadcastChannel — only the calibration does.
*/

import * as THREE from 'three';
import { MULTI_SURFACE_CONFIG } from './multi-surface.config';

const regionRes = MULTI_SURFACE_CONFIG.regionResolution;
const bufferRes = MULTI_SURFACE_CONFIG.bufferResolution;

export class AtlasScene {
  private readonly renderTarget: THREE.WebGLRenderTarget;
  private readonly cubeScene = new THREE.Scene();
  private readonly cubeCamera: THREE.PerspectiveCamera;
  private readonly cube: THREE.Mesh;
  private readonly shaderScene = new THREE.Scene();
  private readonly shaderCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly shaderMaterial: THREE.ShaderMaterial;

  constructor() {
    this.renderTarget = new THREE.WebGLRenderTarget(bufferRes.width, bufferRes.height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });

    // Region 1: 3D scene with a rotating cube
    this.cubeScene.background = new THREE.Color(0x101018);
    this.cubeCamera = new THREE.PerspectiveCamera(45, regionRes.width / regionRes.height, 0.1, 100);
    this.cubeCamera.position.set(0, 0.75, 4);
    this.cubeCamera.lookAt(0, 0, 0);

    this.cube = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.5, 1.5),
      new THREE.MeshStandardMaterial({ color: 0xff7733, roughness: 0.35, metalness: 0.2 }),
    );
    this.cubeScene.add(this.cube);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(2, 3, 4);
    this.cubeScene.add(keyLight);
    this.cubeScene.add(new THREE.HemisphereLight(0x8899ff, 0x332211, 1.0));

    // Region 2: wave shader
    this.shaderMaterial = new THREE.ShaderMaterial({
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

    this.shaderScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.shaderMaterial));
  }

  getTexture(): THREE.Texture {
    return this.renderTarget.texture;
  }

  animate(elapsedTime: number): void {
    this.cube.rotation.x = elapsedTime * 0.5;
    this.cube.rotation.y = elapsedTime * 0.8;
    this.shaderMaterial.uniforms.uTime.value = elapsedTime;
  }

  /**
   * Render both regions into the shared atlas. The render target's own
   * viewport/scissor are used (renderer.setViewport is canvas-only — it scales by
   * devicePixelRatio); setRenderTarget applies them, so re-bind after each change.
   */
  render(renderer: THREE.WebGLRenderer): void {
    const target = this.renderTarget;
    target.scissorTest = true;

    target.viewport.set(0, 0, regionRes.width, regionRes.height);
    target.scissor.set(0, 0, regionRes.width, regionRes.height);
    renderer.setRenderTarget(target);
    renderer.render(this.cubeScene, this.cubeCamera);

    target.viewport.set(regionRes.width, 0, regionRes.width, regionRes.height);
    target.scissor.set(regionRes.width, 0, regionRes.width, regionRes.height);
    renderer.setRenderTarget(target);
    renderer.render(this.shaderScene, this.shaderCamera);

    target.scissorTest = false;
    renderer.setRenderTarget(null);
  }
}
