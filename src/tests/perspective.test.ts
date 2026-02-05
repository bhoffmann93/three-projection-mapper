import { describe, it, expect } from 'vitest';
import PerspT from '../perspective';

// Helper to check standard 100x100 square coordinates
// TL, TR, BL, BR order
const SQUARE_SRC = [
  0,
  100, // Top Left (0, 100) - Note: standard math usually Y-up, check your coord system
  100,
  100, // Top Right
  0,
  0, // Bottom Left
  100,
  0, // Bottom Right
];

describe('PerspT (Perspective Transform)', () => {
  // 1. SANITY CHECK
  it('should handle Identity Transform (No movement)', () => {
    // If source and dest are the same, point (50,50) should stay at (50,50)
    const transformer = new PerspT(SQUARE_SRC, SQUARE_SRC);

    const [x, y] = transformer.transform(50, 50);

    expect(x).toBeCloseTo(50);
    expect(y).toBeCloseTo(50);
  });

  // 2. TRANSLATION CHECK
  it('should handle simple Translation', () => {
    // Move the whole destination square by +10 on X axis
    const offset = 10;
    const dest = [0 + offset, 100, 100 + offset, 100, 0 + offset, 0, 100 + offset, 0];

    const transformer = new PerspT(SQUARE_SRC, dest);

    // The center point (50, 50) should now be at (60, 50)
    const [x, y] = transformer.transform(50, 50);

    expect(x).toBeCloseTo(60);
    expect(y).toBeCloseTo(50);
  });

  // 3. WARP CHECK (The real test)
  it('should warp a point when corners are distorted', () => {
    // We pinch the top corners inwards to create a trapezoid
    // Source: Square 100x100
    // Dest:   Trapezoid (Top width 80, Bottom width 100)
    const dest = [
      10,
      100, // TL moved in right by 10
      90,
      100, // TR moved in left by 10
      0,
      0, // BL stays
      100,
      0, // BR stays
    ];

    const transformer = new PerspT(SQUARE_SRC, dest);

    // The geometric center (50, 50) should remain at x=50
    // But Y might shift slightly depending on the perspective matrix w-division
    const [centerX, centerY] = transformer.transform(50, 50);

    expect(centerX).toBeCloseTo(50);

    // A point on the left edge (0, 50) should be pulled inwards slightly
    const [leftEdgeX, leftEdgeY] = transformer.transform(0, 50);
    expect(leftEdgeX).toBeGreaterThan(0); // It should be pulled > 0
    expect(leftEdgeX).toBeLessThan(10); // But not as far as the top corner (10)
  });

  // 4. ROUND TRIP (Inverse)
  it('should successfully inverse transform (Round Trip)', () => {
    // Complex warp: Skewing the shape
    const dest = [
      20,
      120, // TL skew
      100,
      100,
      0,
      0,
      120,
      -20, // BR skew
    ];

    const transformer = new PerspT(SQUARE_SRC, dest);

    const inputX = 25;
    const inputY = 75;

    // 1. Transform forward
    const [warpedX, warpedY] = transformer.transform(inputX, inputY);

    // 2. Transform backward (Inverse)
    const [originalX, originalY] = transformer.transformInverse(warpedX, warpedY);

    // 3. Should match original input
    // We use a slightly lower precision (4 digits) because matrix inversion accumulates float errors
    expect(originalX).toBeCloseTo(inputX, 4);
    expect(originalY).toBeCloseTo(inputY, 4);
  });
});
