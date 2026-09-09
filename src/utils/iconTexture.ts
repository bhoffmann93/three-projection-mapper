/*
iconTexture
-----------
A lucide icon on the pane's rounded background, as a texture, so a control in the
scene reads as the same UI as the off-screen markers.
*/

import * as THREE from 'three';
import { createElement, type IconNode } from 'lucide';
import { OFFSCREEN_MARKER, PANE_THEME } from '../core/defaults';

/** The pane's icon size, against the markers' 20px height */
const ICON_SIZE_PIXELS = 12;

export interface IconBadgeTextureOptions {
  /** Icon colour. The background is the pane's, as it is for the markers. */
  color: string;
  strokeWidth: number;
  /** Texture edge in pixels, independent of the size the handle is drawn at */
  sizePixels: number;
}

/** Badge share of the texture; the rest is margin the shadow needs */
export const BADGE_FILL = 0.6;

const BADGE = {
  radius: OFFSCREEN_MARKER.borderRadiusPixels / OFFSCREEN_MARKER.heightPixels,
  icon: ICON_SIZE_PIXELS / OFFSCREEN_MARKER.heightPixels,
  shadowBlur: 4 / OFFSCREEN_MARKER.heightPixels,
  shadowOffset: 2 / OFFSCREEN_MARKER.heightPixels,
  shadowColor: 'rgba(0, 0, 0, 0.2)',
};

export function createIconBadgeTexture(icon: IconNode, options: IconBadgeTextureOptions): THREE.CanvasTexture {
  const size = options.sizePixels;
  const badge = size * BADGE_FILL;
  const margin = (size - badge) / 2;
  const iconSize = Math.round(badge * BADGE.icon);

  const svg = createElement(icon, {
    xmlns: 'http://www.w3.org/2000/svg',
    width: String(iconSize),
    height: String(iconSize),
    stroke: options.color,
    'stroke-width': String(options.strokeWidth),
  });

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const texture = new THREE.CanvasTexture(canvas);
  // Decoding these bytes darkens the pane grey to near black
  texture.colorSpace = THREE.NoColorSpace;

  const context = canvas.getContext('2d');
  if (!context) return texture;

  context.save();
  context.shadowColor = BADGE.shadowColor;
  context.shadowBlur = badge * BADGE.shadowBlur;
  context.shadowOffsetY = badge * BADGE.shadowOffset;
  context.fillStyle = PANE_THEME.background;
  context.beginPath();
  context.roundRect(margin, margin, badge, badge, badge * BADGE.radius);
  context.fill();
  context.restore();

  const image = new Image();
  image.onload = () => {
    const at = (size - iconSize) / 2;
    context.drawImage(image, at, at, iconSize, iconSize);
    texture.needsUpdate = true;
  };
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;

  return texture;
}
