export const CAMERA_STORAGE_KEY = 'projection-camera-settings';
export const CAMERA_SYNC_CHANNEL = 'projection-camera-sync';

export interface CameraSettings {
  throwRatio: number;
  lensShiftY: number;
  camX: number;
  camY: number;
  camZ: number;
  camRotX: number;
  camRotY: number;
  cubeRotX: number;
  cubeRotY: number;
}

export const defaultCameraSettings: CameraSettings = {
  throwRatio: 1.65,
  lensShiftY: 1.0,
  camX: 0,
  camY: 0.05,
  camZ: 1.0,
  camRotX: 0,
  camRotY: 0,
  cubeRotX: Math.PI,
  cubeRotY: Math.PI * 0.25,
};

export function loadCameraSettings(): CameraSettings {
  try {
    const raw = localStorage.getItem(CAMERA_STORAGE_KEY);
    if (raw) return { ...defaultCameraSettings, ...JSON.parse(raw) };
  } catch {}
  return { ...defaultCameraSettings };
}

export function saveCameraSettings(settings: CameraSettings): void {
  localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(settings));
}
