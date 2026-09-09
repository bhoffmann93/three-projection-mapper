/*
ProjectorView
-------------
The orthographic camera that frames the output canvas, and the ways of moving it.

The frustum contains the canvas: whichever axis is tighter locks to it and the
other shows extra world. An aspect mismatch between window and output therefore
letterboxes rather than stretching, and resizing the window proportionally
changes nothing about where surfaces land.

Zoom below 1 pulls back to show more than the output — the controller previews
that way, which is why the canvas boundary is drawn.
*/

import * as THREE from 'three';
import { ZOOM_RANGE, WHEEL_ZOOM } from './defaults';
import { clamp } from '../utils/math';
import { ListenerSet } from '../utils/ListenerSet';

export interface ProjectorViewConfig {
  domElement: HTMLElement;
  /** Output canvas in world units */
  planeSize: { width: number; height: number };
  zoom: number;
  wheelZoom: boolean;
}

export class ProjectorView {
  readonly camera: THREE.OrthographicCamera;

  private planeSize: { width: number; height: number };
  private zoom: number;
  private domElement: HTMLElement;
  private zoomChanged = new ListenerSet<[zoom: number]>();
  private interactive = true;
  private onWheel: ((event: WheelEvent) => void) | null = null;

  constructor(config: ProjectorViewConfig) {
    this.domElement = config.domElement;
    this.planeSize = config.planeSize;
    this.zoom = config.zoom;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.set(0, 0, 20);
    this.camera.lookAt(0, 0, 0);
    this.updateFrustum();

    if (config.wheelZoom) this.attachWheelZoom();
  }

  /** The canvas changed shape, so what the camera frames changes with it */
  setPlaneSize(width: number, height: number): void {
    this.planeSize = { width, height };
    this.updateFrustum();
  }

  setZoom(zoom: number): void {
    const clamped = clamp(zoom, ZOOM_RANGE.minimum, ZOOM_RANGE.maximum);
    if (clamped === this.zoom) return;
    this.zoom = clamped;
    this.updateFrustum();
    this.zoomChanged.emit(clamped);
  }

  getZoom(): number {
    return this.zoom;
  }

  onZoomChanged(listener: (zoom: number) => void): () => void {
    return this.zoomChanged.add(listener);
  }

  setOffset(x: number, y: number): void {
    this.camera.position.x = x;
    this.camera.position.y = y;
  }

  getOffset(): { x: number; y: number } {
    return { x: this.camera.position.x, y: this.camera.position.y };
  }

  /** Receive-only windows do not zoom */
  setInteractive(interactive: boolean): void {
    this.interactive = interactive;
  }

  updateFrustum(): void {
    const windowAspect = window.innerWidth / window.innerHeight;
    const planeAspect = this.planeSize.width / this.planeSize.height;
    const scale = 1 / this.zoom;

    if (windowAspect > planeAspect) {
      this.camera.top = (this.planeSize.height / 2) * scale;
      this.camera.bottom = (-this.planeSize.height / 2) * scale;
      this.camera.left = ((-this.planeSize.height * windowAspect) / 2) * scale;
      this.camera.right = ((this.planeSize.height * windowAspect) / 2) * scale;
    } else {
      this.camera.left = (-this.planeSize.width / 2) * scale;
      this.camera.right = (this.planeSize.width / 2) * scale;
      this.camera.top = (this.planeSize.width / windowAspect / 2) * scale;
      this.camera.bottom = (-this.planeSize.width / windowAspect / 2) * scale;
    }

    this.camera.updateProjectionMatrix();
  }

  /**
   * Wheel and trackpad pinch. Multiplicative so a notch feels the same at any
   * zoom, and the view stays centred — there is no canvas panning, so anchoring
   * the zoom to the cursor could drift the canvas off screen with no way back.
   */
  private attachWheelZoom(): void {
    this.onWheel = (event: WheelEvent) => {
      if (!this.interactive) return;
      event.preventDefault();
      this.setZoom(this.zoom * Math.exp(-event.deltaY * WHEEL_ZOOM.sensitivity));
    };
    this.domElement.addEventListener('wheel', this.onWheel, { passive: false });
  }

  dispose(): void {
    if (this.onWheel) this.domElement.removeEventListener('wheel', this.onWheel);
  }
}
