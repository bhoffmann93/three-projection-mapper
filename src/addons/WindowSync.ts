/**
 * WindowSync - Multi-window synchronization addon for ProjectionMapper
 *
 * Handles:
 * - BroadcastChannel IPC between controller and projector windows
 * - Window lifecycle management
 * - State synchronization
 * - Event serialization/deserialization
 *
 * Usage:
 * ```typescript
 * const mapper = new ProjectionMapper(renderer, texture);
 * const sync = new WindowSync(mapper);
 *
 * sync.onProjectorReady(() => console.log('Connected!'));
 * sync.openProjectorWindow();
 * ```
 */

import * as THREE from 'three';
import { ProjectionMapper } from '../core/ProjectionMapper';
import type { MeshWarper } from '../warp/MeshWarper';
import type { WarpSurface } from '../warp/WarpSurface';
import type { ImageSettings, UvRect, Resolution } from '../core/defaults';
import { EventChannel } from '../ipc/EventChannel';
import { WindowManager } from '../windows/WindowManager';
import { ProjectionEventType } from '../ipc/EventTypes';
import { FullProjectionState, NormalizedPoint, PolygonMaskSyncState, SurfaceSyncState } from '../ipc/EventPayloads';

export const enum WINDOW_SYNC_MODE {
  CONTROLLER = 'controller',
  PROJECTOR = 'projector',
}

export interface WindowSyncConfig {
  /** BroadcastChannel name for IPC (default: 'projection-mapper-sync') */
  channelName?: string;

  /** This window's role (default: WINDOW_SYNC_MODE.CONTROLLER) */
  mode?: WINDOW_SYNC_MODE;
}

export class WindowSync {
  private mapper: ProjectionMapper;
  private eventChannel: EventChannel;
  private windowManager: WindowManager;
  private mode: WINDOW_SYNC_MODE;

  /** DragControls instances that already broadcast — avoids double-attaching */
  private attachedDragControls = new WeakSet<object>();
  private onProjectorReadyCallbacks: Array<() => void> = [];
  private onProjectorCloseCallbacks: Array<() => void> = [];

  constructor(mapper: ProjectionMapper, config: WindowSyncConfig = {}) {
    const {
      channelName = 'projection-mapper-sync',
      mode = WINDOW_SYNC_MODE.CONTROLLER,
    } = config;

    this.mapper = mapper;
    this.mode = mode;
    this.eventChannel = new EventChannel(channelName, mode);
    this.windowManager = new WindowManager();
    // Open the projector at the output's aspect, whatever it currently is
    this.windowManager.setSizeSource(() => this.mapper.getResolution());

    if (mode === WINDOW_SYNC_MODE.CONTROLLER) {
      this.setupControllerSync();
    } else if (mode === WINDOW_SYNC_MODE.PROJECTOR) {
      this.setupProjectorSync();
    }
  }

  /**
   * Setup synchronization for controller window
   * Broadcasts changes to projector
   */
  private setupControllerSync(): void {
    // Broadcast point updates when dragging
    this.attachDragListeners();

    // Moving a surface's body changes its geometry without touching a handle,
    // so DragControls never reports it — the mapper does instead
    this.mapper.onSurfaceTransformed((surfaceId) => this.broadcastSurfaceGeometry(surfaceId));

    // Auto-reattach drag listener when grid size changes
    // (that surface's DragControls is recreated)
    this.eventChannel.on(ProjectionEventType.GRID_SIZE_CHANGED, () => {
      this.reattachDragListeners();
    });

    // Local loopback from the GUI: hook the new surface's DragControls
    this.eventChannel.on(ProjectionEventType.SURFACE_ADDED, () => {
      this.attachDragListeners();
    });

    // Handle projector ready
    this.eventChannel.on(ProjectionEventType.PROJECTOR_READY, () => {
      this.updateConnectionStatus(true);
      this.onProjectorReadyCallbacks.forEach(cb => cb());
    });

    // Send full state when requested
    this.eventChannel.on(ProjectionEventType.REQUEST_FULL_STATE, () => {
      console.log('[WindowSync] Controller received REQUEST_FULL_STATE, sending state...');
      this.eventChannel.emit(ProjectionEventType.FULL_STATE_SYNC, {
        state: this.getFullState(),
      });
    });

    // Announce controller ready
    this.eventChannel.emit(ProjectionEventType.CONTROLLER_READY, {});

    // Window close callback
    this.windowManager.onProjectorClose(() => {
      this.updateConnectionStatus(false);
      this.onProjectorCloseCallbacks.forEach(cb => cb());
    });
  }

