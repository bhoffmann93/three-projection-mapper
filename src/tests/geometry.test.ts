import { describe, it, expect } from 'vitest';
import { isQuadConcave } from '../warp/geometry';

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
