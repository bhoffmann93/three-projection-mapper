import * as THREE from 'three';
import { ProjectionMapper } from '../../src/core/ProjectionMapper';
import { ProjectionMapperGUI, GUI_ANCHOR } from '../../src/core/ProjectionMapperGUI';

const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const projectionRes = { width: 1920, height: 1080 };

const shaderCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const shaderScene = new THREE.Scene();
//@ts-ignore
const texture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}industrial-facade.png`);

const shaderMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(projectionRes.width, projectionRes.height) },
    uTexture: { value: texture },
  },
  vertexShader: /* glsl */ `
    void main() {
      gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `

    
    uniform float uTime;
    uniform vec2 uResolution;
    uniform sampler2D uTexture;

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

    //https://github.com/jamieowen/glsl-blend/blob/master/overlay.glsl

    float blendOverlay(float base, float blend) {
	    return base<0.5?(2.0*base*blend):(1.0-2.0*(1.0-base)*(1.0-blend));
    }

    vec3 blendOverlay(vec3 base, vec3 blend) {
      return vec3(blendOverlay(base.r,blend.r),blendOverlay(base.g,blend.g),blendOverlay(base.b,blend.b));
    }

    vec3 blendOverlay(vec3 base, vec3 blend, float opacity) {
	    return (blendOverlay(base, blend) * opacity + base * (1.0 - opacity));
    } 
    
    void main() {
      vec2 uv = gl_FragCoord.xy / uResolution.xy;
      
      float time = uTime * 0.075;
      
      float amount = 10.0;
      float index = 0.0;
      
      //https://www.shadertoy.com/view/W3dSD7
      vec3 sumColor = vec3(0.0);
      for(float i = 1.0; i <= amount; i++) {
          float n = i / amount;
          float osc = -cos(time * 4.0 * PI - i) * 0.5 + 0.5;
          
          float edgeYrange = 0.2;
          edgeYrange *= smoothstep(0.0, 0.75, uv.x); // rising from left
          float edgeY = mix(0.5 - edgeYrange, 0.5 + edgeYrange, sin(time * PI - i) * 0.5 + 0.5);
          
          float freq = 5.0 * mix(0.5, 1.0, n);
          float amp = 0.15;
          amp *= smoothstep(0.0, 0.25, uv.x); // rising from left
          
          float phaseOffset = 1.5 * i;
          
          float waveOffset = sin(uv.x * PI * freq - time * 16.0 - phaseOffset);
          edgeY -= waveOffset * amp;
          
          float distToWave = uv.y - edgeY; //signed wave
          distToWave *= sign(mod(i, 2.0) - 0.5); // flip sign every other wave
          distToWave = max(-distToWave * 1.0, distToWave * 10.0); // like abs but tweakable for sign

          
          float blend = mix(1.0, 1.75,osc);
          float weight = 1.0 / (0.001 + pow(distToWave, blend));
          
          if(mod(i, 3.0) == 1.0)
              weight *= 1.5;// add more variation             
          
          float b = -cos(uv.x - n * PI * 2.0 - time) * 0.5 + 0.5;
          b = mix(0.3, 0.6, b);
          vec3 waveColor = paletteEarthy(b);
          
          float brightness = 0.09 / amount;
          sumColor += waveColor * weight * brightness;
      }
      
      sumColor = acesApprox(sumColor);

      vec3 facade = texture2D(uTexture, uv).rgb;
      vec4 finalColor = vec4(blendOverlay(facade, sumColor, 0.875), 1.0);
      gl_FragColor = finalColor;
    }
  `,
  depthTest: false,
  depthWrite: false,
});

const fullscreenQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shaderMaterial);
shaderScene.add(fullscreenQuad);

const renderTarget = new THREE.WebGLRenderTarget(projectionRes.width, projectionRes.height, {
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

console.log('Fullscreen Shader Example');
console.log('Controls:');
console.log('  G/P - Toggle GUI');
console.log('  T   - Toggle testcard');
console.log('  W   - Toggle warp UI');
console.log('  Drag corners/grid points to warp');
