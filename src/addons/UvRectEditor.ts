/*
UvRectEditor
------------
Reference "input view": a small DOM overlay showing the shared input texture
with one draggable crop rect per surface — MadMapper's left pane, minimal.

This is deliberately an addon, not part of the library core: host apps will
want their own input panel. It only talks to ProjectionMapper's public API
(getSurfaces / getUvRect / setUvRect / setActiveSurface), so persistence and
multi-window sync come for free through the mapper.

The texture preview is a throttled readback (render to a small target, read
pixels, blit into a 2D canvas) — a preview, not a live monitor.
*/

import * as THREE from 'three';
import { ProjectionMapper } from '../core/ProjectionMapper';
import type { UvRect } from '../core/defaults';
import type { WarpSurface } from '../warp/WarpSurface';

export interface UvRectEditorConfig {
  /** Where to mount the overlay (default: document.body) */
  container?: HTMLElement;
  /** Preview width in CSS pixels; height follows the input aspect (default: 260) */
  width?: number;
  /** Preview refreshes per second (default: 5) */
  previewFps?: number;
  /** Corner grab area in CSS pixels (default: 10) */
  handleSize?: number;
  /** Panel heading (default: 'Input Atlas Buffer') */
  title?: string;
  /** Called after a rect changes, for broadcasting UV_RECT_CHANGED */
  onUvRectChanged?: (surfaceId: string, uvRect: UvRect) => void;
}

type DragMode = 'move' | 'resize';

const STYLE = {
  inactiveStroke: 'rgba(255, 255, 255, 0.45)',
  activeStroke: 'rgb(255, 165, 0)',
  activeFill: 'rgba(255, 165, 0, 0.12)',
  border: 'rgba(255, 255, 255, 0.15)',
  captionBackground: 'rgba(0, 0, 0, 0.55)',
  captionHeight: 18,
  labelFont: '11px monospace',
  panelBackground: 'rgba(20, 20, 24, 0.82)',
  panelBorder: 'rgba(255, 255, 255, 0.12)',
  panelText: 'rgba(255, 255, 255, 0.7)',
} as const;

export class UvRectEditor {
  private mapper: ProjectionMapper;
  private config: Required<Omit<UvRectEditorConfig, 'onUvRectChanged' | 'container'>> & {
    onUvRectChanged?: (surfaceId: string, uvRect: UvRect) => void;
  };

  private root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  /** Offscreen pipeline for reading the input texture back into 2D canvas pixels */
  private readTarget: THREE.WebGLRenderTarget;
  private readScene: THREE.Scene;
  private readCamera: THREE.OrthographicCamera;
  private readMaterial: THREE.ShaderMaterial;
  private pixelBuffer: Uint8Array;
  private imageData: ImageData;
  private lastPreviewTime = 0;

  private drag: { surfaceId: string; mode: DragMode; startX: number; startY: number; start: UvRect } | null = null;

  private onPointerDown: (e: PointerEvent) => void;
  private onPointerMove: (e: PointerEvent) => void;
  private onPointerUp: (e: PointerEvent) => void;

