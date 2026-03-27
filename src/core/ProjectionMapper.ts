import * as THREE from 'three';
import { BezierMask, type BezierNode } from '../mask/BezierMask';
import { MeshWarper, MeshWarperConfig } from '../warp/MeshWarper';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import projectionFragmentShader from '../shaders/projection.frag';
import { calculateGridPoints } from '../warp/geometry';

export const GUI_STORAGE_KEY = 'projection-mapper-gui-settings';

/** Split a cubic Bézier into two best-fit quadratic segments by subdividing at t=0.5. */
function cubicToTwoQuadratics(
  p0: THREE.Vector2,
  p1: THREE.Vector2,
  p2: THREE.Vector2,
  p3: THREE.Vector2,
): [
  { p0: THREE.Vector2; p1: THREE.Vector2; p2: THREE.Vector2 },
  { p0: THREE.Vector2; p1: THREE.Vector2; p2: THREE.Vector2 },
] {
  const lerp = (a: THREE.Vector2, b: THREE.Vector2, t: number) =>
    new THREE.Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);

  // De Casteljau subdivision at t = 0.5
  const q0 = lerp(p0, p1, 0.5);
  const q1 = lerp(p1, p2, 0.5);
  const q2 = lerp(p2, p3, 0.5);
  const r0 = lerp(q0, q1, 0.5);
  const r1 = lerp(q1, q2, 0.5);
  const m = lerp(r0, r1, 0.5); // point on curve at t=0.5

  // Best-fit quadratic control point for each cubic half:
  // Q1 = (3*(S1 + S2) - (S0 + S3)) / 4
  const qa1 = new THREE.Vector2((3 * (q0.x + r0.x) - (p0.x + m.x)) * 0.25, (3 * (q0.y + r0.y) - (p0.y + m.y)) * 0.25);
  const qb1 = new THREE.Vector2((3 * (r1.x + q2.x) - (m.x + p3.x)) * 0.25, (3 * (r1.y + q2.y) - (m.y + p3.y)) * 0.25);

  return [
    { p0: p0.clone(), p1: qa1, p2: m },
    { p0: m.clone(), p1: qb1, p2: p3.clone() },
  ];
}

function fastCubicToTwoQuadratics(
  p0: { u: number; v: number },
  p1: { u: number; v: number },
  p2: { u: number; v: number },
  p3: { u: number; v: number },
  targetA: THREE.Vector2[], // [p0, p1, p2] Segment 1
  targetB: THREE.Vector2[], // [p0, p1, p2] Segment 2
): void {
  const q0x = (p0.u + p1.u) * 0.5;
  const q0y = (p0.v + p1.v) * 0.5;
  const q1x = (p1.u + p2.u) * 0.5;
  const q1y = (p1.v + p2.v) * 0.5;
  const q2x = (p2.u + p3.u) * 0.5;
  const q2y = (p2.v + p3.v) * 0.5;

  const r0x = (q0x + q1x) * 0.5;
  const r0y = (q0y + q1y) * 0.5;
  const r1x = (q1x + q2x) * 0.5;
  const r1y = (q1y + q2y) * 0.5;

  const mx = (r0x + r1x) * 0.5;
  const my = (r0y + r1y) * 0.5;

  const qa1x = (3 * (q0x + r0x) - (p0.u + mx)) * 0.25;
  const qa1y = (3 * (q0y + r0y) - (p0.v + my)) * 0.25;
  const qb1x = (3 * (r1x + q2x) - (mx + p3.u)) * 0.25;
  const qb1y = (3 * (r1y + q2y) - (my + p3.v)) * 0.25;

  targetA[0].set(p0.u, p0.v);
  targetA[1].set(qa1x, qa1y);
  targetA[2].set(mx, my);

  targetB[0].set(mx, my);
  targetB[1].set(qb1x, qb1y);
  targetB[2].set(p3.u, p3.v);
}

export interface ImageSettings {
  maskEnabled: boolean;
  feather: number;
  tonemap: boolean;
  gamma: number;
  contrast: number;
  hue: number;
}

