import * as THREE from 'three';
import p5 from 'p5';
import { ProjectionMapper } from '../../src/core/ProjectionMapper';
import { ProjectionMapperGUI, GUI_ANCHOR } from '../../src/core/ProjectionMapperGUI';

const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const CANVAS_W = 1280;
const CANVAS_H = 720;

const TILES_X = 9;
const TILES_Y = 9;

let canvasTexture: THREE.CanvasTexture | null = null;
let mapper: ProjectionMapper | null = null;
let gui: ProjectionMapperGUI | null = null;

interface TileModule {
  w: number;
  h: number;
}

const sketch = (s: p5) => {
  // (TILES_Y - 1) rows × (TILES_X - 1) cols
  const modules: TileModule[][] = Array.from({ length: TILES_Y - 1 }, () =>
    Array.from({ length: TILES_X - 1 }, () => ({ w: 0, h: 0 })),
  );
  const scaleFactors: { x: number; y: number }[] = [];
  const scaleFactor = { x: 1, y: 1 };

  function calcGrid() {
    const tileWo = s.width / TILES_X;
    const tileHo = s.height / TILES_Y;
    let sumHeight = 0;

    for (let iY = 1; iY < TILES_Y; iY++) {
      let sumWidth = 0;

      const freqY = 0.3;
      const ampWaveY = 0.7;
      const waveY = ampWaveY * Math.sin(iY * freqY + s.frameCount * 0.01) * 0.5 + 0.5;

      for (let iX = 1; iX < TILES_X; iX++) {
        const tileW = tileWo; // waveX = 1, no horizontal modulation
        const tileH = tileHo * waveY;

        modules[iY - 1][iX - 1] = { w: tileW, h: tileH };
        sumWidth += tileW;
        if (iX === 1) sumHeight += tileH;
      }

      scaleFactors[iY - 1] = { x: s.width / sumWidth, y: 1 };
    }

    scaleFactor.y = s.height / sumHeight;
  }

  function drawGrid() {
    s.background('#000000');
    s.fill('#FF0000');
    s.noStroke();

    let tempPosY = 0;
    for (let iY = 1; iY < TILES_Y; iY++) {
      let tempPosX = 0;
      let tempHeight = 0;

      for (let iX = 1; iX < TILES_X; iX++) {
        const { w, h } = modules[iY - 1][iX - 1];
        const sf = scaleFactors[iY - 1];
        const tileW = w * sf.x;
        const tileH = h * scaleFactor.y;

        s.push();
        s.translate(tempPosX, tempPosY);
        s.beginShape();
        s.vertex(0, 0);
        s.vertex(tileW, 0);
        s.vertex(tileW, tileH);
        s.endShape();
        s.pop();

        tempPosX += tileW;
        tempHeight = tileH;
      }

      tempPosY += tempHeight;
    }
  }

  s.setup = () => {
    s.pixelDensity(1); // disable retina scaling so canvas is exactly CANVAS_W × CANVAS_H
    const cnv = s.createCanvas(CANVAS_W, CANVAS_H);
    (cnv.elt as HTMLCanvasElement).style.display = 'none';

    canvasTexture = new THREE.CanvasTexture(cnv.elt as HTMLCanvasElement);
    mapper = new ProjectionMapper(renderer, canvasTexture);
    gui = new ProjectionMapperGUI(mapper, {
      title: 'Projection Mapper',
      anchor: GUI_ANCHOR.LEFT,
    });
  };

  s.draw = () => {
    calcGrid();
    drawGrid();
    if (canvasTexture) canvasTexture.needsUpdate = true;
  };
};

new p5(sketch);

window.addEventListener('keydown', (e) => {
  if ((e.key === 'g' || e.key === 'p') && gui) gui.toggle();
  if (e.key === 't' && gui) gui.toggleTestCard();
  if (e.key === 'h' && gui) gui.toggleWarpUI();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (mapper) mapper.resize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  if (!mapper) return;
  renderer.setRenderTarget(null);
  mapper.render();
}

animate();
