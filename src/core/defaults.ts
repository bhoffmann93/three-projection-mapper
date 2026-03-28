export const GUI_STORAGE_KEY = 'projection-mapper-gui-settings';

//Default initialized values if nothing from local storage is loaded
export const DEFAULTS = {
  segments: 50,
  zoom: 0.5,
  antialias: true,
  minGridWarpPoints: 4, // default other axis gets calculated from aspect ratio
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
export const MAX_POLYGON_POINTS = 16;

/** Visual style of warp control handles. Sizes in screen pixels. */
export const WARP_HANDLE_STYLE = {
  cornerPointPixelRadius: 20,
  gridPointPixelRadius: 15,
  outlineLineWidth: 4,
  cornerColor: 'hsl(23, 80%, 80%)',
  gridColor: 'orange',
  outlineColor: 'orange',
} as const;

/** Visual style of polygon mask handles. Sizes in screen pixels. */
export const POLYGON_HANDLE_STYLE = {
  anchorPointPixelRadius: 5,
  edgeHitPixelRadius: 8,
  lineWidth: 1, // WebGL LineBasicMaterial linewidth is ignored by most drivers (always 1px)
  color: 0x00ffff,
  doubleClickInsertGuardMs: 300,
} as const;
