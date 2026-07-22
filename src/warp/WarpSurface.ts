/*
WarpSurface
-----------
One independently warped surface in a ProjectionMapper output. Owns a MeshWarper
(warp mesh, material, control points, drag handles), the rectangle of the shared
input texture it samples (uv rect), and its own masks — an edge feather MaskPlane
plus an optional PolygonMask, both following this surface's perspective.
Warp points, polygon nodes and the surface record persist under a storage
namespace derived from the id. ProjectionMapper owns the surface list; all
surfaces share one scene, camera, renderer and input texture.
*/

import * as THREE from 'three';
import { MeshWarper, MeshWarperConfig } from './MeshWarper';
import type { OutlineState } from './MeshWarper';
import { MaskPlane } from '../mask/MaskPlane';
import { PolygonMask, type UVPoint } from '../mask/PolygonMask';
import {
  DEFAULT_SURFACE_ID,
  DEFAULT_UV_RECT,
  DEFAULT_EDGE_MASK,
  DEFAULT_POLYGON_MASK_SETTINGS,
} from '../core/defaults';
import type { UvRect, EdgeMaskSettings, PolygonMaskSettings } from '../core/defaults';

export interface WarpSurfaceMaskConfig {
  worldWidth: number;
  worldHeight: number;
  segments: number;
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
}

export interface WarpSurfaceConfig {
  id: string;
  uvRect?: UvRect;
  edgeMask?: EdgeMaskSettings;
  polygonMask?: PolygonMaskSettings;
  warper: Omit<MeshWarperConfig, 'storageNamespace'>;
  mask: WarpSurfaceMaskConfig;
}

export class WarpSurface {
  readonly id: string;

  private warper: MeshWarper;
  private maskPlane: MaskPlane;
  private polygonMask: PolygonMask | null = null;
  private maskConfig: WarpSurfaceMaskConfig;

  private uvRect: UvRect;
  private edgeMask: EdgeMaskSettings;
  private polygonSettings: PolygonMaskSettings;

  /** Selection and handle visibility together decide whether polygon handles show */
  private active = false;
  private handlesVisible = true;

  /** Called whenever this surface's polygon nodes change (drag, insert, delete) */
  public onPolygonNodesChanged: () => void = () => {};

  /** The default surface keeps the legacy un-namespaced keys so existing calibrations survive */
  static storageNamespace(id: string): string | undefined {
    return id === DEFAULT_SURFACE_ID ? undefined : `surface-${id}`;
  }

  constructor(config: WarpSurfaceConfig) {
    this.id = config.id;
    this.maskConfig = config.mask;
    this.uvRect = { ...DEFAULT_UV_RECT, ...config.uvRect };
    this.edgeMask = { ...DEFAULT_EDGE_MASK, ...config.edgeMask };
    this.polygonSettings = { ...DEFAULT_POLYGON_MASK_SETTINGS, ...config.polygonMask };

    this.warper = new MeshWarper({
      ...config.warper,
      storageNamespace: WarpSurface.storageNamespace(config.id),
    });
    this.warper.setUvRect(this.uvRect.offsetX, this.uvRect.offsetY, this.uvRect.scaleX, this.uvRect.scaleY);

    this.maskPlane = new MaskPlane({
      worldWidth: config.mask.worldWidth,
      worldHeight: config.mask.worldHeight,
      segments: config.mask.segments,
      scene: config.mask.scene,
      warpPlaneSizeRef: this.warper.getWarpPlaneSizeUniform(),
    });
    this.maskPlane.setFeatherMask(this.edgeMask.maskEnabled, this.edgeMask.feather);
  }

  getWarper(): MeshWarper {
    return this.warper;
  }

  getMaskPlane(): MaskPlane {
    return this.maskPlane;
  }

  private namespace(): string | undefined {
    return WarpSurface.storageNamespace(this.id);
  }

  // --- input crop -----------------------------------------------------------

  setUvRect(offsetX: number, offsetY: number, scaleX: number, scaleY: number): void {
    this.uvRect = { offsetX, offsetY, scaleX, scaleY };
    this.warper.setUvRect(offsetX, offsetY, scaleX, scaleY);
  }

  getUvRect(): UvRect {
    return { ...this.uvRect };
  }

  // --- placement ------------------------------------------------------------

  /** Move the whole surface by a world-space delta, preserving its warp */
  translate(dx: number, dy: number): void {
    this.warper.translate(dx, dy);
  }

  /** Move the surface's centroid to an absolute world-space position, preserving its warp */
  setPosition(x: number, y: number): void {
    this.warper.setPosition(x, y);
  }

  // --- edge feather ---------------------------------------------------------

  setEdgeFeather(enabled: boolean, amount: number = this.edgeMask.feather): void {
    this.edgeMask = { maskEnabled: enabled, feather: amount };
    this.maskPlane.setFeatherMask(enabled, amount);
  }

  getEdgeMask(): EdgeMaskSettings {
    return { ...this.edgeMask };
  }