  /**
   * Setup synchronization for projector window
   * Receives updates from controller
   */
  private setupProjectorSync(): void {
    // Configure mapper for projector mode (receive-only, no user interaction)
    this.mapper.setControlsVisible(false);
    this.mapper.setZoom(1.0);
    this.mapper.setDragEnabled(false);
    this.mapper.setPolygonHandlesVisible(false);

    // Request full state from controller
    console.log('[WindowSync] Projector requesting full state from controller...');
    this.eventChannel.emit(ProjectionEventType.PROJECTOR_READY, {});
    this.eventChannel.emit(ProjectionEventType.REQUEST_FULL_STATE, {});

    // If controller (re)starts after us (e.g. Vite HMR), re-request full state
    this.eventChannel.on(ProjectionEventType.CONTROLLER_READY, () => {
      console.log('[WindowSync] Projector detected controller ready, re-requesting state...');
      this.eventChannel.emit(ProjectionEventType.PROJECTOR_READY, {});
      this.eventChannel.emit(ProjectionEventType.REQUEST_FULL_STATE, {});
    });

    // Listen for state updates
    this.eventChannel.on(ProjectionEventType.FULL_STATE_SYNC, ({ state }) => {
      console.log('[WindowSync] Projector received FULL_STATE_SYNC');
      this.applyFullState(state);
    });

    this.eventChannel.on(ProjectionEventType.CORNER_POINTS_UPDATED, ({ points, surfaceId }) => {
      this.applyCornerPoints(points, this.resolveWarper(surfaceId));
    });

    this.eventChannel.on(ProjectionEventType.GRID_POINTS_UPDATED, ({ points, referencePoints, surfaceId }) => {
      this.applyGridPoints(points, referencePoints, this.resolveWarper(surfaceId));
    });

    this.eventChannel.on(ProjectionEventType.GRID_SIZE_CHANGED, ({ gridSize, surfaceId }) => {
      this.resolveWarper(surfaceId)?.setGridSize(gridSize.x, gridSize.y);
    });

    this.eventChannel.on(ProjectionEventType.WARP_MODE_CHANGED, ({ mode, surfaceId }) => {
      this.resolveWarper(surfaceId)?.setWarpMode(mode);
    });

    this.eventChannel.on(ProjectionEventType.SURFACE_ADDED, ({ surfaceId, uvRect, resolution }) => {
      this.ensureSurface(surfaceId, uvRect, resolution);
    });

    this.eventChannel.on(ProjectionEventType.SURFACE_REMOVED, ({ surfaceId }) => {
      this.mapper.removeSurface(surfaceId);
    });

    this.eventChannel.on(ProjectionEventType.UV_RECT_CHANGED, ({ uvRect, surfaceId }) => {
      const surface = surfaceId ? this.mapper.getSurface(surfaceId) : this.mapper.getSurfaces()[0];
      surface?.setUvRect(uvRect.offsetX, uvRect.offsetY, uvRect.scaleX, uvRect.scaleY);
    });

    this.eventChannel.on(ProjectionEventType.SHOULD_WARP_CHANGED, ({ shouldWarp }) => {
      this.mapper.setShouldWarp(shouldWarp);
      this.mapper.setPolygonHandlesVisible(false); // projector is never interactive
    });

    this.eventChannel.on(ProjectionEventType.TESTCARD_TOGGLED, ({ show }) => {
      this.mapper.setShowTestCard(show);
    });

    this.eventChannel.on(ProjectionEventType.WHITE_OUT_TOGGLED, ({ show }) => {
      this.mapper.setWhiteOut(show);
    });

    // Projector never shows editing controls regardless of controller state

    this.eventChannel.on(ProjectionEventType.CAMERA_OFFSET_CHANGED, ({ offset }) => {
      this.mapper.setCameraOffset(offset.x, offset.y);
    });

    this.eventChannel.on(ProjectionEventType.IMAGE_SETTINGS_CHANGED, ({ settings, surfaceId }) => {
      this.resolveSurface(surfaceId)?.setImageSettings(settings as ImageSettings);
    });

    this.eventChannel.on(ProjectionEventType.RESET_WARP, ({ surfaceId }) => {
      this.mapper.reset(surfaceId);
    });

    this.eventChannel.on(ProjectionEventType.EDGE_MASK_CHANGED, ({ enabled, feather, surfaceId }) => {
      this.resolveSurface(surfaceId)?.setEdgeFeather(enabled, feather);
    });

    this.eventChannel.on(ProjectionEventType.POLYGON_MASK_NODES_CHANGED, ({ nodes, surfaceId }) => {
      const surface = this.resolveSurface(surfaceId);
      if (!surface) return;
      if (!surface.getPolygonMask()) surface.addPolygonMask(nodes);
      else surface.getPolygonMask()!.setNodes(nodes);
      surface.getPolygonMask()?.setVisible(false);
    });

    this.eventChannel.on(
      ProjectionEventType.POLYGON_MASK_SETTINGS_CHANGED,
      ({ enabled, inverted, feather, surfaceId }) => {
        const surface = this.resolveSurface(surfaceId);
        surface?.setPolygonMaskEnabled(enabled);
        surface?.setPolygonInvert(inverted);
        surface?.setPolygonFeather(feather);
      },
    );

    this.eventChannel.on(ProjectionEventType.POLYGON_MASK_REMOVED, ({ surfaceId }) => {
      this.resolveSurface(surfaceId)?.removePolygonMask();
    });
  }

