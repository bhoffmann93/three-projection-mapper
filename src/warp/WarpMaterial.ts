/*
WarpMaterial
------------
The shader material one surface draws with, and every uniform behind it.

Uniforms fall into two groups. Global ones — the shared buffer, time, the test
card — arrive by reference from ProjectionMapper and are shared across surfaces.
The rest belong to this surface alone: its control points, its crop, its image
adjustments, its resolution. That per-surface ownership is what lets two surfaces
sample one buffer with different grades and different shapes.

Control points are passed by reference, so moving a point is visible to the
shader without any upload here.
*/

import * as THREE from 'three';
import meshWarpVertexShader from '../shaders/warp.vert';
import { DEFAULT_UV_RECT, DEFAULT_IMAGE_SETTINGS } from '../core/defaults';
import type { UvRect, ImageSettings, Resolution } from '../core/defaults';

export enum WARP_MODE {
  bilinear = 0,
  bicubic = 1,
}

export interface WarpMaterialConfig {
  planeSize: { width: number; height: number };
  resolution: Resolution;
  gridControlPoints: { x: number; y: number };
  cornerPoints: THREE.Vector3[];
  gridPoints: THREE.Vector3[];
  fragmentShader: string;
  globalUniforms: Record<string, { value: unknown }>;
  globalDefines: Record<string, unknown>;
  bufferTexture: THREE.Texture;
  imageSettings?: ImageSettings;
}

export class WarpMaterial {
  readonly material: THREE.ShaderMaterial;

  constructor(config: WarpMaterialConfig) {
    const settings = { ...DEFAULT_IMAGE_SETTINGS, ...config.imageSettings };

    const surfaceUniforms = {
      uCorners: { value: config.cornerPoints },
      uControlPoint: { value: null },
      uControlPoints: { value: config.gridPoints },
      uGridSizeX: { value: config.gridControlPoints.x },
      uGridSizeY: { value: config.gridControlPoints.y },
      uBuffer: { value: config.bufferTexture },
      uWarpMode: { value: WARP_MODE.bicubic },
      uShouldWarp: { value: true },
      uWarpPlaneSize: { value: new THREE.Vector2(config.planeSize.width, config.planeSize.height) },
      uSurfaceResolution: { value: new THREE.Vector2(config.resolution.width, config.resolution.height) },
      uUvRectOffset: { value: new THREE.Vector2(DEFAULT_UV_RECT.offsetX, DEFAULT_UV_RECT.offsetY) },
      uUvRectScale: { value: new THREE.Vector2(DEFAULT_UV_RECT.scaleX, DEFAULT_UV_RECT.scaleY) },
      uTonemap: { value: settings.tonemap },
      uShadows: { value: settings.shadows },
      uHighlights: { value: settings.highlights },
      uGamma: { value: settings.gamma },
      uContrast: { value: settings.contrast },
      uSaturation: { value: settings.saturation },
      uHue: { value: settings.hue },
    };

    this.material = new THREE.ShaderMaterial({
      fragmentShader: config.fragmentShader,
      vertexShader: meshWarpVertexShader,
      defines: {
        CONTROL_POINT_AMOUNT: config.gridControlPoints.x * config.gridControlPoints.y,
        ...config.globalDefines,
      },
      // Surface uniforms last: uBuffer deliberately shadows the shared one, so a
      // surface can be given its own media without leaving the shared buffer
      uniforms: { ...config.globalUniforms, ...surfaceUniforms },
    });
    this.material.side = THREE.FrontSide;
  }

  /** Rebind after a grid resize, which replaces the control point array */
  setGrid(gridPoints: THREE.Vector3[], sizeX: number, sizeY: number): void {
    this.material.defines.CONTROL_POINT_AMOUNT = sizeX * sizeY;
    this.material.uniforms.uControlPoints.value = gridPoints;
    this.material.uniforms.uGridSizeX.value = sizeX;
    this.material.uniforms.uGridSizeY.value = sizeY;
    this.material.needsUpdate = true;
  }

  /** The warped quad's measured size, which masks and the test card follow */
  setWarpPlaneSize(width: number, height: number): void {
    this.material.uniforms.uWarpPlaneSize.value.set(width, height);
  }

  /** Shared with MaskPlane so the mask follows the warped quad's dimensions */
  getWarpPlaneSizeUniform(): { value: THREE.Vector2 } {
    return this.material.uniforms.uWarpPlaneSize as { value: THREE.Vector2 };
  }

  setBufferTexture(texture: THREE.Texture): void {
    this.material.uniforms.uBuffer.value = texture;
  }

  getBufferTexture(): THREE.Texture {
    return this.material.uniforms.uBuffer.value as THREE.Texture;
  }

  setWarpMode(mode: WARP_MODE): void {
    this.material.uniforms.uWarpMode.value = mode;
    this.material.needsUpdate = true;
  }

  getWarpMode(): WARP_MODE {
    return this.material.uniforms.uWarpMode.value as WARP_MODE;
  }

  setShouldWarp(enabled: boolean): void {
    this.material.uniforms.uShouldWarp.value = enabled;
  }

  getShouldWarp(): boolean {
    return this.material.uniforms.uShouldWarp.value as boolean;
  }

  setUvRect(offsetX: number, offsetY: number, scaleX: number, scaleY: number): void {
    this.material.uniforms.uUvRectOffset.value.set(offsetX, offsetY);
    this.material.uniforms.uUvRectScale.value.set(scaleX, scaleY);
  }

  getUvRect(): UvRect {
    const offset = this.material.uniforms.uUvRectOffset.value as THREE.Vector2;
    const scale = this.material.uniforms.uUvRectScale.value as THREE.Vector2;
    return { offsetX: offset.x, offsetY: offset.y, scaleX: scale.x, scaleY: scale.y };
  }

  getResolution(): Resolution {
    const value = this.material.uniforms.uSurfaceResolution.value as THREE.Vector2;
    return { width: value.x, height: value.y };
  }

  setImageSettings(settings: Partial<ImageSettings>): void {
    const uniforms = this.material.uniforms;
    if (settings.tonemap !== undefined) uniforms.uTonemap.value = settings.tonemap;
    if (settings.shadows !== undefined) uniforms.uShadows.value = settings.shadows;
    if (settings.highlights !== undefined) uniforms.uHighlights.value = settings.highlights;
    if (settings.gamma !== undefined) uniforms.uGamma.value = settings.gamma;
    if (settings.contrast !== undefined) uniforms.uContrast.value = settings.contrast;
    if (settings.saturation !== undefined) uniforms.uSaturation.value = settings.saturation;
    if (settings.hue !== undefined) uniforms.uHue.value = settings.hue;
  }

  getImageSettings(): ImageSettings {
    const uniforms = this.material.uniforms;
    return {
      tonemap: uniforms.uTonemap.value as boolean,
      shadows: uniforms.uShadows.value as number,
      highlights: uniforms.uHighlights.value as number,
      gamma: uniforms.uGamma.value as number,
      contrast: uniforms.uContrast.value as number,
      saturation: uniforms.uSaturation.value as number,
      hue: uniforms.uHue.value as number,
    };
  }

  dispose(): void {
    this.material.dispose();
  }
}