  constructor(mapper: ProjectionMapper, config: UvRectEditorConfig = {}) {
    this.mapper = mapper;
    this.config = {
      width: config.width ?? 260,
      previewFps: config.previewFps ?? 5,
      handleSize: config.handleSize ?? 10,
      title: config.title ?? 'Input Atlas Buffer',
      onUvRectChanged: config.onUvRectChanged,
    };

    // The buffer's aspect, not the output canvas's — this panel shows the buffer,
    // and in an atlas the two differ (a 2:1 atlas feeding a 16:9 output)
    const buffer = mapper.getBufferResolution();
    const aspect = buffer.height > 0 ? buffer.width / buffer.height : 1;
    const width = this.config.width;
    const height = Math.round(width / aspect);

    this.root = document.createElement('div');
    this.root.style.cssText = [
      'position:fixed',
      'right:8px',
      'bottom:8px',
      'padding:6px',
      `background:${STYLE.panelBackground}`,
      `border:1px solid ${STYLE.panelBorder}`,
      'border-radius:4px',
      'font:11px monospace',
      `color:${STYLE.panelText}`,
      'z-index:100',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = this.config.title;
    title.style.cssText = 'margin-bottom:4px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.6';
    this.root.appendChild(title);

    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.cssText = `display:block;width:${width}px;height:${height}px;touch-action:none;cursor:default`;
    this.root.appendChild(this.canvas);

    (config.container ?? document.body).appendChild(this.root);

    this.ctx = this.canvas.getContext('2d')!;

    // Readback pipeline: draw the input texture into a target the size of the preview
    this.readTarget = new THREE.WebGLRenderTarget(width, height);
    this.readCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.readScene = new THREE.Scene();
    this.readMaterial = new THREE.ShaderMaterial({
      uniforms: { uTexture: { value: mapper.getTexture() } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTexture;
        varying vec2 vUv;
        void main() {
          gl_FragColor = vec4(texture2D(uTexture, vUv).rgb, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.readScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.readMaterial));

    this.pixelBuffer = new Uint8Array(width * height * 4);
    this.imageData = new ImageData(width, height);

    this.onPointerDown = (e) => this.handlePointerDown(e);
    this.onPointerMove = (e) => this.handlePointerMove(e);
    this.onPointerUp = (e) => this.handlePointerUp(e);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  /**
   * Call once per animation frame, after mapper.render(). The texture readback
   * is throttled to previewFps; the rect overlay redraws every call so dragging
   * stays responsive.
   */
  update(renderer: THREE.WebGLRenderer): void {
    const now = performance.now();
    if (now - this.lastPreviewTime >= 1000 / this.config.previewFps) {
      this.lastPreviewTime = now;
      this.capturePreview(renderer);
    }
    this.draw();
  }

  private capturePreview(renderer: THREE.WebGLRenderer): void {
    const { width, height } = this.canvas;
    const previousTarget = renderer.getRenderTarget();

    this.readMaterial.uniforms.uTexture.value = this.mapper.getTexture();
    renderer.setRenderTarget(this.readTarget);
    renderer.render(this.readScene, this.readCamera);
    renderer.readRenderTargetPixels(this.readTarget, 0, 0, width, height, this.pixelBuffer);
    renderer.setRenderTarget(previousTarget);

    // GL rows come back bottom-up; ImageData is top-down
    const dst = this.imageData.data;
    const rowBytes = width * 4;
    for (let y = 0; y < height; y++) {
      const src = (height - 1 - y) * rowBytes;
      dst.set(this.pixelBuffer.subarray(src, src + rowBytes), y * rowBytes);
    }
  }

  /**
   * Surfaces that actually sample this buffer.
   *
   * A surface given its own media samples nothing here, so its uv rect describes
   * a crop of a different texture — drawing it over the atlas would claim it
   * covers the whole buffer, which is exactly backwards.
   */
  private atlasSurfaces(): WarpSurface[] {
    const buffer = this.mapper.getTexture();
    return this.mapper.getSurfaces().filter((surface) => surface.getTexture() === buffer);
  }

  /** UV rect → canvas pixels. UV v=0 is the bottom of the texture, canvas y=0 the top. */
  private toPixels(rect: UvRect): { x: number; y: number; w: number; h: number } {
    const { width, height } = this.canvas;
    return {
      x: rect.offsetX * width,
      y: (1 - rect.offsetY - rect.scaleY) * height,
      w: rect.scaleX * width,
      h: rect.scaleY * height,
    };
  }

  private draw(): void {
    const { width, height } = this.canvas;
    this.ctx.putImageData(this.imageData, 0, 0);

    const activeId = this.mapper.getActiveSurface().id;
    const surfaces = this.atlasSurfaces();

    for (const surface of surfaces) {
      const isActive = surface.id === activeId;
      const { x, y, w, h } = this.toPixels(surface.getUvRect());

      this.ctx.lineWidth = isActive ? 2 : 1;
      this.ctx.strokeStyle = isActive ? STYLE.activeStroke : STYLE.inactiveStroke;
      if (isActive) {
        this.ctx.fillStyle = STYLE.activeFill;
        this.ctx.fillRect(x, y, w, h);
      }
      this.ctx.strokeRect(x, y, w, h);

      this.ctx.fillStyle = isActive ? STYLE.activeStroke : STYLE.inactiveStroke;
      this.ctx.font = STYLE.labelFont;
      this.ctx.fillText(surface.id, x + 4, y + 13);

      // Bottom-right resize grip on the active rect only
      if (isActive) {
        const grip = this.config.handleSize;
        this.ctx.fillRect(x + w - grip, y + h - grip, grip, grip);
      }
    }

    // Say so rather than looking unresponsive when the selection is not in here
    if (!surfaces.some((surface) => surface.id === activeId)) {
      this.ctx.fillStyle = STYLE.captionBackground;
      this.ctx.fillRect(0, height - STYLE.captionHeight, width, STYLE.captionHeight);
      this.ctx.fillStyle = STYLE.inactiveStroke;
      this.ctx.font = STYLE.labelFont;
      this.ctx.fillText(`Surface ${activeId} has its own media`, 5, height - 5);
    }

    this.ctx.strokeStyle = STYLE.border;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  }

  private toCanvasPoint(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * this.canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * this.canvas.height,
    };
  }

  /** Topmost rect under the point — later surfaces win, matching the canvas picker */
  private pickSurfaceId(x: number, y: number): string | null {
    const surfaces = this.atlasSurfaces();
    for (let i = surfaces.length - 1; i >= 0; i--) {
      const r = this.toPixels(surfaces[i].getUvRect());
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return surfaces[i].id;
    }
    return null;
  }

  private isOnGrip(surfaceId: string, x: number, y: number): boolean {
    const surface = this.mapper.getSurface(surfaceId);
    if (!surface || surface.getTexture() !== this.mapper.getTexture()) return false;
    const r = this.toPixels(surface.getUvRect());
    const grip = this.config.handleSize;
    return x >= r.x + r.w - grip && x <= r.x + r.w && y >= r.y + r.h - grip && y <= r.y + r.h;
  }

  private handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const { x, y } = this.toCanvasPoint(event);

    // The active rect's grip wins even where rects overlap
    const activeId = this.mapper.getActiveSurface().id;
    const onActiveGrip = this.isOnGrip(activeId, x, y);
    const surfaceId = onActiveGrip ? activeId : this.pickSurfaceId(x, y);
    if (!surfaceId) return;

    this.mapper.setActiveSurface(surfaceId);
    this.drag = {
      surfaceId,
      mode: onActiveGrip ? 'resize' : 'move',
      startX: x,
      startY: y,
      start: this.mapper.getUvRect(surfaceId),
    };
    this.canvas.setPointerCapture(event.pointerId);
  }

  private handlePointerMove(event: PointerEvent): void {
    const { x, y } = this.toCanvasPoint(event);

    if (!this.drag) {
      const activeId = this.mapper.getActiveSurface().id;
      this.canvas.style.cursor = this.isOnGrip(activeId, x, y)
        ? 'nwse-resize'
        : this.pickSurfaceId(x, y)
          ? 'move'
          : 'default';
      return;
    }

    const du = (x - this.drag.startX) / this.canvas.width;
    // Canvas y grows downward, v grows upward
    const dv = -(y - this.drag.startY) / this.canvas.height;
    const { start } = this.drag;
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

    let rect: UvRect;
    if (this.drag.mode === 'move') {
      rect = {
        offsetX: clamp01(Math.min(start.offsetX + du, 1 - start.scaleX)),
        offsetY: clamp01(Math.min(start.offsetY + dv, 1 - start.scaleY)),
        scaleX: start.scaleX,
        scaleY: start.scaleY,
      };
    } else {
      // The grip is the rect's bottom-right in canvas space = (offsetX+scaleX, offsetY)
      const scaleX = clamp01(Math.min(start.scaleX + du, 1 - start.offsetX));
      const offsetY = clamp01(Math.min(start.offsetY + dv, start.offsetY + start.scaleY));
      rect = {
        offsetX: start.offsetX,
        offsetY,
        scaleX: Math.max(0.01, scaleX),
        scaleY: Math.max(0.01, start.scaleY + (start.offsetY - offsetY)),
      };
    }

    this.mapper.setUvRect(rect.offsetX, rect.offsetY, rect.scaleX, rect.scaleY, this.drag.surfaceId);
    this.config.onUvRectChanged?.(this.drag.surfaceId, rect);
  }

  private handlePointerUp(event: PointerEvent): void {
    if (!this.drag) return;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.drag = null;
  }

  show(): void {
    this.root.style.display = '';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  toggle(): void {
    this.root.style.display = this.root.style.display === 'none' ? '' : 'none';
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.root.remove();
    this.readTarget.dispose();
    this.readMaterial.dispose();
  }
}

export default UvRectEditor;
