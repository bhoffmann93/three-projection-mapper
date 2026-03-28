/*
MaskPlane
---------
A perspective-correct quad that renders masks (feather, polygon) as a black alpha
cutout in front of the content plane, without being affected by grid warp.

It uses perspective.vert, which applies the same PerspT homography as the drag
handles, so mask boundaries and handles are always spatially aligned.
Masks are evaluated in flat UV space (0–1) on a subdivided mesh so the
UV-to-screen mapping closely approximates the true projective transform.
*/

import * as THREE from 'three';
import maskFragmentShader from '../shaders/mask.frag';
import perspectiveVertexShader from '../shaders/perspective.vert';
import { RenderOrder } from '../core/RenderOrder';
import type { UVPoint } from './PolygonMask';

const MAX_POLYGON_POINTS = 16; // injected into mask.frag as a define, keeping TS and GLSL in sync

export interface MaskPlaneConfig {
  worldWidth: number;
  worldHeight: number;
  segments: number;
  scene: THREE.Scene;
  warpPlaneSizeRef: { value: THREE.Vector2 };
}

export class MaskPlane {
  readonly mesh: THREE.Mesh;

  private geometry: THREE.PlaneGeometry;
  private material: THREE.ShaderMaterial;
  private scene: THREE.Scene;

  private uniforms: {
    uHomography: { value: THREE.Matrix3 };
    uFlatPlaneSize: { value: THREE.Vector2 };
    uWarpPlaneSize: { value: THREE.Vector2 };
    uMaskEnabled: { value: boolean };
    uFeather: { value: number };
    uPolygonMaskEnabled: { value: boolean };
    uPolygonPointCount: { value: number };
    uPolygonPoints: { value: THREE.Vector2[] };
    uPolygonFeather: { value: number };
  };

  constructor(config: MaskPlaneConfig) {
    this.scene = config.scene;

    this.geometry = new THREE.PlaneGeometry(
      config.worldWidth,
      config.worldHeight,
      config.segments,
      config.segments,
    );

    this.uniforms = {
      uHomography: { value: new THREE.Matrix3() },
      uFlatPlaneSize: { value: new THREE.Vector2(config.worldWidth, config.worldHeight) },
      uWarpPlaneSize: config.warpPlaneSizeRef,
      uMaskEnabled: { value: false },
      uFeather: { value: 0 },
      uPolygonMaskEnabled: { value: false },
      uPolygonPointCount: { value: 0 },
      uPolygonPoints: { value: Array.from({ length: MAX_POLYGON_POINTS }, () => new THREE.Vector2()) },
      uPolygonFeather: { value: 0.005 },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: perspectiveVertexShader,
      fragmentShader: maskFragmentShader,
      defines: { MAX_POLYGON_POINTS },
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = RenderOrder.MASK;
    this.scene.add(this.mesh);
  }

  // coeffs is the 9-element PerspT homography array:
  // | c[0] c[1] c[2] |
  // | c[3] c[4] c[5] |
  // | c[6] c[7]  1   |
  syncPerspective(coeffs: number[]): void {
    this.uniforms.uHomography.value.set(
      coeffs[0], coeffs[1], coeffs[2],
      coeffs[3], coeffs[4], coeffs[5],
      coeffs[6], coeffs[7], 1,
    );
  }

  setFeatherMask(enabled: boolean, amount: number): void {
    this.uniforms.uMaskEnabled.value = enabled;
    this.uniforms.uFeather.value = amount;
  }

  setPolygonNodes(nodes: UVPoint[]): void {
    this.uniforms.uPolygonPointCount.value = nodes.length;
    for (let i = 0; i < nodes.length; i++) {
      this.uniforms.uPolygonPoints.value[i].set(nodes[i].u, nodes[i].v);
    }
  }

  setPolygonMaskEnabled(enabled: boolean): void {
    this.uniforms.uPolygonMaskEnabled.value = enabled;
  }

  setPolygonFeather(feather: number): void {
    this.uniforms.uPolygonFeather.value = feather;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
