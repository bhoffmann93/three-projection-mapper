// Core library exports
export { ProjectionMapper, type ProjectionMapperConfig } from './ProjectionMapper';
export { ProjectionMapperGUI, GUI_ANCHOR, GUI_STORAGE_KEY, type ProjectionMapperGUISettings } from './ProjectionMapperGUI';
export { MeshWarper, WARP_MODE, type MeshWarperConfig } from './MeshWarper';
export { calculateGridPoints } from './geometry';

// Legacy export (deprecated - use ProjectionMapper + WindowSync instead)
/**
 * @deprecated Use ProjectionMapper with WindowSync addon instead
 * ```typescript
 * // Old way (deprecated):
 * const library = new ProjectionLibrary({ mode: 'controller' });
 *
 * // New way (recommended):
 * const renderer = new THREE.WebGLRenderer();
 * const renderTarget = new THREE.WebGLRenderTarget(1280, 800);
 * const mapper = new ProjectionMapper(renderer, renderTarget.texture);
 *
 * // Optional: Add multi-window support
 * import { WindowSync } from 'three-projection-mapper/addons';
 * const sync = new WindowSync(mapper);
 * ```
 */
export { ProjectionLibrary, type ProjectionLibraryConfig } from './ProjectionLibrary';
