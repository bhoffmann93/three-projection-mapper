/*
SurfacePicker
-------------
Canvas interaction for multi-surface calibration, the MadMapper/Resolume way:
click a surface to select it, drag its body to move it. Warp handles and polygon
anchors keep priority — a pointerdown that hits one is left to its DragControls,
so this only ever acts on the surface *body*.

Selection is controller-local state; nothing here is broadcast.
*/

import * as THREE from 'three';
import type { WarpSurface } from '../warp/WarpSurface';
import { SURFACE_PICKER } from './defaults';

export interface SurfacePickerConfig {
  domElement: HTMLElement;
  camera: THREE.Camera;
  getSurfaces: () => WarpSurface[];
  setActiveSurface: (id: string) => void;
  /** Called after a body drag ends, so callers can persist or broadcast */
  onSurfaceMoved?: (surface: WarpSurface) => void;
  /** A press that landed anywhere but a handle — the keyboard selection ends there */
  onPressedAwayFromHandles?: () => void;
}

export class SurfacePicker {
  private config: SurfacePickerConfig;
  private raycaster = new THREE.Raycaster();
  private enabled = true;

  private hovered: WarpSurface | null = null;
  private dragging: WarpSurface | null = null;
  private dragStart = new THREE.Vector2();
  private lastWorld = new THREE.Vector3();
  private movedPastThreshold = false;

  private onPointerDown: (e: PointerEvent) => void;
  private onPointerMove: (e: PointerEvent) => void;
  private onPointerUp: (e: PointerEvent) => void;

  constructor(config: SurfacePickerConfig) {
    this.config = config;

    this.onPointerDown = (e) => this.handlePointerDown(e);
    this.onPointerMove = (e) => this.handlePointerMove(e);
    this.onPointerUp = (e) => this.handlePointerUp(e);

    const el = config.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
  }

  /** Disabled in projector mode and whenever all controls are hidden */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.endDrag();
      this.setHovered(null);
      this.config.domElement.style.cursor = '';
    }
  }

  private toNDC(event: PointerEvent): THREE.Vector2 {
    const rect = this.config.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  /** Pointer position on the z=0 plane the surfaces live in */
  private toWorld(event: PointerEvent): THREE.Vector3 {
    const ndc = this.toNDC(event);
    return new THREE.Vector3(ndc.x, ndc.y, 0).unproject(this.config.camera).setZ(0);
  }

  /** True when a warp handle or polygon anchor is under the pointer */
  private hitsHandle(): boolean {
    const handles: THREE.Object3D[] = [];
    for (const surface of this.config.getSurfaces()) {
      handles.push(...surface.getWarper().getHandleObjects());
      const polygon = surface.getPolygonMask();
      if (polygon) handles.push(...polygon.getAnchorObjects());
    }
    return handles.length > 0 && this.raycaster.intersectObjects(handles, false).length > 0;
  }

  /**
   * Topmost surface under the pointer, by point-in-quad against the warped
   * corner points — the meshes cannot be raycast, see MeshWarper.containsPoint.
   * Later in the list wins an overlap, which is the same order they are drawn in
   * (ProjectionMapper.applyRenderOrder), so clicking picks what you can see.
   */
  private pickSurface(world: THREE.Vector3): WarpSurface | null {
    const surfaces = this.config.getSurfaces();
    for (let i = surfaces.length - 1; i >= 0; i--) {
      if (surfaces[i].getWarper().containsPoint(world.x, world.y)) return surfaces[i];
    }
    return null;
  }

  private handlePointerDown(event: PointerEvent): void {
    if (!this.enabled || event.button !== 0) return;

    this.raycaster.setFromCamera(this.toNDC(event), this.config.camera);
    if (this.hitsHandle()) return;

    // Past this point the press is on a body or on empty space, so whatever the
    // arrow keys were pointing at is no longer what the user is working on
    this.config.onPressedAwayFromHandles?.();

    const world = this.toWorld(event);
    const surface = this.pickSurface(world);
    if (!surface) return; // empty space keeps the current selection

    this.config.setActiveSurface(surface.id);

    this.dragging = surface;
    this.movedPastThreshold = false;
    this.dragStart.set(event.clientX, event.clientY);
    this.lastWorld.copy(world);
    this.config.domElement.setPointerCapture(event.pointerId);
  }

  private handlePointerMove(event: PointerEvent): void {
    if (!this.enabled) return;

    if (this.dragging) {
      const travel = Math.hypot(event.clientX - this.dragStart.x, event.clientY - this.dragStart.y);
      if (!this.movedPastThreshold && travel < SURFACE_PICKER.dragThresholdPixels) return;
      this.movedPastThreshold = true;

      const world = this.toWorld(event);
      this.dragging.translate(world.x - this.lastWorld.x, world.y - this.lastWorld.y);
      this.lastWorld.copy(world);
      this.config.domElement.style.cursor = 'grabbing';
      return;
    }

    this.raycaster.setFromCamera(this.toNDC(event), this.config.camera);
    if (this.hitsHandle()) {
      this.setHovered(null);
      this.config.domElement.style.cursor = '';
      return;
    }

    const surface = this.pickSurface(this.toWorld(event));
    this.setHovered(surface);
    this.config.domElement.style.cursor = surface ? 'move' : '';
  }

  private handlePointerUp(event: PointerEvent): void {
    if (!this.dragging) return;
    const moved = this.movedPastThreshold;
    const surface = this.dragging;

    if (this.config.domElement.hasPointerCapture(event.pointerId)) {
      this.config.domElement.releasePointerCapture(event.pointerId);
    }
    this.endDrag();

    if (moved) this.config.onSurfaceMoved?.(surface);
  }

  private endDrag(): void {
    this.dragging = null;
    this.movedPastThreshold = false;
    this.config.domElement.style.cursor = '';
  }

  private setHovered(surface: WarpSurface | null): void {
    if (this.hovered === surface) return;
    this.hovered?.setHovered(false);
    this.hovered = surface;
    this.hovered?.setHovered(true);
  }

  dispose(): void {
    const el = this.config.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerUp);
    el.style.cursor = '';
  }
}

export default SurfacePicker;
