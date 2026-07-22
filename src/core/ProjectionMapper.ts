import * as THREE from 'three';
import { MeshWarper } from '../warp/MeshWarper';
import { WarpSurface } from '../warp/WarpSurface';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import projectionFragmentShader from '../shaders/projection.frag';
import { calculateGridPoints } from '../warp/geometry';
import { SurfacePicker } from './SurfacePicker';
import { OutputFrame } from './OutputFrame';
import { RenderOrder } from './RenderOrder';
import { SurfaceStore } from './SurfaceStore';
import { ProjectorView } from './ProjectorView';
import type { StoredSurface } from './SurfaceStore';
import { ListenerSet } from '../utils/ListenerSet';
import { clamp } from '../utils/math';
import {
  GUI_STORAGE_KEY,
  DEFAULT_IMAGE_SETTINGS,
  DEFAULT_EDGE_MASK,
  DEFAULT_POLYGON_MASK_SETTINGS,
  DEFAULTS,
  DEFAULT_SURFACE_ID,
  DEFAULT_UV_RECT,
  STORAGE_VERSION,
  scopedStorageKey,
  planeSizeFor,
  textureResolution,
} from './defaults';
import type {
  ImageSettings,
  EdgeMaskSettings,
  PolygonMaskSettings,
  UvRect,
  Resolution,
} from './defaults';
import { PolygonMask, type UVPoint } from '../mask/PolygonMask';

export { GUI_STORAGE_KEY, DEFAULT_IMAGE_SETTINGS };
export type { ImageSettings };

export interface ProjectionMapperConfig {
  /**
   * The output canvas in pixels: the region the projector frames and surfaces are
   * arranged inside. Defaults to the input texture's size, so a single-surface app
   * never has to set it. Its aspect drives the camera and the boundary the
   * controller draws — a 9:16 projector passes a 9:16 resolution here.
   */
  resolution?: { width: number; height: number };
  /**
   * Shape given to surfaces that do not declare their own, including the first
   * one. Defaults to `resolution`, which is right when a surface fills the output
   * — but an atlas layout wants the region's shape here, not the canvas's.
   */
  surfaceResolution?: Resolution;
  /** Number of mesh segments for smooth warping (default: 50) */
  segments?: number;
  /** Grid control points for fine warping (default: 5x5) */
  gridControlPoints?: { x: number; y: number };
  /** Enable anti-aliasing (default: true) */
  antialias?: boolean;
  /** Scale factor for how much of the window the plane fills (default: 0.9 = 90%) */
  zoom?: number;
  /**
   * Whether this mapper can hold more than one surface (default: true).
   *
   * With `false` the mapper is a single-surface projection mapper: addSurface()
   * is refused, extra surfaces in storage are ignored rather than restored, and
   * canvas selection is not installed. The built-in GUI drops its surface and
   * input-crop controls to match.
   */
  multiSurface?: boolean;
  /** Click a surface to select it, drag its body to move it (default: true) */
  canvasSelection?: boolean;
  /** Zoom the preview with the wheel or a trackpad pinch (default: true) */
  wheelZoom?: boolean;
  /**
   * Scopes all persisted calibration to this app. Required whenever more than
   * one app is served from the same origin — they share localStorage, so
   * without it they overwrite each other's surfaces and warp points.
   */
  appId?: string;
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
  private view: ProjectorView;
  private surfaces: WarpSurface[] = [];
  private activeSurfaceId: string = DEFAULT_SURFACE_ID;
  private composer: EffectComposer;
  private clock: THREE.Clock;
  private picker: SurfacePicker | null = null;
  private surfaceStore: SurfaceStore;
  private outputFrame: OutputFrame | null = null;

  /** Handle visibility applied to whichever surface is active */
  private controlsVisibility = { grid: true, corners: true, outline: true };
  private dragEnabled = true;
  private shouldWarp = true;
  private polygonHandlesEnabled = true;

