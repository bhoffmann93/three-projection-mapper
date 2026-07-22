/*
WarpSurface
-----------
One independently warped surface in a ProjectionMapper output. Owns a MeshWarper
(warp mesh, material, control points, drag handles) plus the rectangle of the
shared input texture it samples (uv rect) and its own warp persistence via a
storage namespace derived from its id. ProjectionMapper owns the surface list;
all surfaces share one scene, camera, renderer and input texture.
*/

import { MeshWarper, MeshWarperConfig } from './MeshWarper';
import { DEFAULT_SURFACE_ID, DEFAULT_UV_RECT } from '../core/defaults';
import type { UvRect } from '../core/defaults';

export interface WarpSurfaceConfig {
  id: string;
  uvRect?: UvRect;
  warper: Omit<MeshWarperConfig, 'storageNamespace'>;
}

export class WarpSurface {
  readonly id: string;

  private warper: MeshWarper;
  private uvRect: UvRect;

  /** The default surface keeps the legacy un-namespaced key so existing calibrations survive */
  static storageNamespace(id: string): string | undefined {
    return id === DEFAULT_SURFACE_ID ? undefined : `surface-${id}`;
  }

  constructor(config: WarpSurfaceConfig) {
    this.id = config.id;
    this.uvRect = { ...DEFAULT_UV_RECT, ...config.uvRect };
    this.warper = new MeshWarper({
      ...config.warper,
      storageNamespace: WarpSurface.storageNamespace(config.id),
    });
    this.warper.setUvRect(this.uvRect.offsetX, this.uvRect.offsetY, this.uvRect.scaleX, this.uvRect.scaleY);
  }

  getWarper(): MeshWarper {
    return this.warper;
  }

  setUvRect(offsetX: number, offsetY: number, scaleX: number, scaleY: number): void {
    this.uvRect = { offsetX, offsetY, scaleX, scaleY };
    this.warper.setUvRect(offsetX, offsetY, scaleX, scaleY);
  }

  getUvRect(): UvRect {
    return { ...this.uvRect };
  }

  /** Move the whole surface by a world-space delta, preserving its warp */
  translate(dx: number, dy: number): void {
    this.warper.translate(dx, dy);
  }

  /** Move the surface's centroid to an absolute world-space position, preserving its warp */
  setPosition(x: number, y: number): void {
    this.warper.setPosition(x, y);
  }

  dispose(): void {
    this.warper.dispose();
  }
}

export default WarpSurface;
