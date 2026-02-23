/**
 * three-projection-mapper - Core exports
 *
 * Main classes you need:
 * - ProjectionMapper: Core warping functionality
 * - ProjectionMapperGUI: Optional GUI controls
 * - MeshWarper: Low-level warp mesh (advanced usage)
 *
 * For multi-window support, import from 'three-projection-mapper/addons'
 */

export { ProjectionMapper, type ProjectionMapperConfig } from './core/ProjectionMapper';
export { ProjectionMapperGUI, GUI_ANCHOR, GUI_STORAGE_KEY, type ProjectionMapperGUISettings } from './core/ProjectionMapperGUI';
export { MeshWarper, WARP_MODE, type MeshWarperConfig } from './warp/MeshWarper';
export { calculateGridPoints } from './warp/geometry';
