/*
OffscreenHandleMarkers
----------------------
DOM markers for warp handles that sit outside the window.

Keyboard nudging lets a handle leave the window, which it has to be able to do —
but a handle you cannot see is a handle you cannot get back, and in single-window
mode there is no zooming out to go looking for it. So each off-screen handle
keeps a marker pinned to the window edge, pointing at where it went, and clicking
the marker selects that handle so the arrow keys can walk it home.

Grid points count, not just corners: dragging a corner pulls the whole grid
through the homography with it, so a corner heading off screen takes grid points
along, and they need markers just as much. Markers that would pile up on the same
spot collapse to one, or a corner leaving would strand a dozen chips on top of
each other.

DOM rather than scene objects: this is controller chrome that must stay legible
whatever the camera is doing, and it needs to be clickable independently of the
handles' DragControls.
*/

import * as THREE from 'three';
import type { WarpSurface } from '../warp/WarpSurface';
import { OFFSCREEN_MARKER, PANE_THEME, WARP_HANDLE_STYLE } from './defaults';

export interface OffscreenHandleMarkersConfig {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  /** The surface whose handles are tracked — the active one */
  getSurface: () => WarpSurface | null;
  /** False on projector windows and whenever the controls are hidden */
  isEnabled: () => boolean;
}

export class OffscreenHandleMarkers {
  private config: OffscreenHandleMarkersConfig;
  private overlay: HTMLDivElement;
  private markers = new Map<THREE.Object3D, HTMLDivElement>();
  private projected = new THREE.Vector3();

  constructor(config: OffscreenHandleMarkersConfig) {
    this.config = config;
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:fixed;pointer-events:none;overflow:hidden;z-index:10;';
    document.body.appendChild(this.overlay);
  }

  /**
   * Every visible handle, corners first.
   *
   * Order is what decides which markers survive the collapse below, and a corner
   * is the more useful thing to keep: it is what the grid points around it are
   * following, so pulling it back brings them with it.
   */
  private trackedHandles(surface: WarpSurface): THREE.Mesh[] {
    const warper = surface.getWarper();
    return [...warper.getCornerObjects(), ...warper.getGridControlObjects()].filter(
      (handle) => handle.visible,
    );
  }

  /** Called once per frame, after the surfaces have their final positions */
  update(): void {
    const surface = this.config.isEnabled() ? this.config.getSurface() : null;
    if (!surface) {
      this.hideAll();
      return;
    }

    const rect = this.config.canvas.getBoundingClientRect();
    this.overlay.style.left = `${rect.left}px`;
    this.overlay.style.top = `${rect.top}px`;
    this.overlay.style.width = `${rect.width}px`;
    this.overlay.style.height = `${rect.height}px`;

    const selected = surface.getWarper().getSelectedHandle();
    const unused = new Set(this.markers.keys());
    const placed: { x: number; y: number }[] = [];

    for (const handle of this.trackedHandles(surface)) {
      unused.delete(handle);

      this.projected.copy(handle.position).project(this.config.camera);
      const x = (this.projected.x * 0.5 + 0.5) * rect.width;
      const y = (1 - (this.projected.y * 0.5 + 0.5)) * rect.height;

      const slack = OFFSCREEN_MARKER.edgeTolerancePixels;
      if (x >= -slack && x <= rect.width + slack && y >= -slack && y <= rect.height + slack) {
        this.markerFor(handle, surface).style.display = 'none';
        continue;
      }

      const inset = OFFSCREEN_MARKER.edgeInsetPixels;
      const at = {
        x: Math.min(Math.max(x, inset), rect.width - inset),
        y: Math.min(Math.max(y, inset), rect.height - inset),
      };

      // The selected handle is the one being moved, so it is always worth a
      // marker even where a corner has already claimed that patch of edge
      const isSelected = handle === selected;
      if (!isSelected && this.tooClose(at, placed)) {
        this.markerFor(handle, surface).style.display = 'none';
        continue;
      }

      placed.push(at);
      const angle = Math.atan2(y - rect.height / 2, x - rect.width / 2);
      this.place(this.markerFor(handle, surface), at, angle, isSelected);
    }

    for (const handle of unused) {
      const marker = this.markers.get(handle)!;
      // A disposed surface takes its handles out of the scene, and their markers
      // would otherwise sit in the DOM for the rest of the session
      if (!handle.parent) {
        marker.remove();
        this.markers.delete(handle);
        continue;
      }
      marker.style.display = 'none';
    }
  }

