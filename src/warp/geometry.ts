//@ts-ignore
import calcConvexHull from 'convex-hull';
import { lerp } from '../utils/math';

export const toTuples = (arr: number[]): [number, number][] => {
  if (arr.length % 2 !== 0) throw new Error('Array length must be even to form [x, y] pairs.');
  const result: [number, number][] = [];
  for (let i = 0; i < arr.length; i += 2) {
    result.push([arr[i], arr[i + 1]]);
  }
  return result;
};

export const isQuadConcave = (corners: number[]) => {
  const convexHull = calcConvexHull(toTuples(corners));
  const isConcave = convexHull.length < 4; //1 point lies inside
  return isConcave;
};

/**
 * Point-in-quad test for a convex quad wound around its perimeter
 * (TL, TR, BR, BL). Points exactly on an edge count as inside.
 * Used for surface picking: the warp mesh is displaced on the GPU, so its
 * geometry cannot be raycast — the corner points are the real world-space quad.
 */
export const isPointInQuad = (perimeter: { x: number; y: number }[], x: number, y: number): boolean => {
  let sign = 0;
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i];
    const b = perimeter[(i + 1) % perimeter.length];
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cross === 0) continue;
    const currentSign = cross > 0 ? 1 : -1;
    if (sign === 0) sign = currentSign;
    else if (sign !== currentSign) return false;
  }
  return true;
};

/** Centroid of a quad's corner points */
export const quadCenter = (corners: readonly { x: number; y: number }[]): { x: number; y: number } => {
  const sum = corners.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / corners.length, y: sum.y / corners.length };
};

/**
 * Scale a quad about its own centroid.
 *
 * Every corner's offset from the centre is multiplied, so the quad keeps its
 * shape — a calibrated perspective survives being resized, which replacing the
 * quad with a rectangle would not.
 */
export const scaleQuadAboutCenter = (
  corners: readonly { x: number; y: number }[],
  factorX: number,
  factorY: number,
): { x: number; y: number }[] => {
  const center = quadCenter(corners);
  return corners.map((point) => ({
    x: center.x + (point.x - center.x) * factorX,
    y: center.y + (point.y - center.y) * factorY,
  }));
};

export const calculateGridPoints = (aspectRatio: number, minPoints: number): { x: number; y: number } => {
  if (aspectRatio >= 1) {
    return { x: Math.max(minPoints, Math.round(minPoints * aspectRatio)), y: minPoints };
  }
  return { x: minPoints, y: Math.max(minPoints, Math.round(minPoints / aspectRatio)) };
};

// uv [0,1] range
// u horizontal position parameter left -> right [0.0,1.0]
// v vertical position parameter top -> bottom [0.0,1.0]
// C0 ------- C1     (top edge)
// |          |
// |          |
// C2 ------- C3     (bottom edge)

export const bilinearInterpolateCorners = (u: number, v: number, inputCorners: number[]) => {
  const corners = toTuples(inputCorners);
  const topLeft = corners[0];
  const topRight = corners[1];
  const bottomLeft = corners[2];
  const bottomRight = corners[3];

  const top = [lerp(topLeft[0], topRight[0], u), lerp(topLeft[1], topRight[1], u)]; //xy interpolate top edge
  const bottom = [lerp(bottomLeft[0], bottomRight[0], u), lerp(bottomLeft[1], bottomRight[1], u)]; //xy Interpolate bottom edge
  return [lerp(top[0], bottom[0], v), lerp(top[1], bottom[1], v)]; //vertical
};
