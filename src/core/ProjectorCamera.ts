import * as THREE from 'three';
import { calculateFovFromThrowRatio } from '../utils/projection';

/**
 * Perspective camera configured for real-world projector optics.
 *
 * Handles throw ratio (distance-to-width ratio) and vertical lens shift,
 * common parameters in professional projection systems that allow physical
 * keystone correction without digital warping.
 */
export class ProjectorCamera extends THREE.PerspectiveCamera {
  public readonly throwRatio: number;
  public lensShiftY: number;

  constructor(throwRatio: number, lensShiftY: number, aspect: number, near: number = 0.1, far: number = 1000) {
    const fov = calculateFovFromThrowRatio(throwRatio, aspect);
    super(fov, aspect, near, far);
    this.throwRatio = throwRatio;
    this.lensShiftY = lensShiftY;
    this.updateProjectionMatrix();
  }

  override updateProjectionMatrix(): void {
    super.updateProjectionMatrix();
    // Modify projection matrix element [9] (row 2, col 1) to apply vertical lens shift
    // This simulates physical projector lens shift by offsetting the view frustum vertically
    this.projectionMatrix.elements[9] = this.lensShiftY;
  }
}

export default ProjectorCamera;
