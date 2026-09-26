/*
SurfaceMask
-----------
The mask uniforms of one surface — edge feather and polygon — evaluated inside the
surface's own content shader (projection.frag) rather than on a separate overlay.

Evaluating in the content shader means every pixel the warped mesh draws is masked,
including ones the grid warp pushes outside the corner quad, and a masked pixel of
one surface no longer blacks out another surface underneath it.

The two masks live in different spaces:
  Edge feather → content vUv, so it follows the grid warp along the image edges.
  Polygon      → output space, fixed while corners and grid points move, so it keeps
                 covering a light leak during calibration. The fragment shader reads
                 it from the fragment's world position, which also reaches past the
                 corner quad wherever the grid warp pushes the mesh.
*/

import * as THREE from 'three';
import { DEFAULT_POLYGON_FEATHER, MAX_POLYGON_POINTS } from '../core/defaults';
import type { UVPoint } from './PolygonMask';

export class SurfaceMask {
  /** Merged into the surface's WarpMaterial uniforms by reference */
  readonly uniforms = {
    uFlatPlaneSize: { value: new THREE.Vector2() },
    uMaskEnabled: { value: false },
    uFeather: { value: 0 },
    uPolygonMaskEnabled: { value: false },
    uPolygonInvert: { value: false },
    uPolygonPointCount: { value: 0 },
    uPolygonPoints: { value: Array.from({ length: MAX_POLYGON_POINTS }, () => new THREE.Vector2()) },
    uPolygonFeather: { value: DEFAULT_POLYGON_FEATHER },
  };

  constructor(flatWidth: number, flatHeight: number) {
    this.uniforms.uFlatPlaneSize.value.set(flatWidth, flatHeight);
  }

  setFeatherMask(enabled: boolean, amount: number): void {
    this.uniforms.uMaskEnabled.value = enabled;
    this.uniforms.uFeather.value = amount;
  }

  setPolygonNodes(nodes: readonly UVPoint[]): void {
    if (nodes.length > MAX_POLYGON_POINTS) {
      throw new Error(`PolygonMask: node count ${nodes.length} exceeds MAX_POLYGON_POINTS (${MAX_POLYGON_POINTS})`);
    }
    this.uniforms.uPolygonPointCount.value = nodes.length;
    for (let i = 0; i < nodes.length; i++) {
      this.uniforms.uPolygonPoints.value[i].set(nodes[i].u, nodes[i].v);
    }
  }

  setPolygonMaskEnabled(enabled: boolean): void {
    this.uniforms.uPolygonMaskEnabled.value = enabled;
  }

  getPolygonMaskEnabled(): boolean {
    return this.uniforms.uPolygonMaskEnabled.value;
  }

  setPolygonInvert(invert: boolean): void {
    this.uniforms.uPolygonInvert.value = invert;
  }

  getPolygonInvert(): boolean {
    return this.uniforms.uPolygonInvert.value;
  }

  getPolygonFeather(): number {
    return this.uniforms.uPolygonFeather.value;
  }

  setPolygonFeather(feather: number): void {
    this.uniforms.uPolygonFeather.value = feather;
  }
}
