export const GUI_STORAGE_KEY = 'projection-mapper-gui-settings';

export const DEFAULTS = {
  segments: 50,
  zoom: 0.5,
  antialias: true,
  minGridWarpPoints: 4, // default other axis gets calculated from aspect ratio
  maxGridWarpPoints: 10,
} as const;

export const MESH_WARP_GRID_SIZE = {
  minimum: 2,
  maximum: 10,
} as const;

export interface ImageSettings {
  maskEnabled: boolean;
  feather: number;
  tonemap: boolean;
  gamma: number;
  contrast: number;
  hue: number;
}

export const DEFAULT_IMAGE_SETTINGS: Readonly<ImageSettings> = {
  maskEnabled: false,
  feather: 0.05,
  tonemap: false,
  gamma: 1.0,
  contrast: 1.0,
  hue: 0.0,
};

export const DEFAULT_POLYGON_FEATHER = 0.005;

/** Maximum polygon mask nodes. Injected into mask.frag as a #define via ShaderMaterial.defines. */
export const MAX_POLYGON_POINTS = 16;
