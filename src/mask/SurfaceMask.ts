/*
SurfaceMask
-----------
The mask uniforms of one surface, evaluated in its own content shader so every pixel the
warped mesh draws is masked and a masked pixel never covers another surface. The edge
feather reads content uv and follows the warp. The polygon reads output space and does not.
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
