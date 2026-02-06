import * as THREE from 'three';
import { MeshWarper, MeshWarperConfig } from './MeshWarper';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import projectionFragmentShader from './shaders/projection.frag';

export interface ProjectionMapperConfig {
  /** Projection resolution in pixels (default: { width: 1920, height: 1080 }) */
  resolution?: { width: number; height: number };
  /** Number of mesh segments for smooth warping (default: 50) */
  segments?: number;
  /** Grid control points for fine warping (default: 5x5) */
  gridControlPoints?: { x: number; y: number };
  /** Enable anti-aliasing (default: true) */
  antialias?: boolean;
  /** Scale factor for how much of the window the plane fills (default: 0.9 = 90%) */
  planeFill?: number;
}

/**
 * ProjectionMapper - A simple projection mapping library for Three.js
 *
 * Usage:
 * ```typescript
 * const renderer = new THREE.WebGLRenderer();
 * const texture = new THREE.TextureLoader().load('image.jpg');
 *
 * const mapper = new ProjectionMapper(renderer, texture);
 *
 * function animate() {
 *   mapper.render();
 *   requestAnimationFrame(animate);
 * }
 * ```
 */
export class ProjectionMapper {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private meshWarper: MeshWarper;
  private composer: EffectComposer;
  private clock: THREE.Clock;

  private uniforms: {
    uBuffer: { value: THREE.Texture };
    uResolution: { value: THREE.Vector2 };
    uWarpPlaneSize: { value: THREE.Vector2 };
    uTime: { value: number };
    uShowTestCard: { value: boolean };
    uShowControlLines: { value: boolean };
  };

  /** Resolution in pixels, passed through to shaders */
  private resolution: { width: number; height: number };
  /** Normalized world-space dimensions derived from resolution aspect ratio */
  private worldWidth: number;
  private worldHeight: number;

  private config: Required<Omit<ProjectionMapperConfig, 'resolution'>>;

  constructor(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, config: ProjectionMapperConfig = {}) {
    this.renderer = renderer;
    this.clock = new THREE.Clock();

    // Resolution in pixels (for textures/shaders)
    this.resolution = config.resolution ?? { width: 1920, height: 1080 };

    // Normalize to small world units: height is always 10, width follows aspect
    const aspectRatio = this.resolution.width / this.resolution.height;
    this.worldHeight = 10;
    this.worldWidth = 10 * aspectRatio;

    // Apply defaults
    this.config = {
      segments: config.segments ?? 50,
      gridControlPoints: config.gridControlPoints ?? { x: 5, y: 5 },
      antialias: config.antialias ?? true,
      planeFill: config.planeFill ?? 0.9,
    };

    // Setup scene
    this.scene = new THREE.Scene();

    // Setup orthographic camera to fit the plane with correct aspect
    const windowAspect = window.innerWidth / window.innerHeight;
    const planeAspect = this.worldWidth / this.worldHeight;

    const scale = 1 / this.config.planeFill;
    let left, right, top, bottom;
    if (windowAspect > planeAspect) {
      top = (this.worldHeight / 2) * scale;
      bottom = (-this.worldHeight / 2) * scale;
      left = ((-this.worldHeight * windowAspect) / 2) * scale;
      right = ((this.worldHeight * windowAspect) / 2) * scale;
    } else {
      left = (-this.worldWidth / 2) * scale;
      right = (this.worldWidth / 2) * scale;
      top = (this.worldWidth / windowAspect / 2) * scale;
      bottom = (-this.worldWidth / windowAspect / 2) * scale;
    }

    this.camera = new THREE.OrthographicCamera(left, right, top, bottom, 0.1, 100);
    this.camera.position.set(0, 0, 20);
    this.camera.lookAt(0, 0, 0);

    // Setup uniforms - uResolution uses actual pixel resolution for shader precision
    this.uniforms = {
      uBuffer: { value: inputTexture },
      uResolution: {
        value: new THREE.Vector2(this.resolution.width, this.resolution.height),
      },
      uWarpPlaneSize: {
        value: new THREE.Vector2(this.worldWidth, this.worldHeight),
      },
      uTime: { value: 0 },
      uShowTestCard: { value: false },
      uShowControlLines: { value: false },
    };

    // Setup mesh warper using normalized world units
    const warperConfig: MeshWarperConfig = {
      width: this.worldWidth,
      height: this.worldHeight,
      widthSegments: this.config.segments,
      heightSegments: this.config.segments,
      gridControlPoints: this.config.gridControlPoints,
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      fragmentShader: projectionFragmentShader,
      globalUniforms: this.uniforms,
      globalDefines: {},
      bufferTexture: inputTexture,
    };

    this.meshWarper = new MeshWarper(warperConfig);

    // Setup post-processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    if (this.config.antialias) {
      this.composer.addPass(new SMAAPass());
    }
  }

  render(): void {
    this.uniforms.uTime.value = this.clock.getElapsedTime();

    // Update warp plane size based on current corners
    const dimensions = this.meshWarper.averageDimensions;
    this.uniforms.uWarpPlaneSize.value.set(dimensions.width, dimensions.height);

    // Render to screen
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
    this.composer.render();
  }

  setTexture(texture: THREE.Texture): void {
    this.uniforms.uBuffer.value = texture;
    this.meshWarper.setBufferTexture(texture);
  }

  setShowTestCard(show: boolean): void {
    this.uniforms.uShowTestCard.value = show;
  }

  isShowingTestCard(): boolean {
    return this.uniforms.uShowTestCard.value;
  }

  setShowControlLines(show: boolean): void {
    this.uniforms.uShowControlLines.value = show;
  }

  isShowingControlLines(): boolean {
    return this.uniforms.uShowControlLines.value;
  }

  resize(width: number, height: number): void {
    const windowAspect = width / height;
    const planeAspect = this.worldWidth / this.worldHeight;
    const scale = 1 / this.config.planeFill;

    if (windowAspect > planeAspect) {
      // Window is wider than plane -> height is the limiting factor
      this.camera.top = (this.worldHeight / 2) * scale;
      this.camera.bottom = (-this.worldHeight / 2) * scale;
      this.camera.left = ((-this.worldHeight * windowAspect) / 2) * scale;
      this.camera.right = ((this.worldHeight * windowAspect) / 2) * scale;
    } else {
      // Window is narrower than plane -> width is the limiting factor
      this.camera.left = (-this.worldWidth / 2) * scale;
      this.camera.right = (this.worldWidth / 2) * scale;
      this.camera.top = (this.worldWidth / windowAspect / 2) * scale;
      this.camera.bottom = (-this.worldWidth / windowAspect / 2) * scale;
    }

    this.camera.updateProjectionMatrix();
  }

  getWarper(): MeshWarper {
    return this.meshWarper;
  }

  setControlsVisible(visible: boolean): void {
    this.meshWarper.setAllControlsVisible(visible);
  }

  setGridPointsVisible(visible: boolean): void {
    this.meshWarper.setGridPointsVisible(visible);
  }

  setCornerPointsVisible(visible: boolean): void {
    this.meshWarper.setCornerPointsVisible(visible);
  }

  setOutlineVisible(visible: boolean): void {
    this.meshWarper.setOutlineVisible(visible);
  }

  setGridSize(x: number, y: number): void {
    this.meshWarper.setGridSize(x, y);
  }

  reset(): void {
    this.meshWarper.resetToDefault();
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.OrthographicCamera {
    return this.camera;
  }

  dispose(): void {
    this.meshWarper.dispose();
    this.composer.dispose();
  }
}

export default ProjectionMapper;