  // --- polygon mask ---------------------------------------------------------

  /** Recreate a polygon mask persisted by a previous session, if there is one */
  restorePolygonMask(): PolygonMask | null {
    if (this.polygonMask) return this.polygonMask;
    if (!PolygonMask.hasStored(this.namespace())) return null;
    return this.addPolygonMask();
  }

  addPolygonMask(nodes?: UVPoint[]): PolygonMask {
    if (this.polygonMask) this.removePolygonMask();

    this.polygonMask = new PolygonMask(
      this.maskConfig.scene,
      this.maskConfig.camera,
      this.maskConfig.renderer,
      this.maskConfig.worldWidth,
      this.maskConfig.worldHeight,
      nodes,
      this.namespace(),
    );
    this.polygonMask.onChanged = () => {
      this.maskPlane.setPolygonNodes(this.polygonMask!.nodes);
      this.onPolygonNodesChanged();
    };

    this.maskPlane.setPolygonMaskEnabled(this.polygonSettings.enabled);
    this.maskPlane.setPolygonInvert(this.polygonSettings.inverted);
    this.maskPlane.setPolygonFeather(this.polygonSettings.feather);
    this.maskPlane.setPolygonNodes(this.polygonMask.nodes);

    this.applyPolygonInteractivity();
    this.onPolygonNodesChanged();
    return this.polygonMask;
  }

  resetPolygonMask(): void {
    if (!this.polygonMask) return;
    this.polygonMask.clearStorage();
    this.addPolygonMask();
  }

  removePolygonMask(): void {
    if (!this.polygonMask) return;
    this.polygonMask.dispose();
    this.polygonMask.clearStorage();
    this.polygonMask = null;
    this.maskPlane.setPolygonMaskEnabled(false);
    this.maskPlane.setPolygonNodes([]);
  }

  getPolygonMask(): PolygonMask | null {
    return this.polygonMask;
  }

  setPolygonMaskEnabled(enabled: boolean): void {
    this.polygonSettings.enabled = enabled;
    this.maskPlane.setPolygonMaskEnabled(enabled);
  }

  setPolygonInvert(inverted: boolean): void {
    this.polygonSettings.inverted = inverted;
    this.maskPlane.setPolygonInvert(inverted);
  }

  setPolygonFeather(feather: number): void {
    this.polygonSettings.feather = feather;
    this.maskPlane.setPolygonFeather(feather);
  }

  getPolygonSettings(): PolygonMaskSettings {
    return { ...this.polygonSettings };
  }

  /** Full polygon state for persistence and multi-window sync */
  getPolygonMaskState(): (PolygonMaskSettings & { nodes: UVPoint[] }) | null {
    if (!this.polygonMask) return null;
    return { ...this.polygonSettings, nodes: Array.from(this.polygonMask.nodes) };
  }

  // --- selection and visibility --------------------------------------------

  /** Only the active surface shows an accented outline and editable polygon handles */
  setActive(active: boolean): void {
    this.active = active;
    this.warper.setOutlineState(active ? 'active' : 'inactive');
    this.applyPolygonInteractivity();
  }

  isActive(): boolean {
    return this.active;
  }

  /** Hover highlight — ignored while this surface is the selected one */
  setHovered(hovered: boolean): void {
    if (this.active) return;
    this.warper.setOutlineState(hovered ? 'hover' : 'inactive');
  }

  setHandlesVisible(visible: boolean): void {
    this.handlesVisible = visible;
    this.applyPolygonInteractivity();
  }

  private applyPolygonInteractivity(): void {
    this.polygonMask?.setVisible(this.active && this.handlesVisible);
    this.polygonMask?.setDragEnabled(this.active);
  }

  setShouldWarp(enabled: boolean): void {
    this.warper.setShouldWarp(enabled);
    this.maskPlane.setShouldWarp(enabled);
  }

  setShowBorderLines(show: boolean): void {
    this.maskPlane.setShowBorderLines(show);
  }

  // --- per-frame ------------------------------------------------------------

  /** Keep this surface's masks and handles glued to its current perspective */
  syncMasks(pixelToWorld: number): void {
    this.warper.updateControlPointsScale(pixelToWorld);
    this.maskPlane.syncPerspective(this.warper.getPerspectiveCoeffs());

    if (this.polygonMask) {
      this.polygonMask.updateTransformedPositions(
        (x, y) => this.warper.applyPerspectiveTransform(x, y),
        (x, y) => this.warper.applyInversePerspectiveTransform(x, y),
      );
      this.polygonMask.updateControlPointsScale(pixelToWorld);
    }
  }

  // --- lifecycle ------------------------------------------------------------

  /** Forget this surface's persisted warp and polygon mask */
  clearStorage(): void {
    this.warper.clearStorage();
    this.polygonMask?.clearStorage();
  }

  dispose(): void {
    this.polygonMask?.dispose();
    this.maskPlane.dispose();
    this.warper.dispose();
  }
}

export default WarpSurface;
