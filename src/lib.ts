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
  DEFAULT_IMAGE_SETTINGS,
  DEFAULT_EDGE_MASK,
  DEFAULT_UV_RECT,
  WORLD_PLANE_HEIGHT,
  planeSizeFor,
  type ImageSettings,
  type EdgeMaskSettings,
  type PolygonMaskSettings,
  type UvRect,
  type Resolution,
} from './core/defaults';
export { WarpSurface, type WarpSurfaceConfig } from './warp/WarpSurface';
export { SurfacePicker, type SurfacePickerConfig } from './core/SurfacePicker';
export {
  ProjectionMapperGUI,
  type GUIAnchor,
  type ProjectionMapperGUIConfig
} from './core/ProjectionMapperGUI';
export { ProjectorCamera } from './core/ProjectorCamera';
export { MeshWarper, WARP_MODE, type MeshWarperConfig } from './warp/MeshWarper';
export { PolygonMask, type UVPoint } from './mask/PolygonMask';
