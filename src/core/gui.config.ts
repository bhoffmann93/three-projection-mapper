import type { ImageSettings } from './defaults';

export const TWEAKPANE_TRANSPARENCY = '0.9';

/** Titles the surface folder by count, so it reads honestly with one surface */
export const SURFACE_FOLDER_TITLE = {
  singular: 'Surface',
  plural: 'Surfaces',
} as const;

/** Slider definitions for the per-surface image folder, in display order */
export const IMAGE_CONTROLS = [
  { key: 'shadows', label: 'Blacks', min: 0, max: 0.99, step: 0.001 },
  { key: 'gamma', label: 'Gamma', min: 0.1, max: 4.0, step: 0.01 },
  { key: 'highlights', label: 'Whites', min: 0.01, max: 1, step: 0.001 },
  { key: 'contrast', label: 'Contrast', min: 1.0, max: 2.0, step: 0.01 },
  { key: 'saturation', label: 'Sat', min: 0, max: 2.0, step: 0.01 },
  { key: 'hue', label: 'Hue', min: -0.5, max: 0.5, step: 0.01 },
] as const satisfies readonly {
  key: keyof ImageSettings;
  label: string;
  min: number;
  max: number;
  step: number;
}[];
export const RESET_BUTTON_COLOR = 'oklch(60% 0.05 30)';

export const TOGGLE_ENABLED_OPACITY = '1';
export const TOGGLE_DISABLED_OPACITY = '0.35';

export const ICON_SIZE_PX = 12;
export const ICON_STROKE_WIDTH = 2.5;

export const MASK_TOGGLE_BUTTON = {
  widthPx: 55,
  heightPx: 20,
  fontSizePx: 11,
  iconSizePx: ICON_SIZE_PX,
  iconStrokeWidth: ICON_STROKE_WIDTH,
} as const;

export const OPEN_PROJECTOR_BUTTON_ICON = {
  sizePx: ICON_SIZE_PX * 1.25,
  strokeWidth: ICON_STROKE_WIDTH / 1.25,
  verticalShiftPx: 2,
} as const;

/** Chevrons on the surface order buttons, matching the effect stack's move controls */
export const SURFACE_ORDER_ICON = {
  sizePx: ICON_SIZE_PX,
  strokeWidth: ICON_STROKE_WIDTH,
  verticalShiftPx: 2,
} as const;

export const WARP_BUTTON_EYE_ICON = {
  enabled: true,
  sizePx: ICON_SIZE_PX,
  strokeWidth: ICON_STROKE_WIDTH,
  verticalShiftPx: 2,
} as const;