  private surfacesChanged = new ListenerSet<[]>();
  private activeSurfaceChanged = new ListenerSet<[surfaceId: string]>();
  private polygonNodesChanged = new ListenerSet<[surfaceId: string]>();
  private surfaceTransformed = new ListenerSet<[surfaceId: string]>();

  /**
   * Notifications take listeners rather than a single assigned handler: the GUI
   * subscribes to several of these, and a host app must be able to listen
   * alongside it. Each returns a function that unsubscribes.
   */

  /** A surface was added or removed */
  onSurfacesChanged(listener: () => void): () => void {
    return this.surfacesChanged.add(listener);
  }

  /** The selected surface changed, including via canvas clicks */
  onActiveSurfaceChanged(listener: (surfaceId: string) => void): () => void {
    return this.activeSurfaceChanged.add(listener);
  }

  /** A surface's polygon mask nodes changed (drag, insert, delete, reset) */
  onPolygonNodesChanged(listener: (surfaceId: string) => void): () => void {
    return this.polygonNodesChanged.add(listener);
  }

  /**
   * A surface was moved as a whole, by a body drag or setPosition. Handle drags
   * are reported by their own DragControls; this covers everything else that
   * changes a surface's geometry.
   */
  onSurfaceTransformed(listener: (surfaceId: string) => void): () => void {
    return this.surfaceTransformed.add(listener);
  }

  /** The preview zoom changed, including by wheel — so a pane can follow it */
  onZoomChanged(listener: (zoom: number) => void): () => void {
    return this.view.onZoomChanged(listener);
  }

  /** Genuinely output-wide uniforms, shared by reference across every surface material */
  private uniforms: {
    uBuffer: { value: THREE.Texture };
    uBufferResolution: { value: THREE.Vector2 };
    uTime: { value: number };
    uShowTestCard: { value: boolean };
    uShowControlLines: { value: boolean };
  };

  private whiteOut = false;

  /** Resolution in pixels, passed through to shaders */
  private resolution: { width: number; height: number };
  /** Output canvas in world units, derived from the resolution's aspect */
  private worldWidth: number;
  private worldHeight: number;

  private config: Required<Omit<ProjectionMapperConfig, 'resolution' | 'appId'>> & { appId?: string };

  private get camera(): THREE.OrthographicCamera {
    return this.view.camera;
  }

  constructor(renderer: THREE.WebGLRenderer, inputTexture: THREE.Texture, config: ProjectionMapperConfig = {}) {
    this.renderer = renderer;
    this.clock = new THREE.Clock();

    // Resolution in pixels (for textures/shaders)
    // User can overwrite the Resolution which calculates a different aspect ratio
    this.resolution = config.resolution ?? textureResolution(inputTexture);

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
      surfaceResolution: config.surfaceResolution ?? this.resolution,
      multiSurface: config.multiSurface ?? true,
      canvasSelection: config.canvasSelection ?? true,
      wheelZoom: config.wheelZoom ?? true,
      appId: config.appId,
    };

    this.scene = new THREE.Scene();

    this.view = new ProjectorView({
      domElement: this.renderer.domElement,
      planeSize: { width: this.worldWidth, height: this.worldHeight },
      zoom: this.config.zoom,
      wheelZoom: this.config.wheelZoom,
    });

    this.uniforms = {
      uBuffer: { value: inputTexture },
      uBufferResolution: {
        value: new THREE.Vector2(this.resolution.width, this.resolution.height),
      },
      uTime: { value: 0 },
      uShowTestCard: { value: false },
      uShowControlLines: { value: true },
    };

    this.surfaceStore = new SurfaceStore(this.config.appId);
    const stored = this.surfaceStore.read();
    const initialSurfaces: StoredSurface[] = stored?.surfaces?.length
      ? stored.surfaces
      : [{ id: DEFAULT_SURFACE_ID, uvRect: { ...DEFAULT_UV_RECT } }];

    // Extra surfaces left in storage must not come back when the mode is off
    const restorable = this.config.multiSurface ? initialSurfaces : initialSurfaces.slice(0, 1);

