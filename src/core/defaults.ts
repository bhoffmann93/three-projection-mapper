export const GUI_STORAGE_KEY = 'projection-mapper-gui-settings';

export interface ImageSettings {
  maskEnabled: boolean;
  feather: number;
  tonemap: boolean;
  gamma: number;
  contrast: number;
  hue: number;
}

export const DEFAULT_POLYGON_FEATHER = 0.005;

export const DEFAULT_IMAGE_SETTINGS: Readonly<ImageSettings> = {
  maskEnabled: false,
  feather: 0.05,
  tonemap: false,
  gamma: 1.0,
  contrast: 1.0,
  hue: 0.0,
};
