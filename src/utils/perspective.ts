//@ts-nocheck
// Adapted with from https://github.com/jlouthan/perspective-transform

// The MIT License (MIT)

// Copyright (c) 2015 Jenny Louthan

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// Minimal numeric.js shim (only the functions we need)
const numeric = {
  dim(x: any): number[] {
    if (typeof x === 'object') {
      const y = x[0];
      if (typeof y === 'object') {
        return [x.length, y.length];
      }
      return [x.length];
    }
    return [];
  },

  clone(x: any): any {
    if (typeof x !== 'object') return x;
    if (Array.isArray(x)) {
      return x.map((item) => numeric.clone(item));
    }
    return x;
  },

  identity(n: number): number[][] {
    const result: number[][] = [];
    for (let i = 0; i < n; i++) {
      result[i] = [];
      for (let j = 0; j < n; j++) {
        result[i][j] = i === j ? 1 : 0;
      }
    }
    return result;
  },

  inv(a: number[][]): number[][] {
    const s = numeric.dim(a);
    const m = s[0];
    const n = s[1];
    const A = numeric.clone(a);
    const I = numeric.identity(m);

    for (let j = 0; j < n; ++j) {
      let i0 = -1;
      let v0 = -1;
      for (let i = j; i !== m; ++i) {
        const k = Math.abs(A[i][j]);
        if (k > v0) {
          i0 = i;
          v0 = k;
        }
      }
      [A[i0], A[j]] = [A[j], A[i0]];
      [I[i0], I[j]] = [I[j], I[i0]];

      const x = A[j][j];
      for (let k = j; k !== n; ++k) A[j][k] /= x;
      for (let k = n - 1; k !== -1; --k) I[j][k] /= x;

      for (let i = m - 1; i !== -1; --i) {
        if (i !== j) {
          const x = A[i][j];
          for (let k = j + 1; k !== n; ++k) A[i][k] -= A[j][k] * x;
          let k: number;
          for (k = n - 1; k > 0; --k) {
            I[i][k] -= I[j][k] * x;
            --k;
            I[i][k] -= I[j][k] * x;
          }
          if (k === 0) I[i][0] -= I[j][0] * x;
        }
      }
    }
    return I;
  },

  dotMMsmall(x: number[][], y: number[][]): number[][] {
    const p = x.length;
    const q = y.length;
    const r = y[0].length;
    const ret: number[][] = [];

    for (let i = p - 1; i >= 0; i--) {
      const foo: number[] = [];
      const bar = x[i];
      for (let k = r - 1; k >= 0; k--) {
        let woo = bar[q - 1] * y[q - 1][k];
        let j: number;
        for (j = q - 2; j >= 1; j -= 2) {
          const i0 = j - 1;
          woo += bar[j] * y[j][k] + bar[i0] * y[i0][k];
        }
        if (j === 0) {
          woo += bar[0] * y[0][k];
        }
        foo[k] = woo;
      }
      ret[i] = foo;
    }
    return ret;
  },

  dotMV(x: number[][], y: number[]): number[] {
    return x.map((row) => {
      let sum = 0;
      for (let i = 0; i < row.length; i++) {
        sum += row[i] * y[i];
      }
      return sum;
    });
  },

  transpose(x: number[][]): number[][] {
    const m = x.length;
    const n = x[0].length;
    const ret: number[][] = [];
    for (let j = 0; j < n; j++) {
      ret[j] = [];
      for (let i = 0; i < m; i++) {
        ret[j][i] = x[i][j];
      }
    }
    return ret;
  },
};

function round(num: number): number {
  return Math.round(num * 10000000000) / 10000000000;
}

function getNormalizationCoefficients(srcPts: number[], dstPts: number[], isInverse: boolean): number[] {
  if (isInverse) {
    [dstPts, srcPts] = [srcPts, dstPts];
  }

  const r1 = [srcPts[0], srcPts[1], 1, 0, 0, 0, -1 * dstPts[0] * srcPts[0], -1 * dstPts[0] * srcPts[1]];
  const r2 = [0, 0, 0, srcPts[0], srcPts[1], 1, -1 * dstPts[1] * srcPts[0], -1 * dstPts[1] * srcPts[1]];
  const r3 = [srcPts[2], srcPts[3], 1, 0, 0, 0, -1 * dstPts[2] * srcPts[2], -1 * dstPts[2] * srcPts[3]];
  const r4 = [0, 0, 0, srcPts[2], srcPts[3], 1, -1 * dstPts[3] * srcPts[2], -1 * dstPts[3] * srcPts[3]];
  const r5 = [srcPts[4], srcPts[5], 1, 0, 0, 0, -1 * dstPts[4] * srcPts[4], -1 * dstPts[4] * srcPts[5]];
  const r6 = [0, 0, 0, srcPts[4], srcPts[5], 1, -1 * dstPts[5] * srcPts[4], -1 * dstPts[5] * srcPts[5]];
  const r7 = [srcPts[6], srcPts[7], 1, 0, 0, 0, -1 * dstPts[6] * srcPts[6], -1 * dstPts[6] * srcPts[7]];
  const r8 = [0, 0, 0, srcPts[6], srcPts[7], 1, -1 * dstPts[7] * srcPts[6], -1 * dstPts[7] * srcPts[7]];

  const matA = [r1, r2, r3, r4, r5, r6, r7, r8];
  const matB = dstPts;

  try {
    const matC = numeric.inv(numeric.dotMMsmall(numeric.transpose(matA), matA));
    const matD = numeric.dotMMsmall(matC, numeric.transpose(matA));
    const matX = numeric.dotMV(matD, matB);

    for (let i = 0; i < matX.length; i++) {
      matX[i] = round(matX[i]);
    }
    matX[8] = 1;

    return matX;
  } catch (e) {
    console.error(e);
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }
}

export class PerspT {
  srcPts: number[];
  dstPts: number[];
  coeffs: number[];
  coeffsInv: number[];

  constructor(srcPts: number[], dstPts: number[]) {
    this.srcPts = srcPts;
    this.dstPts = dstPts;
    this.coeffs = getNormalizationCoefficients(this.srcPts, this.dstPts, false);
    this.coeffsInv = getNormalizationCoefficients(this.srcPts, this.dstPts, true);
  }

  transform(x: number, y: number): number[] {
    const coordinates: number[] = [];
    coordinates[0] =
      (this.coeffs[0] * x + this.coeffs[1] * y + this.coeffs[2]) / (this.coeffs[6] * x + this.coeffs[7] * y + 1);
    coordinates[1] =
      (this.coeffs[3] * x + this.coeffs[4] * y + this.coeffs[5]) / (this.coeffs[6] * x + this.coeffs[7] * y + 1);
    return coordinates;
  }

  transformInverse(x: number, y: number): number[] {
    const coordinates: number[] = [];
    coordinates[0] =
      (this.coeffsInv[0] * x + this.coeffsInv[1] * y + this.coeffsInv[2]) /
      (this.coeffsInv[6] * x + this.coeffsInv[7] * y + 1);
    coordinates[1] =
      (this.coeffsInv[3] * x + this.coeffsInv[4] * y + this.coeffsInv[5]) /
      (this.coeffsInv[6] * x + this.coeffsInv[7] * y + 1);
    return coordinates;
  }
}

export default PerspT;