  private applyPolygonMaskState(surface: WarpSurface, state: PolygonMaskSyncState): void {
    if (!surface.getPolygonMask()) {
      surface.addPolygonMask(state.nodes);
    } else {
      surface.getPolygonMask()!.setNodes(state.nodes);
    }
    surface.setPolygonMaskEnabled(state.enabled);
    surface.setPolygonInvert(state.inverted);
    surface.setPolygonFeather(state.feather);
    // Projector never shows mask handles
    surface.getPolygonMask()?.setVisible(false);
  }

  /** First surface when no id is given (single-surface senders) */
  private resolveSurface(surfaceId?: string): WarpSurface | null {
    if (!surfaceId) return this.mapper.getSurfaces()[0] ?? null;
    return this.mapper.getSurface(surfaceId);
  }

  private resolveWarper(surfaceId?: string): MeshWarper | null {
    return this.resolveSurface(surfaceId)?.getWarper() ?? null;
  }

  /**
   * Get or create a surface on the projector, always non-interactive.
   *
   * Null when this projector cannot hold the surface — a single-surface mapper
   * refuses addSurface(). Callers must skip rather than fall back to the first
   * surface, or every incoming surface would be written onto that one and the
   * projector would show the last sender's warp instead of the first's.
   */
  private ensureSurface(surfaceId: string, uvRect?: UvRect, resolution?: Resolution): WarpSurface | null {
    const existing = this.mapper.getSurface(surfaceId);
    if (existing) return existing;
    if (!this.mapper.isMultiSurface()) return null;

    const surface = this.mapper.addSurface({ id: surfaceId, uvRect, resolution });
    surface.getWarper().setAllControlsVisible(false);
    surface.getWarper().setDragEnabled(false);
    return surface;
  }

  /**
   * Attach drag event listeners to broadcast point updates.
   * Safe to call repeatedly — already-hooked DragControls are skipped.
   */
  private attachDragListeners(): void {
    if (this.mode !== WINDOW_SYNC_MODE.CONTROLLER) return;

    for (const surface of this.mapper.getSurfaces()) {
      const warper = surface.getWarper();
      const dragControls = warper.getDragControls();
      if (this.attachedDragControls.has(dragControls)) continue;
      this.attachedDragControls.add(dragControls);

      dragControls.addEventListener('drag', () => this.broadcastSurfaceGeometry(surface.id));
    }
  }

  /** Send one surface's corner and grid points, the whole of its geometry */
  private broadcastSurfaceGeometry(surfaceId: string): void {
    const warper = this.mapper.getSurface(surfaceId)?.getWarper();
    if (!warper) return;

    this.eventChannel.emit(ProjectionEventType.CORNER_POINTS_UPDATED, {
      points: warper.getCornerControlPoints().map((p) => warper.toNormalizedPoint(p)),
      surfaceId,
    });
    this.eventChannel.emit(ProjectionEventType.GRID_POINTS_UPDATED, {
      points: warper.getGridControlPoints().map((p) => warper.toNormalizedPoint(p)),
      referencePoints: warper.getReferenceGridControlPoints().map((p) => warper.toNormalizedPoint(p)),
      surfaceId,
    });
  }

  /**
   * Re-attach drag listeners after grid size changes
   * (drag controls are recreated when grid size changes)
   */
  private reattachDragListeners(): void {
    if (this.mode !== WINDOW_SYNC_MODE.CONTROLLER) return;

    setTimeout(() => {
      this.attachDragListeners();
    }, 50);
  }