    for (const record of restorable) {
      const surface = this.createSurface(record);
      // A polygon mask saved in a previous session comes back with its surface
      surface.restorePolygonMask();
      this.surfaces.push(surface);
    }

    this.activeSurfaceId =
      stored?.activeId && this.getSurface(stored.activeId) ? stored.activeId : this.surfaces[0].id;
    this.applyRenderOrder();
    this.applyActiveSurface();

    // Nothing to select or arrange when there can only ever be one surface
    if (this.config.canvasSelection && this.config.multiSurface) {
      this.picker = new SurfacePicker({
        domElement: this.renderer.domElement,
        camera: this.camera,
        getSurfaces: () => this.surfaces,
        setActiveSurface: (id) => this.setActiveSurface(id),
        onSurfaceMoved: () => this.saveSurfaces(),
      });
      this.applyPickerEnabled();
    }

    // Only meaningful with several surfaces to arrange inside the output
    if (this.config.multiSurface) {
      this.outputFrame = new OutputFrame(this.scene, this.worldWidth, this.worldHeight);
      this.outputFrame.setVisible(this.controlsVisibility.outline);
    }

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
        const savedGui = localStorage.getItem(scopedStorageKey(GUI_STORAGE_KEY, config.appId));
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

  // A surface's own persisted grid size wins so calibration restores exactly;
  // the mapper config value only seeds the default surface
  private createSurface(record: StoredSurface): WarpSurface {
    const { id, uvRect, edgeMask, polygonMask, imageSettings } = record;
    const storedGridSize = MeshWarper.getStoredGridSize(WarpSurface.storageNamespace(id, this.config.appId));

    const resolution = record.resolution ?? this.config.surfaceResolution;
    const plane = planeSizeFor(resolution);

    const gridControlPoints =
      storedGridSize ??
      (id === DEFAULT_SURFACE_ID
        ? { ...this.config.gridControlPoints }
        : calculateGridPoints(plane.width / plane.height, DEFAULTS.minGridWarpPoints));

    const surface = new WarpSurface({
      id,
      appId: this.config.appId,
      resolution,
      uvRect,
      edgeMask,
      polygonMask,
      imageSettings,
      warper: {
        width: plane.width,
        height: plane.height,
        widthSegments: this.config.segments,
        heightSegments: this.config.segments,
        gridControlPoints,
        scene: this.scene,
        camera: this.camera,
        renderer: this.renderer,
        fragmentShader: projectionFragmentShader,
        globalUniforms: this.uniforms,
        globalDefines: {},
        bufferTexture: this.uniforms.uBuffer.value,
      },
      mask: {
        worldWidth: plane.width,
        worldHeight: plane.height,
        segments: this.config.segments,
        scene: this.scene,
        camera: this.camera,
        renderer: this.renderer,
      },
    });

    surface.onPolygonNodesChanged = () => this.polygonNodesChanged.emit(surface.id);
    surface.onTransformed = () => this.surfaceTransformed.emit(surface.id);
    surface.setShouldWarp(this.shouldWarp);
    return surface;
  }

  /**
   * Stack surfaces in list order, last on top. Without this they all sit at the
   * same depth and the same render order, and which one wins an overlap falls out
   * of three's sort being stable — true today, but nothing states it.
   */
  private applyRenderOrder(): void {
    this.surfaces.forEach((surface, index) => surface.setRenderOrder(RenderOrder.CONTENT + index));
  }

  /**
   * Move a surface within the overlap stack. Positive moves it towards the front,
   * and it stops at either end rather than wrapping.
   */
  moveSurface(id: string, offset: number): void {
    const from = this.surfaces.findIndex((surface) => surface.id === id);
    if (from === -1) return;

    const to = clamp(from + offset, 0, this.surfaces.length - 1);
    if (to === from) return;

    const [moved] = this.surfaces.splice(from, 1);
    this.surfaces.splice(to, 0, moved);

    this.applyRenderOrder();
    this.saveSurfaces();
    this.surfacesChanged.emit();
  }

