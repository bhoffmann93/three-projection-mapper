import * as THREE from 'three';
import { calculateFovFromThrowRatio } from '../utils/projection';

export class ProjectorCamera extends THREE.PerspectiveCamera {
  //lensShiftY is a fixed number set by the projector eg 1 for 100% or 1.1 for 110%
  public lensShiftY: number;
  public throwRatio: number;

  constructor(throwRatio: number, lensShiftY: number, aspect: number, near: number = 0.1, far: number = 1000) {
    const fov = calculateFovFromThrowRatio(throwRatio, aspect);
    super(fov, aspect, near, far);
    this.throwRatio = throwRatio;
    this.lensShiftY = lensShiftY;
    this.updateProjectionMatrix();
  }

  updateProjectionMatrix() {
    super.updateProjectionMatrix();
    this.projectionMatrix.elements[9] = this.lensShiftY;
  }
}

export default ProjectorCamera;