  /**
   * Get full state for synchronization
   */
  private getSurfaceState(surface: WarpSurface): SurfaceSyncState {
    const warper = surface.getWarper();

    return {
      id: surface.id,
      uvRect: surface.getUvRect(),
      resolution: surface.getResolution(),
      cornerPoints: warper.getCornerControlPoints().map((p) => warper.toNormalizedPoint(p)),
      gridPoints: warper.getGridControlPoints().map((p) => warper.toNormalizedPoint(p)),
      referenceGridPoints: warper.getReferenceGridControlPoints().map((p) => warper.toNormalizedPoint(p)),
      gridSize: {
        x: warper.getGridSizeX(),
        y: warper.getGridSizeY(),
      },
      warpMode: warper.getWarpMode(),
      imageSettings: surface.getImageSettings(),
      edgeMask: surface.getEdgeMask(),
      polygonMask: surface.getPolygonMaskState() ?? undefined,
    };
  }

  private applySurfaceState(state: SurfaceSyncState): void {
    const surface = this.ensureSurface(state.id, state.uvRect, state.resolution);
    if (!surface) return;
    const warper = surface.getWarper();

    surface.setUvRect(state.uvRect.offsetX, state.uvRect.offsetY, state.uvRect.scaleX, state.uvRect.scaleY);

    // Grid size first — it recreates the grid point arrays
    if (state.gridSize.x !== warper.getGridSizeX() || state.gridSize.y !== warper.getGridSizeY()) {
      warper.setGridSize(state.gridSize.x, state.gridSize.y);
    }

    this.applyCornerPoints(state.cornerPoints, warper);
    this.applyGridPoints(state.gridPoints, state.referenceGridPoints, warper);
    warper.setWarpMode(state.warpMode);

    // Image and masks belong to the surface (absent from pre-per-surface senders)
    if (state.imageSettings) surface.setImageSettings(state.imageSettings);
    if (state.edgeMask) surface.setEdgeFeather(state.edgeMask.maskEnabled, state.edgeMask.feather);
    if (state.polygonMask) {
      this.applyPolygonMaskState(surface, state.polygonMask);
    } else if (surface.getPolygonMask()) {
      surface.removePolygonMask();
    }
  }

  private getFullState(): FullProjectionState {
    const surfaces = this.mapper.getSurfaces();
    // Legacy top-level warp fields always describe the first surface
    const firstSurface = this.getSurfaceState(surfaces[0]);

    return {
      cornerPoints: firstSurface.cornerPoints,
      gridPoints: firstSurface.gridPoints,
      referenceGridPoints: firstSurface.referenceGridPoints,
      gridSize: firstSurface.gridSize,
      warpMode: firstSurface.warpMode,
      shouldWarp: this.mapper.isWarpEnabled(),
      showTestcard: this.mapper.isShowingTestCard(),
      showWhiteOut: this.mapper.isWhiteOut(),
      showControlLines: this.mapper.isShowingControlLines(),
      showControls: false, // Projector controls default to hidden
      cameraOffset: this.mapper.getCameraOffset(),
      imageSettings: firstSurface.imageSettings,
      polygonMask: firstSurface.polygonMask,
      surfaces: surfaces.map((surface) => this.getSurfaceState(surface)),
    };
  }

  /**
   * Apply full state from controller (projector only)
   */
  private applyFullState(state: FullProjectionState): void {
    // 1. Apply warp surfaces
    if (state.surfaces?.length) {
      // Remove local surfaces the controller no longer has
      const syncedIds = new Set(state.surfaces.map((s) => s.id));
      for (const surface of this.mapper.getSurfaces()) {
        if (!syncedIds.has(surface.id)) this.mapper.removeSurface(surface.id);
      }
      state.surfaces.forEach((surfaceState) => this.applySurfaceState(surfaceState));
    } else {
      // Single-surface sender: legacy top-level fields describe the first surface
      const firstSurface = this.mapper.getSurfaces()[0];
      this.applySurfaceState({
        id: firstSurface.id,
        uvRect: firstSurface.getUvRect(),
        cornerPoints: state.cornerPoints,
        gridPoints: state.gridPoints,
        referenceGridPoints: state.referenceGridPoints,
        gridSize: state.gridSize,
        warpMode: state.warpMode,
        resolution: firstSurface.getResolution(),
        imageSettings: state.imageSettings,
        edgeMask: firstSurface.getEdgeMask(),
        polygonMask: state.polygonMask,
      });
    }

    // 2. Apply warp settings
    this.mapper.setShouldWarp(state.shouldWarp); // use mapper so maskPlane.uShouldWarp is updated

    // 3. Apply visual settings
    this.mapper.setShowTestCard(state.showTestcard);
    this.mapper.setWhiteOut(state.showWhiteOut);
    this.mapper.setShowControlLines(false); // Always hide on projector
    this.mapper.setControlsVisible(state.showControls);

    // 4. Apply camera offset
    this.mapper.setCameraOffset(state.cameraOffset.x, state.cameraOffset.y);

    // 5. Image and masks were applied per surface in applySurfaceState; make sure
    // no handles survived setShouldWarp re-enabling them
    for (const surface of this.mapper.getSurfaces()) {
      surface.getPolygonMask()?.setVisible(false);
    }

    // Hide loading message (if it exists)
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
      loadingEl.classList.add('hidden');
    }