  /** Front to back, the order they are drawn and the order overlaps resolve in */
  getSurfaceIndex(id: string): number {
    return this.surfaces.findIndex((surface) => surface.id === id);
  }

  /** Every surface id, front to back */
  getSurfaceOrder(): string[] {
    return this.surfaces.map((surface) => surface.id);
  }

  /**
   * Reorder to match a list of ids, for a receiving window. Ids it does not know
   * are ignored and surfaces the list omits keep their relative order at the
   * back, so a partial or stale list cannot drop a surface.
   */
  setSurfaceOrder(surfaceIds: string[]): void {
    const ordered = surfaceIds
      .map((id) => this.surfaces.find((surface) => surface.id === id))
      .filter((surface): surface is WarpSurface => !!surface);

    const remaining = this.surfaces.filter((surface) => !ordered.includes(surface));
    const next = [...ordered, ...remaining];
    if (next.every((surface, index) => surface === this.surfaces[index])) return;

    this.surfaces = next;
    this.applyRenderOrder();
    this.saveSurfaces();
    this.surfacesChanged.emit();
  }

  /** Only the active surface shows handles and accepts drags */
  private applyActiveSurface(): void {
    for (const surface of this.surfaces) {
      const warper = surface.getWarper();
      const isActive = surface.id === this.activeSurfaceId;

      if (isActive) {
        warper.setGridPointsVisible(this.controlsVisibility.grid);
        warper.setCornerPointsVisible(this.controlsVisibility.corners);
        warper.setDragEnabled(this.dragEnabled);
      } else {
        warper.setGridPointsVisible(false);
        warper.setCornerPointsVisible(false);
        warper.setDragEnabled(false);
      }

      // Inactive surfaces keep a dimmed outline so they stay clickable targets
      warper.setOutlineVisible(this.controlsVisibility.outline);
      surface.setActive(isActive);
      surface.setHandlesVisible(this.polygonHandlesEnabled && this.shouldWarp);
    }
    this.applyPickerEnabled();
  }

  /**
   * Canvas selection is pointless once everything is hidden or drags are off.
   * Gated on *any* control being visible rather than the outline alone —
   * hiding one handle type is a styling choice, not a request to stop editing.
   */
  private applyPickerEnabled(): void {
    const anyControlVisible =
      this.controlsVisibility.grid || this.controlsVisibility.corners || this.controlsVisibility.outline;
    this.picker?.setEnabled(this.dragEnabled && anyControlVisible);
    // The frame is a calibration aid, never part of the projected output
    this.outputFrame?.setVisible(this.controlsVisibility.outline && this.dragEnabled);
  }

  /** Can this mapper hold more than one surface? */
  isMultiSurface(): boolean {
    return this.config.multiSurface;
  }

  addSurface(options: { id?: string; uvRect?: UvRect; resolution?: Resolution } = {}): WarpSurface {
    if (!this.config.multiSurface) {
      console.warn('ProjectionMapper: addSurface() ignored because multiSurface is disabled');
      return this.surfaces[0];
    }
    const id = options.id ?? this.nextSurfaceId();
    const existing = this.getSurface(id);
    if (existing) return existing;

    const surface = this.createSurface({
      id,
      uvRect: { ...DEFAULT_UV_RECT, ...options.uvRect },
      resolution: options.resolution,
    });
    this.surfaces.push(surface);
    this.activeSurfaceId = id;
    this.applyRenderOrder();
    this.applyActiveSurface();
    this.saveSurfaces();
    this.surfacesChanged.emit();
    this.activeSurfaceChanged.emit(id);
    return surface;
  }

