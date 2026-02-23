/**
 * Shared projector camera factory
 * Creates the camera with Acer X1383WH projector settings
 * Used across example, controller, and projector windows
 */

import * as THREE from 'three';

export interface ProjectorCameraConfig {
  distToSurface?: number;
  lensCenterY?: number;
  throwRatio?: number;
  physicalTilt?: number;
  lensShiftY?: number;
  aspect?: number;
}

export interface ProjectorCameraResult {
  camera: THREE.PerspectiveCamera;
  lensShiftY: number;
}

export function createProjectorCamera(config: ProjectorCameraConfig = {}): ProjectorCameraResult {
  const {
    distToSurface = 1.5,
    lensCenterY = 0.05,
    throwRatio = 1.65, // 1.55-1.7 based on zoom for Acer X1383WH
    physicalTilt = 0,
    lensShiftY = 1.0, // Vertical lens shift (100%)
    aspect = 1280 / 800,
  } = config;

  // Calculate FOV from throw ratio
  const fovH = 2 * Math.atan(1 / (2 * throwRatio));
  const fovV = 2 * Math.atan(Math.tan(fovH / 2) / aspect);
  const fovDegrees = fovV * (180 / Math.PI);

  // Create camera
  const camera = new THREE.PerspectiveCamera(fovDegrees, aspect, 0.1, 1000);
  camera.position.set(0.0, lensCenterY, distToSurface);
  camera.rotation.x = THREE.MathUtils.degToRad(physicalTilt);
  camera.updateProjectionMatrix();

  // Apply lens shift (Acer optical override)
  camera.projectionMatrix.elements[9] = lensShiftY;

  return { camera, lensShiftY };
}
