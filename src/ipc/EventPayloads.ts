import { ProjectionEventType } from './EventTypes';
import type { ImageSettings } from '../core/ProjectionMapper';

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
  showControlLines: boolean;
  showControls: boolean;

  // Camera/view settings
  cameraOffset: CameraOffset;

  // Image adjustments
  imageSettings: ImageSettings;
}

/**
 * Mapped type for type-safe event payloads
 * Maps each event type to its specific payload shape
 */
export interface ProjectionEventPayloads {
  [ProjectionEventType.CORNER_POINTS_UPDATED]: { points: NormalizedPoint[] };
  [ProjectionEventType.GRID_POINTS_UPDATED]: { points: NormalizedPoint[]; referencePoints: NormalizedPoint[] };
  [ProjectionEventType.GRID_SIZE_CHANGED]: { gridSize: GridSize };
  [ProjectionEventType.WARP_MODE_CHANGED]: { mode: number };
  [ProjectionEventType.SHOULD_WARP_CHANGED]: { shouldWarp: boolean };
  [ProjectionEventType.TESTCARD_TOGGLED]: { show: boolean };
  [ProjectionEventType.CONTROL_LINES_TOGGLED]: { show: boolean };
  [ProjectionEventType.CONTROLS_VISIBILITY_CHANGED]: { visible: boolean };
  [ProjectionEventType.CAMERA_OFFSET_CHANGED]: { offset: CameraOffset };
  [ProjectionEventType.PLANE_SCALE_CHANGED]: { scale: number };
  [ProjectionEventType.CONTROLLER_READY]: {};
  [ProjectionEventType.PROJECTOR_READY]: {};
  [ProjectionEventType.REQUEST_FULL_STATE]: {};
  [ProjectionEventType.FULL_STATE_SYNC]: { state: FullProjectionState };
  [ProjectionEventType.IMAGE_SETTINGS_CHANGED]: { settings: ImageSettings };
  [ProjectionEventType.RESET_WARP]: {};
}
