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
import { HandleKeyboard } from './HandleKeyboard';
import { OffscreenHandleMarkers } from './OffscreenHandleMarkers';
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
  /** Grid control points for fine warping (default: derived from the aspect ratio) */
  gridControlPoints?: { x: number; y: number };
  /** Enable anti-aliasing (default: true) */
  antialias?: boolean;
  /**
   * How much of the window the output canvas fills (default: 0.75). Below 1
   * pulls back to show world beyond the canvas, which is what a controller wants
   * and what a standalone output window gets too. A synced projector window does
   * not keep this: `WindowSync` forces 1 in PROJECTOR mode, where the view is
   * the projection and must fill the canvas exactly.
   */
  zoom?: number;
  /**
   * Is this window the projector itself, rather than a preview of it?
   * (default: false)
   *
   * The difference is whether the view can lie. A controller previews: it pulls
   * back to show world beyond the output canvas, draws the canvas boundary so
   * you know where the edge is, and scales that view to whatever size its window
   * happens to be. An output window cannot do any of that — what it draws is
   * what the projector emits, so the window edge already is the canvas boundary,
   * which is why it never draws one.
   */
  outputWindow?: boolean;
  /**
   * Whether this mapper can hold more than one surface (default: false).
   *
   * The default is the single-surface mapper: one mesh showing one scene, which
   * is what most apps want and what needs the least said about it. addSurface()
   * is refused, extra surfaces in storage are ignored rather than restored, and
   * canvas selection is not installed. The built-in GUI drops its surface and
   * input-crop controls to match.
   *
   * `true` opts into several surfaces arranged inside one output, which is the
   * atlas case: each surface takes its pixels from a region of the input, so a
   * layout needs `surfaceResolution` as well.
   */
  multiSurface?: boolean;
  //
  // Interaction capabilities
  // ------------------------
  // Which on-screen editing affordances are live. Each is an independent
  // `boolean | undefined`: leave it unset and it derives from the mode flags
  // above (`multiSurface`, `outputWindow`); pass a value and that value wins.
  // The derivations encode real defaults — a lone surface previewed in a
  // controller has nothing to scale against, so scaling is off there — but a
  // host app embedding the mapper can override any of them without disturbing
  // the rest. Each also has a runtime setter (`setSurfaceScaleEnabled`, ...).
  // A new capability added here gets its own derived default, so it can never
  // change what existing configs resolve to.
  //
  /**
   * Draw the dashed boundary of the output canvas on a controller
   * (default: follows `multiSurface`).
   *
   * It answers "which of my surfaces actually get projected" while the view is
   * pulled back past the output. With several surfaces that question is the
   * whole job, so the frame is on. With one it mostly reads as chrome in a host
   * app, so it is off, and a host that wants its own framing gets no argument
   * from the library.
   *
   * `true` with one surface is worth it while calibrating, because a corner
   * warped inwards leaves the quad no longer marking the canvas edge, and at
   * zoom 0.5 nothing else says where the projector stops. `false` with several
   * surfaces suppresses it entirely.
   *
   * This hides only the frame. Surface outlines, handles and selection are
   * untouched, unlike `setOutlineVisible(false)`, which turns off the outlines
   * with it. Ignored on an output window, which never draws the frame anyway.
   */
  canvasBoundary?: boolean;
  /**
   * Select a surface by clicking it and move it by dragging its body
   * (default: follows `multiSurface`).
   *
   * On is for arranging surfaces against each other. A single surface has
   * nothing to arrange, so it is off by default even in an output window. The
   * exception is aligning one surface to a physical object, where moving the
   * quad moves light on a wall — that app passes `surfaceMove: true` to opt in.
   */
  surfaceMove?: boolean;
  /**
   * Show the scale handle on the active surface (default: follows `multiSurface`).
   *
   * Same reasoning as `surfaceMove`: a single surface fills the output and has
   * nothing to be a different size than, so shrinking it only loses projector
   * pixels. Zoom is the control for that. An output window aligning to a
   * physical object opts in with `surfaceScale: true`.
   */
  surfaceScale?: boolean;
  /** @deprecated Alias of `surfaceMove`, kept for back-compat. Prefer `surfaceMove`. */
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
  private handleKeyboard: HandleKeyboard;
  private offscreenMarkers: OffscreenHandleMarkers;

  /** Handle visibility applied to whichever surface is active */
  private controlsVisibility = { grid: true, corners: true, outline: true };
  private dragEnabled = true;
  /**
   * Resolved interaction capabilities: the single source of truth for which
   * editing affordances are live. Seeded once from config over the derived
   * defaults, mutated only through the setters, and reapplied to every surface
   * including ones added later — so a runtime override is never clobbered by a
   * new surface. Held apart from `controlsVisibility` so, for instance, hiding
   * the frame leaves the surface outlines alone.
   */
  private interaction!: { canvasBoundary: boolean; surfaceMove: boolean; surfaceScale: boolean };
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

  private config: Required<
    Omit<
      ProjectionMapperConfig,
      'resolution' | 'appId' | 'canvasBoundary' | 'surfaceMove' | 'surfaceScale' | 'canvasSelection'
    >
  > & { appId?: string };

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

    // Declared before the rest of the config because several of them derive
    // from it — an output window and a controller want different defaults
    const outputWindow = config.outputWindow ?? false;
    const multiSurface = config.multiSurface ?? false;

    this.config = {
      segments: config.segments ?? DEFAULTS.segments,
      gridControlPoints,
      antialias: config.antialias ?? DEFAULTS.antialias,
      outputWindow,
      // One default for both roles. A real projector window does not keep it:
      // WindowSync forces zoom 1 in PROJECTOR mode so the output fills the canvas
      // exactly. This value is what a controller, or a standalone output window,
      // starts at.
      zoom: config.zoom ?? DEFAULTS.zoom,
      surfaceResolution: config.surfaceResolution ?? this.resolution,
      multiSurface,
      wheelZoom: config.wheelZoom ?? true,
      appId: config.appId,
    };

    // Interaction capabilities: an explicit value wins, otherwise derive. All
    // three follow multiSurface. Arranging surfaces against each other is what
    // move and scale are for, and a lone surface has nothing to arrange or to be
    // a different size than. An output window aligning one surface to a physical
    // object is the exception, and it opts in with surfaceMove/surfaceScale
    // rather than getting them by being an output window. canvasSelection is the
    // old name for surfaceMove and still honoured.
    this.interaction = {
      canvasBoundary: config.canvasBoundary ?? multiSurface,
      surfaceMove: config.surfaceMove ?? config.canvasSelection ?? multiSurface,
      surfaceScale: config.surfaceScale ?? multiSurface,
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

    // Always built, gated at runtime by the `surfaceMove` capability rather than
    // by whether it exists. A disabled picker is inert (its pointer handlers bail
    // on the enabled flag), so building it unconditionally costs nothing and lets
    // a host app turn body-drag on later without reconstructing anything.
    this.picker = new SurfacePicker({
      domElement: this.renderer.domElement,
      camera: this.camera,
      getSurfaces: () => this.surfaces,
      setActiveSurface: (id) => this.setActiveSurface(id),
      onSurfaceMoved: () => this.saveSurfaces(),
      onPressedAwayFromHandles: () => this.getActiveSurface().getWarper().clearSelectedHandle(),
    });

    // Arrow-key nudging, and markers for the handles it can push off screen.
    // Both are calibration tools rather than multi-surface ones: a single surface
    // in a single window is exactly the case that cannot drag a corner past the
    // window edge, and cannot zoom out to go looking for it either.
    this.handleKeyboard = new HandleKeyboard({
      getSurface: () => this.getActiveSurface(),
      getPixelToWorld: () => this.pixelToWorld(),
      isEnabled: () => this.handleControlsInteractive(),
    });

    this.offscreenMarkers = new OffscreenHandleMarkers({
      canvas: this.renderer.domElement,
      camera: this.camera,
      getSurface: () => this.getActiveSurface(),
      isEnabled: () => this.handleControlsInteractive(),
    });

    // Only a preview can need the canvas boundary: it shows world beyond the
    // output, so the edge has to be marked. An output window's own edge already
    // is that boundary, so it never builds one.
    //
    // Whether a preview *shows* it is a second question, answered by
    // canvasBoundary, which follows multiSurface by default. With one surface
    // the frame reads as chrome in a host app that has its own framing.
    //
    // The cost of that default is real and worth stating: a lone surface starts
    // out coinciding with the canvas, but pull a corner in and the quad stops
    // marking the edge, leaving nothing at zoom 0.5 to say how far it moved.
    // Single-surface apps doing serious calibration should pass
    // canvasBoundary: true.
    if (!this.config.outputWindow) {
      // Built even when switched off, so the setter can bring it back without
      // rebuilding the line. A hidden Line2 costs nothing to keep around.
      this.outputFrame = new OutputFrame(this.scene, this.worldWidth, this.worldHeight);
    }

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    if (this.config.antialias) {
      this.composer.addPass(new SMAAPass());
    }

    // Converge every capability now that the picker, frame and surfaces all
    // exist. One call, one source of truth.
    this.applyInteraction();
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

    // The scale handle is set from the resolved capability by applyInteraction,
    // which every creation path calls through applyActiveSurface. Setting it here
    // too would just be undone, and used to clobber a runtime override on add.

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
    this.applyInteraction();
  }

  /**
   * Push the resolved interaction capabilities onto the picker, the frame and
   * every surface. The one place any of them is applied, so a setter is just a
   * field write followed by this, and a surface added later is covered the same
   * as the rest.
   *
   * Each capability is still ANDed with the state that would make it pointless:
   * body-drag and the frame need something visible and drags on, and the scale
   * handle is ANDed inside the warper with its corner points, so an inactive
   * surface (corners hidden) shows none.
   */
  private applyInteraction(): void {
    const anyControlVisible =
      this.controlsVisibility.grid || this.controlsVisibility.corners || this.controlsVisibility.outline;

    this.picker?.setEnabled(this.interaction.surfaceMove && this.dragEnabled && anyControlVisible);

    // The frame is a calibration aid, never part of the projected output
    this.outputFrame?.setVisible(
      this.interaction.canvasBoundary && this.controlsVisibility.outline && this.dragEnabled,
    );

    for (const surface of this.surfaces) {
      surface.getWarper().setScaleHandleEnabled(this.interaction.surfaceScale);
    }
  }

  /**
   * Are warp handles something the user can act on right now? False on a
   * projector window, and once the handles are hidden — the keyboard must not
   * move a corner nobody can see, and an off-screen marker for a hidden handle
   * would be the only control left on a cleared screen.
   */
  private handleControlsInteractive(): boolean {
    if (this.whiteOut) return false;
    return this.dragEnabled && (this.controlsVisibility.corners || this.controlsVisibility.grid);
  }


  /** One screen pixel in world units, for anything that must hold a pixel size */
  private pixelToWorld(): number {
    const frustumWidth = this.camera.right - this.camera.left;
    return frustumWidth / this.renderer.domElement.clientWidth;
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
    // The old surface's handles are about to be hidden; leaving one armed would
    // point the arrow keys at a surface the user has moved on from
    this.getActiveSurface().getWarper().clearSelectedHandle();
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
      // Nothing but white belongs on screen, markers included
      this.offscreenMarkers.update();

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
    const pixelToWorld = this.pixelToWorld();

    // Each surface's masks follow that surface's own perspective
    this.surfaces.forEach((surface) => surface.syncMasks(pixelToWorld));

    // After the handles have their final positions for this frame
    this.offscreenMarkers.update();

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
    this.applyInteraction();
  }

  setCornerPointsVisible(visible: boolean): void {
    this.controlsVisibility.corners = visible;
    this.getWarper().setCornerPointsVisible(visible);
    this.applyInteraction();
  }

  /** Outlines are shared by all surfaces — they double as selection targets */
  setOutlineVisible(visible: boolean): void {
    this.controlsVisibility.outline = visible;
    this.surfaces.forEach((surface) => surface.getWarper().setOutlineVisible(visible));
    this.applyInteraction();
  }

  /**
   * Show or hide the dashed output boundary, leaving surface outlines alone.
   * No effect on an output window, which never draws it.
   */
  setCanvasBoundaryVisible(visible: boolean): void {
    this.interaction.canvasBoundary = visible;
    this.applyInteraction();
  }

  /** Select and body-drag surfaces, or not. Leaves warp handles and outlines alone. */
  setSurfaceMoveEnabled(enabled: boolean): void {
    this.interaction.surfaceMove = enabled;
    this.applyInteraction();
  }

  /** Show or hide the scale handle on the active surface. */
  setSurfaceScaleEnabled(enabled: boolean): void {
    this.interaction.surfaceScale = enabled;
    this.applyInteraction();
  }

  setDragEnabled(enabled: boolean): void {
    this.dragEnabled = enabled;
    this.view.setInteractive(enabled); // a receive-only window does not zoom either
    this.applyActiveSurface();
  }

  /**
   * Hand the arrow keys, Tab and Esc back to the host app.
   *
   * The warp point keys are built in because they act on state only the mapper
   * has — which point is selected, and how far a screen pixel reaches at the
   * current zoom. That is right for a calibration tool that owns the window, and
   * wrong for a mapper embedded in a larger UI: Tab is claimed page-wide while
   * warp controls are visible, because stepping to a point that is off screen is
   * the one way to reach it.
   *
   * Turning them off leaves the handles draggable. Rebinding is `getWarper()` —
   * `selectNextHandle`, `nudgeSelectedHandle` and `clearSelectedHandle` are the
   * same methods these keys call.
   */
  setKeyboardEnabled(enabled: boolean): void {
    this.handleKeyboard.setEnabled(enabled);
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

  /**
   * Reset one surface's warp, or all surfaces when no id is given.
   *
   * Placement is kept only where moving was on in the first place — the same
   * `surfaceMove` capability, so the two stay in step. A surface that can be
   * dragged (several of them, or one an output window opted in to align to a
   * physical object) must not be piled back into the middle by a warp reset.
   *
   * Where moving is off, keeping position is worse than useless: a warped quad's
   * centroid drifts from the centre as corners are pulled about, so the reset
   * rectangle would land off-centre — a reset that visibly moves the surface.
   * So there it recenters.
   */
  reset(surfaceId?: string): void {
    const keepPosition = this.interaction.surfaceMove;

    if (surfaceId) {
      this.getSurface(surfaceId)?.getWarper().resetToDefault(keepPosition);
      return;
    }
    this.surfaces.forEach((surface) => surface.getWarper().resetToDefault(keepPosition));
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
    this.handleKeyboard.dispose();
    this.offscreenMarkers.dispose();
    this.outputFrame?.dispose();
    this.surfaces.forEach((surface) => surface.dispose());
    this.composer.dispose();
  }
}

export default ProjectionMapper;
