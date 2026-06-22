export const TWEAKPANE_TRANSPARENCY = '0.9';
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

export const WARP_BUTTON_EYE_ICON = {
  enabled: true,
  sizePx: ICON_SIZE_PX,
  strokeWidth: ICON_STROKE_WIDTH,
  verticalShiftPx: 2,
} as const;
