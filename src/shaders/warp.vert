// Bicubic Grid Warp adapted from Omnidome https://github.com/WilstonOreo/omnidome/blob/master/lib/src/WarpGrid.cpp
/* Copyright (c) 2014-2015 "Omnidome" by Michael Winkelmann
 * Dome Mapping Projection Software (http://omnido.me).
 * Omnidome was created by Michael Winkelmann aka Wilston Oreo (@WilstonOreo)
 *
 * This file is part of Omnidome.
 *
 * Omnidome is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

varying vec2 vUv;
uniform vec3 uCorners[4]; //World Space TL TR BL BR
uniform vec3 uControlPoint;
uniform vec3 uControlPoints[CONTROL_POINT_AMOUNT]; //World Space BL Origin
uniform int uGridSizeX;
uniform int uGridSizeY;
uniform float uTime;

//fast Catmull-Rom
//http://www.paulinternet.nl/?page=bicubic 
// p0 before p1 segment-start p2 segment-end p4 after segment
vec2 cubicInterpolate(vec2 p0, vec2 p1, vec2 p2, vec2 p3, float t) {
    return p1 + 0.5 * t * (p2 - p0 +
        t * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3 +
        t * (3.0 * (p1 - p2) + p3 - p0)));

}

vec2 getPoint(int x, int y) {
    int maxX = uGridSizeX - 1;
    int maxY = uGridSizeY - 1;

    // x = clamp(x, 0, maxX);
    // y = clamp(y, 0, maxY);

    int linearIndex = y * uGridSizeX + x;

    return uControlPoints[linearIndex].xy; //ignore z
}

vec2 getPointResolvedY(int x, int y) {
    int maxY = uGridSizeY - 1;

    // Bottom Edge y is -1)
    // Instead of math, we mirror "Use Row 0 and Row 1 to guess Row -1"
    if(y < 0) {
        return 2.0 * getPoint(x, 0) - getPoint(x, 1);
    }

    if(y > maxY) {
        return 2.0 * getPoint(x, maxY) - getPoint(x, maxY - 1);
    }

    // Valid indexes for Point in grid
    return getPoint(x, y);
}

// Mirror Extrapolation adapted from https://github.com/WilstonOreo/omnidome/blob/master/lib/src/WarpGrid.cpp
vec2 getControlPoint(int xIndex, int yIndex) {
    int maxX = uGridSizeX - 1;

    // Left Edge no control point avaliable to get -> create virtual point by mirror extapolation
    // use 2 right neighbors to guess next point (which is correct when our cell size is equal)
    // index == -1 
    if(xIndex < 0) {
        return 2.0 * getPointResolvedY(0, yIndex) - getPointResolvedY(1, yIndex);
    }

    // Right Edge 
    // Use the last two valid columns to guess the next one
    if(xIndex > maxX) {
        return 2.0 * getPointResolvedY(maxX, yIndex) - getPointResolvedY(maxX - 1, yIndex);
    }

    // x index lies inside grid
    return getPointResolvedY(xIndex, yIndex);
}

// Bicubic interpolation using 4x4 control point grid for every cell
vec2 bicubicInterpolate(float uCell, float vCell, int cellIndexX, int cellIndexY) {
    vec2 rows[4];

    // Sample/step through 4x4 (16Points) control point grid around the cell (catmull-rom needs 4 points so 4x4 per patch)
    // to collect control points from array and calculate virtual points
    for(int rowIndex = -1; rowIndex <= 2; rowIndex++) {
        vec2 cols[4];
        for(int colIndex = -1; colIndex <= 2; colIndex++) {
        // logic: glsl array index has to start at 0 so colIndex + 1
        // logic: we start sampling with -1,1 index at cellIndex 0,0
            cols[colIndex + 1] = getControlPoint(cellIndexX + colIndex, cellIndexY + rowIndex);
        }
        rows[rowIndex + 1] = cubicInterpolate(cols[0], cols[1], cols[2], cols[3], uCell);
    }

    return cubicInterpolate(rows[0], rows[1], rows[2], rows[3], vCell);
}

vec2 bilinearInterpolate(float u, float v, int cellIndexX, int cellIndexY) {
    vec2 bL = getControlPoint(cellIndexX, cellIndexY);
    vec2 bR = getControlPoint(cellIndexX + 1, cellIndexY);
    vec2 tL = getControlPoint(cellIndexX, cellIndexY + 1);
    vec2 tR = getControlPoint(cellIndexX + 1, cellIndexY + 1);

    vec2 top = mix(tL, tR, u);
    vec2 bottom = mix(bL, bR, u);
    return mix(bottom, top, v);
}

void main() {
    vUv = uv;

    vec2 scaledGridUv = vec2(vUv.x, vUv.y) * vec2(uGridSizeX - 1, uGridSizeY - 1);
    int cellIndexX = int(floor(scaledGridUv.x));
    int cellIndexY = int(floor(scaledGridUv.y)); 

    // Local uv coordinates within grid cell
    float localCellUvX = fract(scaledGridUv.x);
    float localCellUvY = fract(scaledGridUv.y);

    vec2 bicubicTransformedPos = bicubicInterpolate(localCellUvX, localCellUvY, cellIndexX, cellIndexY);
    // vec2 bilinearTransformedPos = bilinearInterpolate(localCellUvX, localCellUvY, cellIndexX, cellIndexY);
    // bicubicTransformedPos = mix(bicubicTransformedPos, bilinearTransformedPos, 1.0);

    gl_Position = projectionMatrix * viewMatrix * vec4(vec3(bicubicTransformedPos, 0.0), 1.0); //world space vertex 
    // gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); //orignal vertex

}