/**
 * three-projection-mapper - Core exports
 *
 * Main classes you need:
 * - ProjectionMapper: Core warping functionality
 * - ProjectionMapperGUI: Optional GUI controls
 * - ProjectorCamera: Hardware-matched camera with lens shift support
 * - MeshWarper: Low-level warp mesh (advanced usage)
 *
 * For multi-window support, import from 'three-projection-mapper/addons'
 */

export { ProjectionMapper, type ProjectionMapperConfig } from './core/ProjectionMapper';
export {
  ProjectionMapperGUI,
  GUI_ANCHOR,
  GUI_STORAGE_KEY,
  type ProjectionMapperGUISettings,
  type ProjectionMapperGUIConfig
} from './core/ProjectionMapperGUI';
export { ProjectorCamera } from './core/ProjectorCamera';
export { MeshWarper, WARP_MODE, type MeshWarperConfig } from './warp/MeshWarper';
export { calculateGridPoints } from './warp/geometry';
export { WindowSync, WINDOW_SYNC_MODE, type WindowSyncConfig } from './addons/WindowSync';
export { EventChannel } from './ipc/EventChannel';
export { WindowManager } from './windows/WindowManager';
