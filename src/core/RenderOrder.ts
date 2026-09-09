/**
 * Draw order layers. Content is a base a surface's index is added to, so
 * overlapping surfaces stack in list order rather than relying on three's
 * tie-breaking between objects at the same depth. The gaps keep masks and
 * controls above any plausible number of surfaces.
 */
export const RenderOrder = {
  CONTENT: 0, //MeshWarper warp.vert projection.frag, plus the surface's index
  MASK: 1000, //MaskPlane perspective.vert mask.frag
  CONTROLS: 2000, //GUI
  /** Badges drawn over the controls, so the outline cannot cover one */
  CONTROLS_BADGE: 2100,
} as const;
