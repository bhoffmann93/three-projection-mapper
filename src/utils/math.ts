export const clamp = (num: number, min: number, max: number) => {
  if (max < min) {
    [min, max] = [max, min];
  }
  if (num < min) return min;
  else if (num > max) return max;
  return num;
};

// clamp to [0,1]
export const saturate = (num: number): number => {
  return clamp(num, 0, 1);
};

// http://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/
export const damp = (x: number, y: number, lambda: number, deltaTime: number) => {
  return lerp(x, y, 1 - Math.exp(-lambda * deltaTime));
};

export const lerp = (min: number, max: number, t: number) => {
  return min + t * (max - min);
};

export const inverseLerp = (num: number, min: number, max: number) => {
  return (num - min) / (max - min);
};

export const map = (
  num: number,
  min1: number,
  max1: number,
  min2: number,
  max2: number,
  round = false,
  constrainMin = true,
  constrainMax = true,
) => {
  if (constrainMin && num < min1) return min2;
  if (constrainMax && num > max1) return max2;

  const num1 = (num - min1) / (max1 - min1);
  const num2 = num1 * (max2 - min2) + min2;
  if (round) return Math.round(num2);
  return num2;
};
