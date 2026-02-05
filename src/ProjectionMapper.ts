import * as THREE from 'three';
import { MeshWarper, MeshWarperConfig } from './MeshWarper';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import projectionFragmentShader from './shaders/projection.frag';

export interface ProjectionMapperConfig {
  /** Width of the projection surface in world units (default: 60) */
  width?: number;
  /** Height of the projection surface in world units (default: 60) */
  height?: number;
  /** Number of mesh segments for smooth warping (default: 50) */
  segments?: number;
  /** Grid control points for fine warping (default: 5x5) */
  gridControlPoints?: { x: number; y: number };
  /** Enable anti-aliasing (default: true) */
  antialias?: boolean;
  /** Camera field of view (default: 42) */
  fov?: number;
  /** Camera distance (default: 85) */
  cameraDistance?: number;
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
  private camera: THREE.PerspectiveCamera;
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

  private config: Required<ProjectionMapperConfig>;

  constructor(
    renderer: THREE.WebGLRenderer,
    inputTexture: THREE.Texture,
    config: ProjectionMapperConfig = {},
  ) {
    this.renderer = renderer;
    this.clock = new THREE.Clock();

    // Apply defaults
    this.config = {
      width: config.width ?? 60,
      height: config.height ?? 60,
      segments: config.segments ?? 50,
      gridControlPoints: config.gridControlPoints ?? { x: 5, y: 5 },
      antialias: config.antialias ?? true,
      fov: config.fov ?? 42,
      cameraDistance: config.cameraDistance ?? 85,
    };

    // Setup scene
    this.scene = new THREE.Scene();

    // Setup camera
    this.camera = new THREE.PerspectiveCamera(
      this.config.fov,
      window.innerWidth / window.innerHeight,
      1,
      10000,
    );
    this.camera.position.set(0, 0, this.config.cameraDistance);

    // Setup uniforms
    this.uniforms = {
      uBuffer: { value: inputTexture },
      uResolution: {
        value: new THREE.Vector2(
          window.innerWidth * devicePixelRatio,
          window.innerHeight * devicePixelRatio,
        ),
      },
      uWarpPlaneSize: {
        value: new THREE.Vector2(this.config.width, this.config.height),
      },
      uTime: { value: 0 },
      uShowTestCard: { value: false },
      uShowControlLines: { value: false },
    };

    // Setup mesh warper
    const warperConfig: MeshWarperConfig = {
      width: this.config.width,
      height: this.config.height,
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
      this.composer.addPass(new SMAAPass(window.innerWidth, window.innerHeight));
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
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(width, height);
    this.uniforms.uResolution.value.set(
      width * window.devicePixelRatio,
      height * window.devicePixelRatio,
    );
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

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  dispose(): void {
    this.meshWarper.dispose();
    this.composer.dispose();
  }
}

export default ProjectionMapper;