    console.log('[WindowSync] Applied full state from controller');
  }

  /**
   * Apply corner point updates (projector only)
   */
  private applyCornerPoints(points: NormalizedPoint[], warper: MeshWarper | null): void {
    if (!warper) return;
    const cornerPoints = warper.getCornerControlPoints();

    points.forEach((normalized, i) => {
      cornerPoints[i].copy(warper.fromNormalizedPoint(normalized));
    });

    warper.refreshOutline();
  }

  /**
   * Apply grid point updates (projector only)
   */
  private applyGridPoints(points: NormalizedPoint[], referencePoints: NormalizedPoint[], warper: MeshWarper | null): void {
    if (!warper) return;
    const gridPoints = warper.getGridControlPoints();
    const referenceGridPoints = warper.getReferenceGridControlPoints();

    points.forEach((normalized, i) => {
      if (i < gridPoints.length) gridPoints[i].copy(warper.fromNormalizedPoint(normalized));
    });

    referencePoints.forEach((normalized, i) => {
      if (i < referenceGridPoints.length) referenceGridPoints[i].copy(warper.fromNormalizedPoint(normalized));
    });

    warper.refreshOutline();
  }

  /**
   * Update connection status UI (if element exists)
   */
  private updateConnectionStatus(connected: boolean): void {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
      statusElement.textContent = connected ? 'Connected' : 'Disconnected';
      statusElement.className = connected ? 'connected' : 'disconnected';
    }
  }

  /**
   * Open projector window (controller only)
   */
  public openProjectorWindow(): void {
    if (this.mode !== WINDOW_SYNC_MODE.CONTROLLER) {
      console.warn('WindowSync: openProjectorWindow() can only be called from controller mode');
      return;
    }
    this.windowManager.openProjectorWindow();
  }

  /**
   * Close projector window (controller only)
   */
  public closeProjectorWindow(): void {
    if (this.mode !== WINDOW_SYNC_MODE.CONTROLLER) {
      console.warn('WindowSync: closeProjectorWindow() can only be called from controller mode');
      return;
    }
    this.windowManager.closeProjectorWindow();
  }

  public updateMapper(mapper: ProjectionMapper): void {
    this.mapper = mapper;
    if (this.mode === WINDOW_SYNC_MODE.CONTROLLER) {
      this.reattachDragListeners();
    } else {
      this.mapper.setControlsVisible(false);
      this.mapper.setZoom(1.0);
      this.mapper.setDragEnabled(false);
      // New mapper has default state — re-request full state from controller so all
      // projection state (test card, polygon mask, image settings, warp, etc.) is restored.
      this.eventChannel.emit(ProjectionEventType.PROJECTOR_READY, {});
      this.eventChannel.emit(ProjectionEventType.REQUEST_FULL_STATE, {});
    }
  }

  /**
   * Register callback for when projector connects
   */
  public onProjectorReady(callback: () => void): void {
    this.onProjectorReadyCallbacks.push(callback);
  }

  /**
   * Register callback for when projector disconnects
   */
  public onProjectorClose(callback: () => void): void {
    this.onProjectorCloseCallbacks.push(callback);
  }

  /**
   * Check if projector is connected
   */
  public isConnected(): boolean {
    return this.windowManager.isProjectorOpen();
  }

  /**
   * Get the EventChannel for advanced usage
   */
  public getEventChannel(): EventChannel {
    return this.eventChannel;
  }

  /**
   * Get the WindowManager for advanced usage
   */
  public getWindowManager(): WindowManager {
    return this.windowManager;
  }

  /**
   * Broadcast an event to other windows
   */
  public broadcast(eventType: ProjectionEventType, payload: any): void {
    this.eventChannel.emit(eventType, payload);
  }
}