  private tooClose(at: { x: number; y: number }, placed: { x: number; y: number }[]): boolean {
    return placed.some(
      (other) => Math.hypot(other.x - at.x, other.y - at.y) < OFFSCREEN_MARKER.minSeparationPixels,
    );
  }

  /**
   * Pin the marker to the window edge and turn its arrow towards the handle.
   *
   * Clamping each axis independently puts a marker that is off in both at the
   * window's own corner, which is where you would look for it. The arrow, aimed
   * along the line from the centre, is what says how far round it actually is.
   */
  private place(
    marker: HTMLDivElement,
    at: { x: number; y: number },
    angle: number,
    isSelected: boolean,
  ): void {
    const color = isSelected ? WARP_HANDLE_STYLE.selectedColor : WARP_HANDLE_STYLE.gridColor;

    marker.style.display = 'flex'; // centres the label; the hidden state is the odd one out
    marker.style.left = `${at.x}px`;
    marker.style.top = `${at.y}px`;
    marker.style.color = color;

    // Just outside the chip's own edge in whichever direction the handle lies,
    // measured rather than assumed because the chip is as wide as its label
    const gap = OFFSCREEN_MARKER.arrowGapPixels;
    const offsetX = Math.cos(angle) * (marker.offsetWidth / 2 + gap);
    const offsetY = Math.sin(angle) * (marker.offsetHeight / 2 + gap);

    const arrow = marker.firstElementChild as HTMLDivElement;
    arrow.style.borderLeftColor = color;
    arrow.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) rotate(${angle}rad)`;
  }

  private markerFor(handle: THREE.Mesh, surface: WarpSurface): HTMLDivElement {
    const existing = this.markers.get(handle);
    if (existing) return existing;

    const marker = document.createElement('div');
    marker.style.cssText = [
      'position:absolute',
      `height:${OFFSCREEN_MARKER.heightPixels}px`,
      `padding:0 ${OFFSCREEN_MARKER.horizontalPaddingPixels}px`,
      `border-radius:${OFFSCREEN_MARKER.borderRadiusPixels}px`,
      `background:${PANE_THEME.background}`,
      `box-shadow:${PANE_THEME.shadow}`,
      `font-family:${PANE_THEME.fontFamily}`,
      `font-size:${OFFSCREEN_MARKER.fontSize}`,
      `font-weight:${OFFSCREEN_MARKER.fontWeight}`,
      'line-height:1',
      'white-space:nowrap',
      'transform:translate(-50%, -50%)',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'pointer-events:auto',
      'cursor:pointer',
    ].join(';');
    marker.title = 'Off screen — click to select, then move with the arrow keys';

    const arrow = document.createElement('div');
    arrow.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      'width:0',
      'height:0',
      'border-top:4px solid transparent',
      'border-bottom:4px solid transparent',
      'border-left:7px solid',
    ].join(';');
    marker.appendChild(arrow);

    const label = document.createElement('span');
    label.textContent = String(handle.userData.label ?? '');
    marker.appendChild(label);

    // The whole point of the marker: reach a handle you cannot click
    marker.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      surface.getWarper().setSelectedHandle(handle);
    });

    this.overlay.appendChild(marker);
    this.markers.set(handle, marker);
    return marker;
  }

  private hideAll(): void {
    for (const marker of this.markers.values()) marker.style.display = 'none';
  }

  dispose(): void {
    this.markers.clear();
    this.overlay.remove();
  }
}

export default OffscreenHandleMarkers;
