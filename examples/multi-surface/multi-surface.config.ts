/** Shared by the multi surface controller and its projector window */
export const MULTI_SURFACE_CONFIG = {
  appId: 'multi-surface',
  /** One atlas region, and the shape of each surface that samples one */
  regionResolution: { width: 1080, height: 1080 },
  /** Two regions side by side */
  bufferResolution: { width: 2160, height: 1080 },
  /** The surface that ignores the atlas and samples this image instead */
  imageSurfaceId: 'image',
  imagePath: '/static/screenshot-warp.png',
} as const;

export default MULTI_SURFACE_CONFIG;
