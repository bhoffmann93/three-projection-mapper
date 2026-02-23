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
import { EventChannel } from '../ipc/EventChannel';
import { WindowManager } from '../windows/WindowManager';
import { ProjectionEventType } from '../ipc/EventTypes';
import { FullProjectionState, NormalizedPoint } from '../ipc/EventPayloads';

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

  private dragControls: any; // DragControls from MeshWarper
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
    const warper = this.mapper.getWarper();
    this.dragControls = (warper as any).dragControls;

    // Broadcast point updates when dragging
    this.attachDragListener();

    // Auto-reattach drag listener when grid size changes
    this.eventChannel.on(ProjectionEventType.GRID_SIZE_CHANGED, () => {
      this.reattachDragListener();
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
    this.mapper.setPlaneScale(1.0);
    this.mapper.getWarper().setDragEnabled(false);

    // Request full state from controller
    console.log('[WindowSync] Projector requesting full state from controller...');
    this.eventChannel.emit(ProjectionEventType.PROJECTOR_READY, {});
    this.eventChannel.emit(ProjectionEventType.REQUEST_FULL_STATE, {});

    // Listen for state updates
    this.eventChannel.on(ProjectionEventType.FULL_STATE_SYNC, ({ state }) => {
      console.log('[WindowSync] Projector received FULL_STATE_SYNC');
      this.applyFullState(state);
    });

    this.eventChannel.on(ProjectionEventType.CORNER_POINTS_UPDATED, ({ points }) => {
      this.applyCornerPoints(points);
    });

    this.eventChannel.on(ProjectionEventType.GRID_POINTS_UPDATED, ({ points, referencePoints }) => {
      this.applyGridPoints(points, referencePoints);
    });

    this.eventChannel.on(ProjectionEventType.GRID_SIZE_CHANGED, ({ gridSize }) => {
      this.mapper.setGridSize(gridSize.x, gridSize.y);
    });

    this.eventChannel.on(ProjectionEventType.WARP_MODE_CHANGED, ({ mode }) => {
      this.mapper.getWarper().setWarpMode(mode);
    });

    this.eventChannel.on(ProjectionEventType.SHOULD_WARP_CHANGED, ({ shouldWarp }) => {
      this.mapper.setShouldWarp(shouldWarp);
    });

    this.eventChannel.on(ProjectionEventType.TESTCARD_TOGGLED, ({ show }) => {
      this.mapper.setShowTestCard(show);
    });

    this.eventChannel.on(ProjectionEventType.CONTROLS_VISIBILITY_CHANGED, ({ visible }) => {
      this.mapper.setControlsVisible(visible);
    });

    this.eventChannel.on(ProjectionEventType.CAMERA_OFFSET_CHANGED, ({ offset }) => {
      this.mapper.setCameraOffset(offset.x, offset.y);
    });

    this.eventChannel.on(ProjectionEventType.RESET_WARP, () => {
      this.mapper.reset();
      setTimeout(() => window.location.reload(), 100);
    });
  }

  /**
   * Attach drag event listener to broadcast point updates
   */
  private attachDragListener(): void {
    if (!this.dragControls || this.mode !== WINDOW_SYNC_MODE.CONTROLLER) return;

    const warper = this.mapper.getWarper();

    this.dragControls.addEventListener('drag', () => {
      const config = (warper as any).config;
      const cornerPoints = warper.getCornerControlPoints();
      const gridPoints = warper.getGridControlPoints();
      const referenceGridPoints = (warper as any).referenceGridControlPoints;

      // Broadcast corner points
      this.eventChannel.emit(ProjectionEventType.CORNER_POINTS_UPDATED, {
        points: cornerPoints.map(p => this.normalizePoint(p, config.width, config.height)),
      });

      // Broadcast grid points
      this.eventChannel.emit(ProjectionEventType.GRID_POINTS_UPDATED, {
        points: gridPoints.map(p => this.normalizePoint(p, config.width, config.height)),
        referencePoints: referenceGridPoints.map(p => this.normalizePoint(p, config.width, config.height)),
      });
    });
  }

  /**
   * Re-attach drag listener after grid size changes
   * (drag controls are recreated when grid size changes)
   */
  private reattachDragListener(): void {
    if (this.mode !== WINDOW_SYNC_MODE.CONTROLLER) return;

    const warper = this.mapper.getWarper();
    this.dragControls = (warper as any).dragControls;

    setTimeout(() => {
      this.attachDragListener();
    }, 50);
  }

  /**
   * Get full state for synchronization
   */
  private getFullState(): FullProjectionState {
    const warper = this.mapper.getWarper();
    const config = (warper as any).config;

    const cornerPoints = warper.getCornerControlPoints();
    const gridPoints = warper.getGridControlPoints();
    const referenceGridPoints = (warper as any).referenceGridControlPoints;

    return {
      cornerPoints: cornerPoints.map(p => this.normalizePoint(p, config.width, config.height)),
      gridPoints: gridPoints.map(p => this.normalizePoint(p, config.width, config.height)),
      referenceGridPoints: referenceGridPoints.map(p => this.normalizePoint(p, config.width, config.height)),
      gridSize: {
        x: warper.getGridSizeX(),
        y: warper.getGridSizeY(),
      },
      warpMode: warper.getWarpMode(),
      shouldWarp: warper.getShouldWarp(),
      showTestcard: this.mapper.isShowingTestCard(),
      showControlLines: this.mapper.isShowingControlLines(),
      showControls: false, // Projector controls default to hidden
      cameraOffset: this.mapper.getCameraOffset(),
    };
  }

  /**
   * Apply full state from controller (projector only)
   */
  private applyFullState(state: FullProjectionState): void {
    const warper = this.mapper.getWarper();
    const config = (warper as any).config;

    // 1. Apply grid size FIRST
    if (state.gridSize.x !== warper.getGridSizeX() || state.gridSize.y !== warper.getGridSizeY()) {
      warper.setGridSize(state.gridSize.x, state.gridSize.y);
    }

    // 2. Apply corner points
    const cornerPoints = warper.getCornerControlPoints();
    state.cornerPoints.forEach((normalized, i) => {
      const denormalized = this.denormalizePoint(normalized, config.width, config.height);
      cornerPoints[i].set(denormalized.x, denormalized.y, denormalized.z);
    });

    // 3. Apply grid points
    const gridPoints = warper.getGridControlPoints();
    state.gridPoints.forEach((normalized, i) => {
      if (i < gridPoints.length) {
        const denormalized = this.denormalizePoint(normalized, config.width, config.height);
        gridPoints[i].set(denormalized.x, denormalized.y, denormalized.z);
      }
    });

    // 4. Apply reference grid points
    const referenceGridPoints = (warper as any).referenceGridControlPoints;
    state.referenceGridPoints.forEach((normalized, i) => {
      if (i < referenceGridPoints.length) {
        const denormalized = this.denormalizePoint(normalized, config.width, config.height);
        referenceGridPoints[i].set(denormalized.x, denormalized.y, denormalized.z);
      }
    });

    // 5. Apply warp settings
    warper.setWarpMode(state.warpMode);
    warper.setShouldWarp(state.shouldWarp);

    // 6. Apply visual settings
    this.mapper.setShowTestCard(state.showTestcard);
    this.mapper.setShowControlLines(false); // Always hide on projector
    this.mapper.setControlsVisible(state.showControls);

    // 7. Apply camera offset
    this.mapper.setCameraOffset(state.cameraOffset.x, state.cameraOffset.y);

    // Update mesh
    (warper as any).updateLine();

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
  private applyCornerPoints(points: NormalizedPoint[]): void {
    const warper = this.mapper.getWarper();
    const config = (warper as any).config;
    const cornerPoints = warper.getCornerControlPoints();

    points.forEach((normalized, i) => {
      const denormalized = this.denormalizePoint(normalized, config.width, config.height);
      cornerPoints[i].set(denormalized.x, denormalized.y, denormalized.z);
    });

    (warper as any).updateLine();
  }

  /**
   * Apply grid point updates (projector only)
   */
  private applyGridPoints(points: NormalizedPoint[], referencePoints: NormalizedPoint[]): void {
    const warper = this.mapper.getWarper();
    const config = (warper as any).config;
    const gridPoints = warper.getGridControlPoints();
    const referenceGridPoints = (warper as any).referenceGridControlPoints;

    points.forEach((normalized, i) => {
      if (i < gridPoints.length) {
        const denormalized = this.denormalizePoint(normalized, config.width, config.height);
        gridPoints[i].set(denormalized.x, denormalized.y, denormalized.z);
      }
    });

    referencePoints.forEach((normalized, i) => {
      if (i < referenceGridPoints.length) {
        const denormalized = this.denormalizePoint(normalized, config.width, config.height);
        referenceGridPoints[i].set(denormalized.x, denormalized.y, denormalized.z);
      }
    });

    (warper as any).updateLine();
  }

  /**
   * Normalize point to 0-1 range
   */
  private normalizePoint(point: THREE.Vector3, width: number, height: number): NormalizedPoint {
    return {
      x: (point.x + width / 2) / width,
      y: (point.y + height / 2) / height,
      z: point.z,
    };
  }

  /**
   * Denormalize point from 0-1 range
   */
  private denormalizePoint(normalized: NormalizedPoint, width: number, height: number): THREE.Vector3 {
    return new THREE.Vector3(
      normalized.x * width - width / 2,
      normalized.y * height - height / 2,
      normalized.z
    );
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
  public openProjectorWindow(url?: string): Window | null {
    if (this.mode !== WINDOW_SYNC_MODE.CONTROLLER) {
      console.warn('WindowSync: openProjectorWindow() can only be called from controller mode');
      return null;
    }
    return this.windowManager.openProjectorWindow(url);
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
