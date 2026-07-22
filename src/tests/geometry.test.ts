import { describe, it, expect } from 'vitest';
import { isQuadConcave, isPointInQuad, quadCenter, scaleQuadAboutCenter } from '../warp/geometry';

describe('Geometry Checks', () => {
  it('should return false for a valid square', () => {
    const square = [0, 0, 10, 0, 0, 10, 10, 10];
    expect(isQuadConcave(square)).toBe(false);
  });

  it('should return true (concave) when a point is dragged inside', () => {
    // Top Right point dragged inside the triangle formed by others
    const concave = [0, 0, 2, 2, 0, 8, 10, 10];
    expect(isQuadConcave(concave)).toBe(true);
  });
});

describe('isPointInQuad (surface picking)', () => {
  // Perimeter order TL, TR, BR, BL — as MeshWarper.containsPoint passes it
  const quad = (cx: number, cy: number) => [
    { x: cx - 5, y: cy + 5 },
    { x: cx + 5, y: cy + 5 },
    { x: cx + 5, y: cy - 5 },
    { x: cx - 5, y: cy - 5 },
  ];

  it('accepts a point inside and rejects one outside', () => {
    expect(isPointInQuad(quad(0, 0), 1, 1)).toBe(true);
    expect(isPointInQuad(quad(0, 0), 7, 0)).toBe(false);
  });

  it('follows a translated surface instead of staying at the origin', () => {
    // The regression: a surface moved to x=+6 must be hit at +6, not at 0
    const moved = quad(6, 0);
    expect(isPointInQuad(moved, 6, 0)).toBe(true);
    expect(isPointInQuad(moved, 0, 0)).toBe(false);
  });

  it('treats a point on an edge as inside', () => {
    expect(isPointInQuad(quad(0, 0), 5, 0)).toBe(true);
  });

  it('handles a perspective-warped (non-axis-aligned) quad', () => {
    const warped = [
      { x: -4, y: 5 },
      { x: 6, y: 3 },
      { x: 5, y: -5 },
      { x: -5, y: -4 },
    ];
    expect(isPointInQuad(warped, 0, 0)).toBe(true);
    expect(isPointInQuad(warped, 6, 5)).toBe(false);
  });
});

describe('scaleQuadAboutCenter', () => {
  // A keystoned quad — the case that matters, since a calibrated surface is never
  // a rectangle and scaling must not quietly straighten it
  const warped = [
    { x: -4, y: 5 },
    { x: 6, y: 3 },
    { x: 5, y: -5 },
    { x: -5, y: -4 },
  ];

  it('leaves the centroid where it was', () => {
    const before = quadCenter(warped);
    const after = quadCenter(scaleQuadAboutCenter(warped, 2, 2));
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('scales every edge by the factor, so the warp is preserved', () => {
    const scaled = scaleQuadAboutCenter(warped, 2, 2);
    for (let i = 0; i < warped.length; i++) {
      const j = (i + 1) % warped.length;
      const before = Math.hypot(warped[j].x - warped[i].x, warped[j].y - warped[i].y);
      const after = Math.hypot(scaled[j].x - scaled[i].x, scaled[j].y - scaled[i].y);
      expect(after).toBeCloseTo(before * 2);
    }
  });

  it('scales each axis independently', () => {
    const scaled = scaleQuadAboutCenter(warped, 2, 1);
    const center = quadCenter(warped);
    expect(scaled[0].x - center.x).toBeCloseTo((warped[0].x - center.x) * 2);
    expect(scaled[0].y - center.y).toBeCloseTo(warped[0].y - center.y);
  });

  it('round-trips, so scaling back restores the original quad', () => {
    const restored = scaleQuadAboutCenter(scaleQuadAboutCenter(warped, 3, 3), 1 / 3, 1 / 3);
    restored.forEach((point, i) => {
      expect(point.x).toBeCloseTo(warped[i].x);
      expect(point.y).toBeCloseTo(warped[i].y);
    });
  });
});
