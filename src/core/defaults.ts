export const GUI_STORAGE_KEY = 'projection-mapper-gui-settings';
export const SHOW_ACES_TOGGLE = false;
export const STORAGE_VERSION = 6; //when making breaking changes just increment so old data gets wiped

//Default initialized values if nothing from local storage is loaded
export const DEFAULTS = {
  segments: 50,
  zoom: 0.5,
  antialias: true,
  minGridWarpPoints: 4, // default other axis gets calculated from aspect ratio
} as const;

/** How far the preview can pull back from the output canvas */
export const ZOOM_RANGE = {
  minimum: 0.1,
  maximum: 1.0,
} as const;

/**
 * Wheel and trackpad zoom. Applied multiplicatively so a notch feels the same
 * whether pulled back or close in, and deltaY varies enormously between devices.
 */
export const WHEEL_ZOOM = {
  sensitivity: 0.0015,
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

export interface Resolution {
  width: number;
  height: number;
}

/**
 * Internal world height every surface plane shares. Widths follow each
 * surface's own aspect, so surfaces of different shapes are the same height
 * rather than the same area — predictable when laying several out side by side.
 */
export const WORLD_PLANE_HEIGHT = 10;

/**
 * Pixel size of a texture. Loaded images carry it on `image` as the HTML element,
 * render targets as a plain `{ width, height }` — both are read the same way.
 * three types `image` as unknown, so the shape is asserted here once rather than
 * at every call site.
 */
export const textureResolution = (texture: { image?: unknown }): Resolution => {
  const image = texture.image as { width?: number; height?: number } | undefined;
  return { width: image?.width ?? 0, height: image?.height ?? 0 };
};

/**
 * A surface's plane size in world units.
 *
 * This is the surface's own shape in the output and is deliberately independent
 * of the input buffer's resolution: the buffer is the source pixels, `uvRect`
 * picks the slice of it this surface samples, and this decides the shape that
 * slice is drawn into. They coincide only when one surface samples the whole
 * buffer. Content appears undistorted when a surface's resolution matches the
 * region it samples, i.e. bufferResolution * uvRect scale.
 */
export const planeSizeFor = (resolution: Resolution): { width: number; height: number } => ({
  width: WORLD_PLANE_HEIGHT * (resolution.width / resolution.height),
  height: WORLD_PLANE_HEIGHT,
});

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

/**
 * Suffix a storage key with the parts that scope it.
 *
 * Every app served from one origin shares localStorage, so without an `appId`
 * they share one calibration — and since the surface *list* is persisted, a
 * second app that created two surfaces makes a single-surface app build two.
 * Empty parts are dropped, so an app with no id and the default surface still
 * reads and writes the original un-namespaced keys.
 */
export const scopedStorageKey = (base: string, ...parts: (string | undefined)[]): string =>
  [base, ...parts.filter((part): part is string => !!part)].join(':');

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

/** The dashed boundary showing what the projector frames. Controller only. */
export const OUTPUT_FRAME_STYLE = {
  color: 'hsl(0, 0%, 55%)',
  lineWidth: 2,
  opacity: 0.7,
  dashSize: 0.35,
  gapSize: 0.25,
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
