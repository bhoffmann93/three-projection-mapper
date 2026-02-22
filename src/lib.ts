export { ProjectionMapper, type ProjectionMapperConfig } from './ProjectionMapper';
export { ProjectionMapperGUI, GUI_ANCHOR, GUI_STORAGE_KEY, type ProjectionMapperGUISettings } from './ProjectionMapperGUI';
export { MeshWarper, WARP_MODE, type MeshWarperConfig } from './MeshWarper';
export { calculateGridPoints } from './geometry';

// New exports for refactored architecture
export { ProjectionLibrary, type ProjectionLibraryConfig } from './ProjectionLibrary';

// NOTE: createContentScene and createProjectorCamera are NOT exported
// They are example code only - users should create their own content
