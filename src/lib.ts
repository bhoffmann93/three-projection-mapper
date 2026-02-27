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

export { ProjectionMapper, DEFAULT_IMAGE_SETTINGS, type ProjectionMapperConfig, type ImageSettings } from './core/ProjectionMapper';
export {
  ProjectionMapperGUI,
  GUI_ANCHOR,
  type ProjectionMapperGUIConfig
} from './core/ProjectionMapperGUI';
export { ProjectorCamera } from './core/ProjectorCamera';
export { MeshWarper, WARP_MODE, type MeshWarperConfig } from './warp/MeshWarper';
