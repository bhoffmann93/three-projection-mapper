import { ProjectionEventType } from './EventTypes';
import type { ImageSettings, EdgeMaskSettings, UvRect } from '../core/defaults';

/**
 * Normalized point format (0-1 range) for resolution-independent serialization
 */
export interface NormalizedPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Grid size configuration
 */
export interface GridSize {
  x: number;
  y: number;
}

/**
 * Camera offset settings
 */
export interface CameraOffset {
  x: number;
  y: number;
}

/**
 * Polygon mask state for synchronization
 */
export interface PolygonMaskSyncState {
  nodes: { u: number; v: number }[];
  enabled: boolean;
  inverted: boolean;
  feather: number;
}

/**
 * One warp surface's state for synchronization
 */
export interface SurfaceSyncState {
  id: string;
  uvRect: UvRect;
  cornerPoints: NormalizedPoint[];
  gridPoints: NormalizedPoint[];
  referenceGridPoints: NormalizedPoint[];
  gridSize: GridSize;
  warpMode: number;
  /** Edge feather belongs to the surface, not to the global image settings */
  edgeMask: EdgeMaskSettings;
  /** Absent means this surface has no polygon mask */
  polygonMask?: PolygonMaskSyncState;
}

/**
 * Complete projection state for full synchronization
 */
export interface FullProjectionState {
  // Control points (normalized 0-1)
  cornerPoints: NormalizedPoint[];
  gridPoints: NormalizedPoint[];
  referenceGridPoints: NormalizedPoint[];

  // Grid configuration
  gridSize: GridSize;

  // Warp settings
  warpMode: number; // 0 = BILINEAR, 1 = BICUBIC
  shouldWarp: boolean;

  // Visual settings
  showTestcard: boolean;
  showWhiteOut: boolean;
  showControlLines: boolean;
  showControls: boolean;

  // Camera/view settings
  cameraOffset: CameraOffset;

  // Image adjustments
  imageSettings: ImageSettings;

  // Polygon mask (optional — absent means no mask active)
  polygonMask?: PolygonMaskSyncState;

  // All warp surfaces (optional — absent on single-surface senders; the
  // legacy top-level warp fields always describe the first surface)
  surfaces?: SurfaceSyncState[];
}

/**
 * Mapped type for type-safe event payloads
 * Maps each event type to its specific payload shape
 */
export interface ProjectionEventPayloads {
  // surfaceId is optional for backwards compatibility — absent means the first surface
  [ProjectionEventType.CORNER_POINTS_UPDATED]: { points: NormalizedPoint[]; surfaceId?: string };
  [ProjectionEventType.GRID_POINTS_UPDATED]: {
    points: NormalizedPoint[];
    referencePoints: NormalizedPoint[];
    surfaceId?: string;
  };
  [ProjectionEventType.GRID_SIZE_CHANGED]: { gridSize: GridSize; surfaceId?: string };
  [ProjectionEventType.WARP_MODE_CHANGED]: { mode: number; surfaceId?: string };
  [ProjectionEventType.SURFACE_ADDED]: { surfaceId: string; uvRect: UvRect };
  [ProjectionEventType.SURFACE_REMOVED]: { surfaceId: string };
  [ProjectionEventType.UV_RECT_CHANGED]: { uvRect: UvRect; surfaceId?: string };
  [ProjectionEventType.SHOULD_WARP_CHANGED]: { shouldWarp: boolean };
  [ProjectionEventType.TESTCARD_TOGGLED]: { show: boolean };
  [ProjectionEventType.WHITE_OUT_TOGGLED]: { show: boolean };
  [ProjectionEventType.CONTROL_LINES_TOGGLED]: { show: boolean };
  [ProjectionEventType.CONTROLS_VISIBILITY_CHANGED]: { visible: boolean };
  [ProjectionEventType.CAMERA_OFFSET_CHANGED]: { offset: CameraOffset };
  [ProjectionEventType.PLANE_SCALE_CHANGED]: { scale: number };
  [ProjectionEventType.CONTROLLER_READY]: {};
  [ProjectionEventType.PROJECTOR_READY]: {};
  [ProjectionEventType.REQUEST_FULL_STATE]: {};
  [ProjectionEventType.FULL_STATE_SYNC]: { state: FullProjectionState };
  [ProjectionEventType.IMAGE_SETTINGS_CHANGED]: { settings: ImageSettings };
  [ProjectionEventType.EDGE_MASK_CHANGED]: { enabled: boolean; feather: number; surfaceId?: string };
  [ProjectionEventType.POLYGON_MASK_NODES_CHANGED]: { nodes: { u: number; v: number }[]; surfaceId?: string };
  [ProjectionEventType.POLYGON_MASK_SETTINGS_CHANGED]: {
    enabled: boolean;
    inverted: boolean;
    feather: number;
    surfaceId?: string;
  };
  [ProjectionEventType.POLYGON_MASK_REMOVED]: { surfaceId?: string };
  [ProjectionEventType.RESET_WARP]: { surfaceId?: string };
}
