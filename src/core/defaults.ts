export const GUI_STORAGE_KEY = 'projection-mapper-gui-settings';
export const SHOW_ACES_TOGGLE = false;
export const STORAGE_VERSION = 5; //when making breaking changes just increment so old data gets wiped

//Default initialized values if nothing from local storage is loaded
export const DEFAULTS = {
  segments: 50,
  zoom: 0.5,
  antialias: true,
  minGridWarpPoints: 4, // default other axis gets calculated from aspect ratio
} as const;

//just a clamp
export const MESH_WARP_GRID_SIZE = {
  minimum: 2,
  maximum: 10,
} as const;

/** Global image adjustments — shared by every surface */
export interface ImageSettings {
  tonemap: boolean;
  shadows: number;
  gamma: number;
  highlights: number;
  contrast: number;
  saturation: number;
  hue: number;
}

/** Edge feather is per surface, not part of the global image adjustments */
export interface EdgeMaskSettings {
  maskEnabled: boolean;
  feather: number;
}

export const DEFAULT_EDGE_MASK: Readonly<EdgeMaskSettings> = {
  maskEnabled: false,
  feather: 0.05,
};

export const DEFAULT_IMAGE_SETTINGS: Readonly<ImageSettings> = {
  tonemap: false,
  shadows: 0.0,
  gamma: 1.0,
  highlights: 1.0,
  contrast: 1.0,
  saturation: 1.0,
  hue: 0.0,
};

/** Crop rectangle of the input texture a surface samples (normalized 0-1) */
export interface UvRect {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
}

export const DEFAULT_UV_RECT: Readonly<UvRect> = {
  offsetX: 0,
  offsetY: 0,
  scaleX: 1,
  scaleY: 1,
};

/** The initial surface keeps the legacy un-namespaced warp storage key */
export const DEFAULT_SURFACE_ID = '0';
export const SURFACES_STORAGE_KEY = 'projection-mapper-surfaces';

export const DEFAULT_POLYGON_FEATHER = 0.0;
export const MAX_POLYGON_POINTS = 16;

/** Polygon mask settings that live on a surface alongside its node list */
export interface PolygonMaskSettings {
  enabled: boolean;
  inverted: boolean;
  feather: number;
}

export const DEFAULT_POLYGON_MASK_SETTINGS: Readonly<PolygonMaskSettings> = {
  enabled: true,
  inverted: false,
  feather: DEFAULT_POLYGON_FEATHER,
};

/**
 * Visual style of warp control handles. Sizes in screen pixels.
 * A surface's outline is drawn in one of three states: the selected surface
 * (active), the one under the cursor (hover), or any other surface (inactive).
 */
export const WARP_HANDLE_STYLE = {
  cornerPointPixelRadius: 20,
  gridPointPixelRadius: 15,
  outlineLineWidth: 4,
  cornerColor: 'hsl(23, 80%, 80%)',
  gridColor: 'orange',
  outlineColor: 'orange',
  inactiveOutlineColor: 'hsl(30, 40%, 45%)',
  inactiveOutlineOpacity: 0.55,
  inactiveOutlineLineWidth: 2,
  hoverOutlineColor: 'hsl(38, 100%, 72%)',
  hoverOutlineOpacity: 1.0,
} as const;

/** Canvas interaction thresholds for selecting and moving surfaces */
export const SURFACE_PICKER = {
  /** Pointer travel (px) before a pointerdown counts as a body drag rather than a click */
  dragThresholdPixels: 3,
} as const;

/** Visual style of polygon mask handles. Sizes in screen pixels. */
export const POLYGON_HANDLE_STYLE = {
  anchorPointPixelRadius: 5,
  edgeHitPixelRadius: 8,
  lineWidth: 1, // WebGL LineBasicMaterial linewidth is ignored by most drivers (always 1px)
  color: 0x00ffff,
  doubleClickInsertGuardMs: 300,
} as const;