  removeSurface(id: string): void {
    if (this.surfaces.length <= 1) return;
    const index = this.surfaces.findIndex((s) => s.id === id);
    if (index === -1) return;

    const [removed] = this.surfaces.splice(index, 1);
    removed.clearStorage();
    removed.dispose();

    const selectionChanged = this.activeSurfaceId === id;
    if (selectionChanged) {
      this.activeSurfaceId = this.surfaces[0].id;
    }
    this.applyRenderOrder();
    this.applyActiveSurface();
    this.saveSurfaces();
    this.surfacesChanged.emit();
    if (selectionChanged) this.activeSurfaceChanged.emit(this.activeSurfaceId);
  }

  getSurfaces(): WarpSurface[] {
    return [...this.surfaces];
  }

  getSurface(id: string): WarpSurface | null {
    return this.surfaces.find((s) => s.id === id) ?? null;
  }

  getActiveSurface(): WarpSurface {
    return this.getSurface(this.activeSurfaceId) ?? this.surfaces[0];
  }

  setActiveSurface(id: string): void {
    if (!this.getSurface(id) || this.activeSurfaceId === id) return;
    this.activeSurfaceId = id;
    this.applyActiveSurface();
    this.saveSurfaces();
    // Selection is not a list change — onSurfacesChanged means membership changed
    this.activeSurfaceChanged.emit(id);
  }

  /** Surface the id names, or the active one when no id is given */
  private resolveSurface(surfaceId?: string): WarpSurface {
    return (surfaceId ? this.getSurface(surfaceId) : null) ?? this.getActiveSurface();
  }

  setUvRect(offsetX: number, offsetY: number, scaleX: number, scaleY: number, surfaceId?: string): void {
    this.resolveSurface(surfaceId).setUvRect(offsetX, offsetY, scaleX, scaleY);
    this.saveSurfaces();
  }

  getUvRect(surfaceId?: string): UvRect {
    return this.resolveSurface(surfaceId).getUvRect();
  }

  private nextSurfaceId(): string {
    const numericIds = this.surfaces.map((s) => Number(s.id)).filter((n) => Number.isInteger(n));
    return String(numericIds.length ? Math.max(...numericIds) + 1 : 0);
  }

  /** Storage scope for this mapper, so the GUI can namespace its own settings */
  getAppId(): string | undefined {
    return this.config.appId;
  }

  private saveSurfaces(): void {
    this.surfaceStore.write(
      this.activeSurfaceId,
      this.surfaces.map((surface) => ({
        id: surface.id,
        uvRect: surface.getUvRect(),
        resolution: surface.getResolution(),
        edgeMask: surface.getEdgeMask(),
        polygonMask: surface.getPolygonSettings(),
        imageSettings: surface.getImageSettings(),
      })),
    );
  }

