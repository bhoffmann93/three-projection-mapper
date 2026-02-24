export const calculateFovFromThrowRatio = (throwRatio: number, aspect: number): number => {
  const halfAngleH = Math.atan(0.5 / throwRatio);
  const halfAngleV = Math.atan(Math.tan(halfAngleH) / aspect);
  return (halfAngleV * 2 * 180) / Math.PI;
};
