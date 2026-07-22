/** Shared by the multi surface controller and its projector window */
export const MULTI_SURFACE_CONFIG = {
  appId: 'multi-surface',
  /** One atlas region, and the shape of each surface that samples one */
  regionResolution: { width: 1080, height: 1080 },
  /** Two regions side by side */
  bufferResolution: { width: 2160, height: 1080 },
  /**
   * The output canvas: what the projector frames, and the space surfaces are laid
   * out inside. Independent of the buffer — this is the projector's resolution.
   */
  outputResolution: { width: 1920, height: 1080 },
  /**
   * Shape of the cube surface, deliberately unlike the square atlas region it
   * samples and unlike the two surfaces beside it. It has to arrive as the
   * mapper's default surface shape, because the first surface is created by the
   * constructor before any example code can give it one of its own.
   */
  cubeSurfaceResolution: { width: 1920, height: 1080 },
  /**
   * Ids rather than list positions. The list is the overlap order and reordering
   * rewrites it, so an index is only correct until someone presses Front.
   */
  cubeSurfaceId: '0', // the surface the mapper creates for us
  shaderSurfaceId: 'shader',
  /** The surface that ignores the atlas and samples this image instead */
  imageSurfaceId: 'image',
  imagePath: '/static/uv-grid.jpg',
} as const;

export default MULTI_SURFACE_CONFIG;
