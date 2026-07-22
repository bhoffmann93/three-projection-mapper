/*
OutputFrame
-----------
The boundary of what the projector actually shows, drawn on the controller only.

The controller usually previews at zoom < 1 so surfaces can be arranged with room
around them, which means the view deliberately extends past the output. Without a
boundary there is no way to tell which surfaces are being projected — this is the
same job MadMapper's canvas border does.
*/

import * as THREE from 'three';
//@ts-ignore
import { Line2 } from 'three/addons/lines/Line2.js';
//@ts-ignore
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
//@ts-ignore
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { RenderOrder } from './RenderOrder';
import { OUTPUT_FRAME_STYLE } from './defaults';

export class OutputFrame {
  private line: Line2;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, width: number, height: number) {
    this.scene = scene;

    const material = new LineMaterial({
      color: OUTPUT_FRAME_STYLE.color,
      linewidth: OUTPUT_FRAME_STYLE.lineWidth,
      transparent: true,
      opacity: OUTPUT_FRAME_STYLE.opacity,
      dashed: true,
      dashSize: OUTPUT_FRAME_STYLE.dashSize,
      gapSize: OUTPUT_FRAME_STYLE.gapSize,
    });

    this.line = new Line2(new LineGeometry(), material);
    this.line.renderOrder = RenderOrder.CONTROLS;
    this.scene.add(this.line);
    this.setSize(width, height);
  }

  setSize(width: number, height: number): void {
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    this.line.geometry.setPositions([
      -halfWidth, halfHeight, 0,
      halfWidth, halfHeight, 0,
      halfWidth, -halfHeight, 0,
      -halfWidth, -halfHeight, 0,
      -halfWidth, halfHeight, 0,
    ]);
    this.line.computeLineDistances();
  }

  setVisible(visible: boolean): void {
    this.line.visible = visible;
  }

  dispose(): void {
    this.scene.remove(this.line);
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
  }
}