export const DEFAULT_IMAGE_SETTINGS: Readonly<ImageSettings> = {
  maskEnabled: false,
  feather: 0.05,
  tonemap: false,
  gamma: 1.0,
  contrast: 1.0,
  hue: 0.0,
};

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
  planeScale?: number;
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
    uMaskEnabled: { value: boolean };
    uFeather: { value: number };
    uTonemap: { value: boolean };
    uGamma: { value: number };
    uContrast: { value: number };
    uHue: { value: number };
    uBezierMaskEnabled: { value: boolean };
    uBezierSegmentCount: { value: number };
    uSegP0: { value: THREE.Vector2[] };
    uSegP1: { value: THREE.Vector2[] };
    uSegP2: { value: THREE.Vector2[] };
    uBezierFeather: { value: number };
  };

  private bezierMask: BezierMask | null = null;

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
    this.worldHeight = 10;
    this.worldWidth = 10 * aspectRatio;

    const DEFAULT_MIN_GRID_WARP_POINTS = 4;
    const DEFAULT_PLANE_SCALE = 0.5;
    const DEFAULT_SEGMENTS = 50;
    const DEFAULT_AA = true;

    const gridControlPoints = this.getGridControlPoints(config, aspectRatio, DEFAULT_MIN_GRID_WARP_POINTS);

    this.config = {
      segments: config.segments ?? DEFAULT_SEGMENTS,
      gridControlPoints,
      antialias: config.antialias ?? DEFAULT_AA,
      planeScale: config.planeScale ?? DEFAULT_PLANE_SCALE,
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
      uMaskEnabled: { value: DEFAULT_IMAGE_SETTINGS.maskEnabled },
      uFeather: { value: DEFAULT_IMAGE_SETTINGS.feather },
      uTonemap: { value: DEFAULT_IMAGE_SETTINGS.tonemap },
      uGamma: { value: DEFAULT_IMAGE_SETTINGS.gamma },
      uContrast: { value: DEFAULT_IMAGE_SETTINGS.contrast },
      uHue: { value: DEFAULT_IMAGE_SETTINGS.hue },
      uBezierMaskEnabled: { value: false },
      uBezierSegmentCount: { value: 0 },
      uSegP0: { value: Array.from({ length: 16 }, () => new THREE.Vector2()) },
      uSegP1: { value: Array.from({ length: 16 }, () => new THREE.Vector2()) },
      uSegP2: { value: Array.from({ length: 16 }, () => new THREE.Vector2()) },
      uBezierFeather: { value: 0.01 },
    };

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

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    if (this.config.antialias) {
      this.composer.addPass(new SMAAPass());
    }
  }

  // Use saved grid size from GUI settings if available, so MeshWarper
  // is created with the correct grid size before loading stored control points
  private getGridControlPoints(
    config: ProjectionMapperConfig,
    aspectRatio: number,
    DEFAULT_MIN_GRID_WARP_POINTS: number,
  ) {
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
      gridControlPoints = gridControlPoints ?? calculateGridPoints(aspectRatio, DEFAULT_MIN_GRID_WARP_POINTS);
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
    if (this.bezierMask) {
      this.bezierMask.updateTransformedPositions(
        (x, y) => this.meshWarper.applyPerspectiveTransform(x, y),
        (x, y) => this.meshWarper.applyInversePerspectiveTransform(x, y),
      );
      this.bezierMask.updateControlPointsScale(pixelToWorld);
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
    if (settings.maskEnabled !== undefined) this.uniforms.uMaskEnabled.value = settings.maskEnabled;
    if (settings.feather !== undefined) this.uniforms.uFeather.value = settings.feather;
    if (settings.tonemap !== undefined) this.uniforms.uTonemap.value = settings.tonemap;
    if (settings.gamma !== undefined) this.uniforms.uGamma.value = settings.gamma;
    if (settings.contrast !== undefined) this.uniforms.uContrast.value = settings.contrast;
    if (settings.hue !== undefined) this.uniforms.uHue.value = settings.hue;
  }

  getImageSettings(): ImageSettings {
    return {
      maskEnabled: this.uniforms.uMaskEnabled.value,
      feather: this.uniforms.uFeather.value,
      tonemap: this.uniforms.uTonemap.value,
      gamma: this.uniforms.uGamma.value,
      contrast: this.uniforms.uContrast.value,
      hue: this.uniforms.uHue.value,
    };
  }

  private updateCameraFrustum(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const windowAspect = width / height;
    const planeAspect = this.worldWidth / this.worldHeight;
    const scale = 1 / this.config.planeScale;

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
  }

  isWarpEnabled(): boolean {
    return this.meshWarper.getShouldWarp();
  }

  setPlaneScale(scale: number): void {
    this.config.planeScale = scale;
    this.updateCameraFrustum();
  }

  getPlaneScale(): number {
    return this.config.planeScale;
  }

  setCameraOffset(x: number, y: number): void {
    this.camera.position.x = x;
    this.camera.position.y = y;
  }

  getCameraOffset(): { x: number; y: number } {
    return { x: this.camera.position.x, y: this.camera.position.y };
  }

  reset(): void {
    this.meshWarper.resetToDefault();
    // Clear GUI settings so visibility and grid size reset on reload
    localStorage.removeItem(GUI_STORAGE_KEY);
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.OrthographicCamera {
    return this.camera;
  }

  // MASKING

  addBezierMask(nodes?: BezierNode[], options?: { enabled?: boolean; feather?: number }): BezierMask {
    if (this.bezierMask) this.bezierMask.dispose();
    const mask = new BezierMask(
      nodes ?? BezierMask.defaultNodes(),
      this.worldWidth,
      this.worldHeight,
      this.scene,
      this.camera,
      this.renderer,
      options,
    );
    mask.onChanged = () => this.syncBezierMaskUniforms();
    this.bezierMask = mask;
    this.syncBezierMaskUniforms();
    return mask;
  }

  removeBezierMask(): void {
    if (!this.bezierMask) return;
    this.bezierMask.dispose();
    this.bezierMask = null;
    this.uniforms.uBezierMaskEnabled.value = false;
    this.uniforms.uBezierSegmentCount.value = 0;
  }

  getBezierMask(): BezierMask | null {
    return this.bezierMask;
  }

  private syncBezierMaskUniforms(): void {
    const mask = this.bezierMask;
    if (!mask || !mask.enabled) {
      this.uniforms.uBezierMaskEnabled.value = false;
      this.uniforms.uBezierSegmentCount.value = 0;
      return;
    }
    const nodes = mask.nodes;
    const N = Math.min(nodes.length, 8);
    const uv = (p: { u: number; v: number }) => new THREE.Vector2(p.u, p.v);

    let idx = 0;
    for (let i = 0; i < N; i++) {
      const node = nodes[i];
      const nextNode = nodes[(i + 1) % N];
      const [qa, qb] = cubicToTwoQuadratics(
        uv(node.anchor),
        uv(node.handleOut),
        uv(nextNode.handleIn),
        uv(nextNode.anchor),
      );
      this.uniforms.uSegP0.value[idx].copy(qa.p0);
      this.uniforms.uSegP1.value[idx].copy(qa.p1);
      this.uniforms.uSegP2.value[idx].copy(qa.p2);
      idx++;
      this.uniforms.uSegP0.value[idx].copy(qb.p0);
      this.uniforms.uSegP1.value[idx].copy(qb.p1);
      this.uniforms.uSegP2.value[idx].copy(qb.p2);
      idx++;
    }

    this.uniforms.uBezierMaskEnabled.value = true;
    this.uniforms.uBezierSegmentCount.value = idx;
    this.uniforms.uBezierFeather.value = mask.feather;
  }

  dispose(): void {
    this.bezierMask?.dispose();
    this.meshWarper.dispose();
    this.composer.dispose();
  }
}

export default ProjectionMapper;