  render(): void {
    if (this.whiteOut) {
      const savedColor = new THREE.Color();
      const savedAlpha = this.renderer.getClearAlpha();
      this.renderer.getClearColor(savedColor);
      this.renderer.setClearColor(0xffffff, 1);
      this.renderer.setRenderTarget(null);
      this.renderer.clear();
      this.renderer.setClearColor(savedColor, savedAlpha);
      return;
    }

    this.uniforms.uTime.value = this.clock.getElapsedTime();

    // Constant screen-pixel size: convert 1 pixel to world units
    const frustumWidth = this.camera.right - this.camera.left;
    const viewportWidth = this.renderer.domElement.clientWidth;
    const pixelToWorld = frustumWidth / viewportWidth;

    // Each surface's masks follow that surface's own perspective
    this.surfaces.forEach((surface) => surface.syncMasks(pixelToWorld));

    if (this.config.antialias == false) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    } else {
      this.composer.render();
    }
  }

  /**
   * Set the texture one surface samples, or the shared buffer for all of them
   * when no id is given. Each surface owns its own texture uniform, so a surface
   * can be given its own media without leaving the shared buffer behind.
   */
  setTexture(texture: THREE.Texture, surfaceId?: string): void {
    if (surfaceId) {
      this.resolveSurface(surfaceId).setTexture(texture);
      return;
    }
    this.uniforms.uBuffer.value = texture;
    this.surfaces.forEach((surface) => surface.setTexture(texture));
  }

  /** The shared input buffer, or one surface's own texture when an id is given */
  getTexture(surfaceId?: string): THREE.Texture {
    if (surfaceId) return this.resolveSurface(surfaceId).getTexture();
    return this.uniforms.uBuffer.value;
  }

  /**
   * Pixel size of the source texture, which is not the mapper's resolution:
   * an atlas buffer is usually larger than the region any one surface samples.
   * Render-target textures carry their size on `image` too, so both work.
   */
  getBufferResolution(surfaceId?: string): Resolution {
    return textureResolution(this.getTexture(surfaceId));
  }

  setShowTestCard(show: boolean): void {
    this.uniforms.uShowTestCard.value = show;
  }

  isShowingTestCard(): boolean {
    return this.uniforms.uShowTestCard.value;
  }

  setWhiteOut(show: boolean): void {
    this.whiteOut = show;
  }

  isWhiteOut(): boolean {
    return this.whiteOut;
  }

  setShowControlLines(show: boolean): void {
    this.uniforms.uShowControlLines.value = show;
  }

  isShowingControlLines(): boolean {
    return this.uniforms.uShowControlLines.value;
  }

  /**
   * Image adjustments for one surface — the active one unless given an id.
   * These are calibration controls: surfaces lit by different projectors need
   * different gamma and black/white points to match.
   *
   * @deprecated `maskEnabled` and `feather` are edge-mask settings, not image
   * ones; passing them here still works but prefer {@link setEdgeMask}.
   */
  setImageSettings(settings: Partial<ImageSettings & EdgeMaskSettings>, surfaceId?: string): void {
    if (settings.maskEnabled !== undefined || settings.feather !== undefined) {
      const current = this.getEdgeMask(surfaceId);
      this.setEdgeMask(
        settings.maskEnabled ?? current.maskEnabled,
        settings.feather ?? current.feather,
        surfaceId,
      );
    }
    this.resolveSurface(surfaceId).setImageSettings(settings);
    this.saveSurfaces();
  }

  getImageSettings(surfaceId?: string): ImageSettings {
    return this.resolveSurface(surfaceId).getImageSettings();
  }

  // --- per-surface edge feather ---------------------------------------------

  setEdgeMask(enabled: boolean, feather?: number, surfaceId?: string): void {
    this.resolveSurface(surfaceId).setEdgeFeather(enabled, feather);
    this.saveSurfaces();
  }

  getEdgeMask(surfaceId?: string): EdgeMaskSettings {
    return this.resolveSurface(surfaceId).getEdgeMask();
  }

  resize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.view.updateFrustum();
  }

  /** Active surface's warper — the single-surface facade */
  getWarper(): MeshWarper {
    return this.getActiveSurface().getWarper();
  }

  setControlsVisible(visible: boolean): void {
    this.setShowControlLines(visible);
    this.controlsVisibility = { grid: visible, corners: visible, outline: visible };
    this.applyActiveSurface();
  }

  setGridPointsVisible(visible: boolean): void {
    this.controlsVisibility.grid = visible;
    this.getWarper().setGridPointsVisible(visible);
    this.applyPickerEnabled();
  }

  setCornerPointsVisible(visible: boolean): void {
    this.controlsVisibility.corners = visible;
    this.getWarper().setCornerPointsVisible(visible);
    this.applyPickerEnabled();
  }

  /** Outlines are shared by all surfaces — they double as selection targets */
  setOutlineVisible(visible: boolean): void {
    this.controlsVisibility.outline = visible;
    this.surfaces.forEach((surface) => surface.getWarper().setOutlineVisible(visible));
    this.applyPickerEnabled();
  }

  setDragEnabled(enabled: boolean): void {
    this.dragEnabled = enabled;
    this.view.setInteractive(enabled); // a receive-only window does not zoom either
    this.applyActiveSurface();
  }

  setGridSize(x: number, y: number): void {
    this.getWarper().setGridSize(x, y);
  }

  setShouldWarp(enabled: boolean): void {
    this.shouldWarp = enabled;
    this.surfaces.forEach((surface) => surface.setShouldWarp(enabled));
    this.applyActiveSurface();
  }

  isWarpEnabled(): boolean {
    return this.shouldWarp;
  }

  setZoom(scale: number): void {
    this.view.setZoom(scale);
  }

  getZoom(): number {
    return this.view.getZoom();
  }

  setCameraOffset(x: number, y: number): void {
    this.view.setOffset(x, y);
  }

  getCameraOffset(): { x: number; y: number } {
    return this.view.getOffset();
  }

  /**
   * The mapper's resolution: the output/view aspect the camera frames, and the
   * default for surfaces that do not declare their own. A surface's resolution
   * is its shape in the output and is independent of the input buffer's pixels
   * — see planeSizeFor.
   */
  getResolution(): Resolution {
    return { ...this.resolution };
  }

  /**
   * Resize the output canvas — the region the projector frames and surfaces are
   * arranged within.
   *
   * Surfaces keep their own resolutions and world positions, so nothing is
   * rebuilt and no warp is touched; the canvas grows or shrinks around them.
   * They will occupy a different fraction of the projector afterwards, the same
   * as changing a projector's resolution in real life, so this is a set-once
   * decision rather than something to drag.
   */
  setOutputResolution(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.resolution = { width, height };

    const plane = planeSizeFor(this.resolution);
    this.worldWidth = plane.width;
    this.worldHeight = plane.height;

    this.outputFrame?.setSize(this.worldWidth, this.worldHeight);
    this.view.setPlaneSize(this.worldWidth, this.worldHeight);
  }

  /** Reset one surface's warp, or all surfaces when no id is given */
  reset(surfaceId?: string): void {
    if (surfaceId) {
      this.getSurface(surfaceId)?.getWarper().resetToDefault();
      return;
    }
    this.surfaces.forEach((surface) => surface.getWarper().resetToDefault());
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.OrthographicCamera {
    return this.camera;
  }

  // --- per-surface polygon mask ---------------------------------------------
  // All of these act on the active surface unless given an explicit id.

  addPolygonMask(nodes?: UVPoint[], surfaceId?: string): PolygonMask {
    const mask = this.resolveSurface(surfaceId).addPolygonMask(nodes);
    this.saveSurfaces();
    return mask;
  }

  resetPolygonMask(surfaceId?: string): void {
    this.resolveSurface(surfaceId).resetPolygonMask();
  }

  removePolygonMask(surfaceId?: string): void {
    this.resolveSurface(surfaceId).removePolygonMask();
    this.saveSurfaces();
  }

  getPolygonMask(surfaceId?: string): PolygonMask | null {
    return this.resolveSurface(surfaceId).getPolygonMask();
  }

  getPolygonMaskFullState(
    surfaceId?: string,
  ): { nodes: UVPoint[]; enabled: boolean; inverted: boolean; feather: number } | null {
    return this.resolveSurface(surfaceId).getPolygonMaskState();
  }

  setPolygonMaskEnabled(enabled: boolean, surfaceId?: string): void {
    this.resolveSurface(surfaceId).setPolygonMaskEnabled(enabled);
    this.saveSurfaces();
  }

  setPolygonFeather(feather: number, surfaceId?: string): void {
    this.resolveSurface(surfaceId).setPolygonFeather(feather);
    this.saveSurfaces();
  }

  setPolygonInvert(invert: boolean, surfaceId?: string): void {
    this.resolveSurface(surfaceId).setPolygonInvert(invert);
    this.saveSurfaces();
  }

  /** Toggle polygon anchor handles without changing the mask itself */
  setPolygonHandlesVisible(visible: boolean): void {
    this.polygonHandlesEnabled = visible;
    this.applyActiveSurface();
  }

  dispose(): void {
    this.view.dispose();
    this.picker?.dispose();
    this.outputFrame?.dispose();
    this.surfaces.forEach((surface) => surface.dispose());
    this.composer.dispose();
  }
}

export default ProjectionMapper;
