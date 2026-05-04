import * as THREE from 'three';
import { MeshWarper, MeshWarperConfig } from '../warp/MeshWarper';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import projectionFragmentShader from '../shaders/projection.frag';
import { calculateGridPoints } from '../warp/geometry';
import { GUI_STORAGE_KEY, DEFAULT_IMAGE_SETTINGS, DEFAULTS } from './defaults';
import type { ImageSettings } from './defaults';
import { PolygonMask, type UVPoint, POLYGON_MASK_STORAGE_KEY } from '../mask/PolygonMask';
import { MaskPlane } from '../mask/MaskPlane';

export { GUI_STORAGE_KEY, DEFAULT_IMAGE_SETTINGS };
export type { ImageSettings };

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
  zoom?: number;
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
    uBufferResolution: { value: THREE.Vector2 };
    uWarpPlaneSize: { value: THREE.Vector2 };
    uTime: { value: number };
    uShowTestCard: { value: boolean };
    uShowControlLines: { value: boolean };
    uTonemap: { value: boolean };
    uGamma: { value: number };
    uContrast: { value: number };
    uHue: { value: number };
  };

  private polygonMask: PolygonMask | null = null;

  /** Called whenever polygon mask nodes change (drag, insert, delete, reset). */
  public onPolygonNodesChanged: () => void = () => {};
  private maskPlane!: MaskPlane;
  private imageSettings: ImageSettings;

  /** Resolution in pixels, passed through to shaders */
  private resolution: { width: number; height: number };
  /** Normalized world-space dimensions derived from resolution aspect ratio */
  private worldWidth: number;
  private worldHeight: number;

  private config: Required<Omit<ProjectionMapperConfig, 'resolution'>>;

  constructor(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, config: ProjectionMapperConfig = {}) {
    this.renderer = renderer;
    this.clock = new THREE.Clock();

    //Get Dimensions from Texture / Render Target
    const texWidth = (inputTexture as any).image?.width || (inputTexture as any).width;
    const texHeight = (inputTexture as any).image?.height || (inputTexture as any).height;

    // Resolution in pixels (for textures/shaders)
    // User can overwrite the Resolution which calculates a different aspect ratio
    this.resolution = config.resolution ?? { width: texWidth, height: texHeight };

    // Normalize to small world units: height is always 10, width follows aspect
    const aspectRatio = this.resolution.width / this.resolution.height;
    this.worldHeight = 10; // fixed internal coordinate system: height=10, width follows aspect ratio
    this.worldWidth = 10 * aspectRatio;

    const gridControlPoints = this.getGridControlPoints(config, aspectRatio, DEFAULTS.minGridWarpPoints);

    this.config = {
      segments: config.segments ?? DEFAULTS.segments,
      gridControlPoints,
      antialias: config.antialias ?? DEFAULTS.antialias,
      zoom: config.zoom ?? DEFAULTS.zoom,
    };

    this.scene = new THREE.Scene();

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.set(0, 0, 20);
    this.camera.lookAt(0, 0, 0);
    this.updateCameraFrustum();

    this.uniforms = {
      uBuffer: { value: inputTexture },
      uBufferResolution: {
        value: new THREE.Vector2(this.resolution.width, this.resolution.height),
      },
      uWarpPlaneSize: {
        value: new THREE.Vector2(this.worldWidth, this.worldHeight),
      },
      uTime: { value: 0 },
      uShowTestCard: { value: false },
      uShowControlLines: { value: true },
      uTonemap: { value: DEFAULT_IMAGE_SETTINGS.tonemap },
      uGamma: { value: DEFAULT_IMAGE_SETTINGS.gamma },
      uContrast: { value: DEFAULT_IMAGE_SETTINGS.contrast },
      uHue: { value: DEFAULT_IMAGE_SETTINGS.hue },
    };

    this.imageSettings = { ...DEFAULT_IMAGE_SETTINGS };

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

    this.maskPlane = new MaskPlane({
      worldWidth: this.worldWidth,
      worldHeight: this.worldHeight,
      segments: this.config.segments,
      scene: this.scene,
      warpPlaneSizeRef: this.uniforms.uWarpPlaneSize,
    });

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    if (this.config.antialias) {
      this.composer.addPass(new SMAAPass());
    }
  }

  // Use saved grid size from GUI settings if available, so MeshWarper
  // is created with the correct grid size before loading stored control points
  private getGridControlPoints(config: ProjectionMapperConfig, aspectRatio: number, minGridWarpPoints: number) {
    let gridControlPoints = config.gridControlPoints;
    if (!gridControlPoints) {
      try {
        const savedGui = localStorage.getItem(GUI_STORAGE_KEY);
        if (savedGui) {
          const parsed = JSON.parse(savedGui);
          if (parsed.gridSize?.x && parsed.gridSize?.y) {
            gridControlPoints = { x: Math.floor(parsed.gridSize.x), y: Math.floor(parsed.gridSize.y) };
          }
        }
      } catch {
        // ignore parse errors
      }
      gridControlPoints = gridControlPoints ?? calculateGridPoints(aspectRatio, minGridWarpPoints);
    }
    return gridControlPoints;
  }

  render(): void {
    this.uniforms.uTime.value = this.clock.getElapsedTime();

    // Constant screen-pixel size: convert 1 pixel to world units
    const frustumWidth = this.camera.right - this.camera.left;
    const viewportWidth = this.renderer.domElement.clientWidth;
    const pixelToWorld = frustumWidth / viewportWidth;
    this.meshWarper.updateControlPointsScale(pixelToWorld);

    this.maskPlane.syncPerspective(this.meshWarper.getPerspectiveCoeffs());

    if (this.polygonMask) {
      this.polygonMask.updateTransformedPositions(
        (x, y) => this.meshWarper.applyPerspectiveTransform(x, y),
        (x, y) => this.meshWarper.applyInversePerspectiveTransform(x, y),
      );
      this.polygonMask.updateControlPointsScale(pixelToWorld);
    }

    if (this.config.antialias == false) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    } else {
      this.composer.render();
    }
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

  setImageSettings(settings: Partial<ImageSettings>): void {
    if (settings.maskEnabled !== undefined) {
      this.imageSettings.maskEnabled = settings.maskEnabled;
      this.maskPlane.setFeatherMask(settings.maskEnabled, this.imageSettings.feather);
    }
    if (settings.feather !== undefined) {
      this.imageSettings.feather = settings.feather;
      this.maskPlane.setFeatherMask(this.imageSettings.maskEnabled, settings.feather);
    }
    if (settings.tonemap !== undefined) {
      this.imageSettings.tonemap = settings.tonemap;
      this.uniforms.uTonemap.value = settings.tonemap;
    }
    if (settings.gamma !== undefined) {
      this.imageSettings.gamma = settings.gamma;
      this.uniforms.uGamma.value = settings.gamma;
    }
    if (settings.contrast !== undefined) {
      this.imageSettings.contrast = settings.contrast;
      this.uniforms.uContrast.value = settings.contrast;
    }
    if (settings.hue !== undefined) {
      this.imageSettings.hue = settings.hue;
      this.uniforms.uHue.value = settings.hue;
    }
  }

  getImageSettings(): ImageSettings {
    return { ...this.imageSettings };
  }

  private updateCameraFrustum(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const windowAspect = width / height;
    const planeAspect = this.worldWidth / this.worldHeight;
    const scale = 1 / this.config.zoom;

    if (windowAspect > planeAspect) {
      this.camera.top = (this.worldHeight / 2) * scale;
      this.camera.bottom = (-this.worldHeight / 2) * scale;
      this.camera.left = ((-this.worldHeight * windowAspect) / 2) * scale;
      this.camera.right = ((this.worldHeight * windowAspect) / 2) * scale;
    } else {
      this.camera.left = (-this.worldWidth / 2) * scale;
      this.camera.right = (this.worldWidth / 2) * scale;
      this.camera.top = (this.worldWidth / windowAspect / 2) * scale;
      this.camera.bottom = (-this.worldWidth / windowAspect / 2) * scale;
    }

    this.camera.updateProjectionMatrix();
  }

  resize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.updateCameraFrustum();
  }

  getWarper(): MeshWarper {
    return this.meshWarper;
  }

  setControlsVisible(visible: boolean): void {
    this.setShowControlLines(visible);
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

  setShouldWarp(enabled: boolean): void {
    this.meshWarper.setShouldWarp(enabled);
    this.maskPlane.setShouldWarp(enabled);
    this.polygonMask?.setVisible(enabled);
  }

  isWarpEnabled(): boolean {
    return this.meshWarper.getShouldWarp();
  }

  setZoom(scale: number): void {
    this.config.zoom = scale;
    this.updateCameraFrustum();
  }

  getZoom(): number {
    return this.config.zoom;
  }

  setCameraOffset(x: number, y: number): void {
    this.camera.position.x = x;
    this.camera.position.y = y;
  }

  getCameraOffset(): { x: number; y: number } {
    return { x: this.camera.position.x, y: this.camera.position.y };
  }

  getResolution(): { width: number; height: number } {
    return { ...this.resolution };
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

  addPolygonMask(nodes?: UVPoint[]): PolygonMask {
    if (this.polygonMask) this.removePolygonMask();
    this.polygonMask = new PolygonMask(
      this.scene,
      this.camera,
      this.renderer,
      this.worldWidth,
      this.worldHeight,
      nodes,
    );
    this.polygonMask.onChanged = () => this.syncPolygonMaskUniforms();
    this.polygonMask.setVisible(this.meshWarper.getShouldWarp());
    this.maskPlane.setPolygonMaskEnabled(true);
    this.syncPolygonMaskUniforms();
    return this.polygonMask;
  }

  resetPolygonMask(): void {
    if (!this.polygonMask) return;
    this.polygonMask.clearStorage();
    this.polygonMask.dispose();
    this.polygonMask = new PolygonMask(this.scene, this.camera, this.renderer, this.worldWidth, this.worldHeight);
    this.polygonMask.onChanged = () => this.syncPolygonMaskUniforms();
    this.polygonMask.setVisible(this.meshWarper.getShouldWarp());
    this.syncPolygonMaskUniforms();
  }

  removePolygonMask(): void {
    if (!this.polygonMask) return;
    this.polygonMask.dispose();
    this.polygonMask.clearStorage();
    this.polygonMask = null;
    this.maskPlane.setPolygonMaskEnabled(false);
    this.maskPlane.setPolygonNodes([]);
  }

  private syncPolygonMaskUniforms(): void {
    if (!this.polygonMask) return;
    this.maskPlane.setPolygonNodes(this.polygonMask.nodes);
    this.onPolygonNodesChanged();
  }

  getPolygonMaskFullState(): { nodes: UVPoint[]; enabled: boolean; inverted: boolean; feather: number } | null {
    if (!this.polygonMask) return null;
    return {
      nodes: Array.from(this.polygonMask.nodes),
      enabled: this.maskPlane.getPolygonMaskEnabled(),
      inverted: this.maskPlane.getPolygonInvert(),
      feather: this.maskPlane.getPolygonFeather(),
    };
  }

  getPolygonMask(): PolygonMask | null {
    return this.polygonMask;
  }

  setPolygonMaskEnabled(enabled: boolean): void {
    this.maskPlane.setPolygonMaskEnabled(enabled);
  }

  setPolygonFeather(feather: number): void {
    this.maskPlane.setPolygonFeather(feather);
  }

  setPolygonInvert(invert: boolean): void {
    this.maskPlane.setPolygonInvert(invert);
  }

  setShowBorderLines(show: boolean): void {
    this.maskPlane.setShowBorderLines(show);
  }

  dispose(): void {
    this.meshWarper.dispose();
    this.maskPlane.dispose();
    this.composer.dispose();
    this.polygonMask?.dispose();
  }
}

export default ProjectionMapper;
