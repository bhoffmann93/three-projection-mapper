export const RenderOrder = {
  CONTENT: 0, //MeshWarper warp.vert projection.frag
  MASK: 1, //MaskPlane perspective.vert mask.frag
  CONTROLS: 2, //GUI
} as const;
