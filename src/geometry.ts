//@ts-ignore
import calcConvexHull from 'convex-hull';
import { lerp } from 'three/src/math/MathUtils';

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
