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
  /** The surface that ignores the atlas and samples this image instead */
  imageSurfaceId: 'image',
  imagePath: '/static/uv-grid.jpg',
} as const;

export default MULTI_SURFACE_CONFIG;
