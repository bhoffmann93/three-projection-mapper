/**
 * @license
 * Copyright (c) 2026 Bernhard Hoffmann | three-projection-mapper
 * Licensed under the MIT License.
 * * * Developed by Bernhard Hoffmann:
 * - Resolution-independent procedural Testcard with Anti-Aliasing.
 * * * Third-Party Credits:
 * - Hash without Sine: (c) 2014 David Hoskins (MIT).
 * - Gaussian Rect: Based on erf approximation oneshade (https://www.shadertoy.com/view/NsVSWy).
 */

varying vec2 vUv;
varying vec2 vWorldPos;
uniform bool uShouldWarp;

uniform sampler2D uBuffer;
uniform vec2 uSurfaceResolution;
uniform vec2 uUvRectOffset;
uniform vec2 uUvRectScale;
uniform vec2 uWarpPlaneSize;
uniform float uTime;
uniform bool uShowTestCard;
uniform bool uShowControlLines;
uniform int uGridSizeX;
uniform int uGridSizeY;

uniform bool uTonemap;
uniform float uShadows;
uniform float uHighlights;
uniform float uGamma;
uniform float uContrast;
uniform float uSaturation;
uniform float uHue;

// Masks (SurfaceMask)
uniform vec2 uFlatPlaneSize;
uniform bool uMaskEnabled;
uniform float uFeather;
uniform bool uPolygonMaskEnabled;
uniform bool uPolygonInvert;
uniform int uPolygonPointCount;
uniform vec2 uPolygonPoints[MAX_POLYGON_POINTS];
uniform float uPolygonFeather;

#define PI 3.14159265359
#define TAU 6.28318530718

#define BLACK vec3(0.0)
#define GREY vec3(0.5)
#define DARK_GREY vec3(0.125)
#define LIGHT_GREY vec3(0.75)
#define WHITE vec3(1.0)
#define RED vec3(1.0, 0.0, 0.0)
#define GREEN vec3(0.0, 1.0, 0.0)
#define BLUE vec3(0.0, 0.0, 1.0)
#define CYAN vec3(0.0, 1.0, 1.0)
#define MAGENTA vec3(1.0, 0.0, 1.0)
#define YELLOW vec3(1.0, 1.0, 0.0)

const vec2 bottomLeft01 = vec2(0.0, 0.0);
const vec2 bottomRight01 = vec2(1.0, 0.0);
const vec2 topLeft01 = vec2(0.0, 1.0);
const vec2 topRight01 = vec2(1.0, 1.0);

// Hash without Sine by Dave Hoskins (MIT)
// https://www.shadertoy.com/view/4djSRW
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec2 aspect01(vec2 uv, vec2 resolution) {
    float aspect = resolution.x / resolution.y;
    vec2 scale = resolution.x > resolution.y ? vec2(aspect, 1.0) : vec2(1.0, 1.0 / aspect);
    return (uv - 0.5) * scale + 0.5;
}

float aastep(float edge, float value) {
    float afwidth = fwidth(value);
    return smoothstep(edge - afwidth, edge + afwidth, value);
}

float sdLine(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

float checkerboard(vec2 uv, vec2 tiles) {
    return mod(floor(uv.x * tiles.x) + floor(uv.y * tiles.y), 2.0);
}

/** * Procedural Testcard by Bernhard Hoffmann (MIT)
 * Fully resolution-independent using screen-space derivatives (fwidth).
 * Features: Color bars, grey steps, crosshair, and circle for aspect ratio check.
 */
vec3 testCard(vec2 vUv, vec2 dimensions, float time) {
    vec2 uv = aspect01(vUv, dimensions);

    vec2 fw = fwidth(uv);
    float thicknessInPixel = 3.0;
    vec2 lineThickness = fw * thicknessInPixel * 0.5;
    float ratio = dimensions.x / dimensions.y;

    vec3 color = DARK_GREY;

    // Grid
    vec2 tileCount = vec2(12.0);
    vec2 tileSize = 1.0 / tileCount;
    vec2 gridLineThickness = tileCount * lineThickness * 0.5;
    vec2 gridUV = fract(uv * tileCount);

    float check = checkerboard(uv, tileCount);
    color = mix(color, GREY, check);

    vec2 dGrid = vec2(abs(gridUV.x - 0.5), abs(gridUV.y - 0.5));
    float fineGridLines = max((1.0 - aastep(gridLineThickness.x, dGrid.x)), (1.0 - aastep(gridLineThickness.y, dGrid.y)));
    color = mix(color, LIGHT_GREY, fineGridLines);

    float x = clamp((vUv.x - 0.25) / 0.5, 0.0, 1.0);
    float y = clamp((vUv.y - 0.25) / 0.5, 0.0, 1.0);

    // Color bars
    if (vUv.y < tileSize.y * 0.75 && vUv.x > 0.25 && vUv.x < 0.75) {
        float segment = floor(x * 8.0);

        vec3 barColor = BLACK;
        if (segment == 0.0)
            barColor = WHITE;
        else if (segment == 1.0)
            barColor = YELLOW;
        else if (segment == 2.0)
            barColor = CYAN;
        else if (segment == 3.0)
            barColor = GREEN;
        else if (segment == 4.0)
            barColor = MAGENTA;
        else if (segment == 5.0)
            barColor = RED;
        else if (segment == 6.0)
            barColor = BLUE;

        color = barColor;
    }

    // Grey gradient steps
    if (1.0 - vUv.y < tileSize.y * 0.75 && vUv.x > 0.25 && vUv.x < 0.75) {
        color = mix(BLACK, WHITE, floor(x * 8.0) / 7.0);
    }

    // Cross lines
    vec2 dCrossCenter = vec2(abs(uv.x - 0.5), abs(uv.y - 0.5));
    float crossCenterLines = (1.0 - aastep(lineThickness.x, dCrossCenter.x)) + (1.0 - aastep(lineThickness.y, dCrossCenter.y));
    color = mix(color, WHITE, crossCenterLines);

    float maxFWidthVUV = min(fwidth(vUv.x), fwidth(vUv.y));

    // Circle
    float radius = 0.425;
    float euclideanFwidth = length(vec2(fwidth(uv.x), fwidth(uv.y)));
    float dCircle = abs(length(uv - 0.5) - radius);
    float circleLine = 1.0 - aastep(euclideanFwidth * thicknessInPixel / 2.0, dCircle);
    color = mix(color, WHITE, circleLine);

    // Diagonal lines
    float dLineBLTR = sdLine(vUv, bottomLeft01, topRight01);
    float dLineTLBR = sdLine(vUv, topLeft01, bottomRight01);
    float cross = max(1.0 - aastep(maxFWidthVUV * thicknessInPixel, dLineBLTR), 1.0 - aastep(maxFWidthVUV * thicknessInPixel, dLineTLBR));
    color = mix(color, WHITE, cross);

    // Border lines
    float leftLine = 1.0 - aastep(fwidth(vUv.x) * thicknessInPixel, vUv.x);
    float rightLine = 1.0 - aastep(fwidth(vUv.x) * thicknessInPixel, 1.0 - vUv.x);
    float bottomLine = 1.0 - aastep(fwidth(vUv.y) * thicknessInPixel, vUv.y);
    float topLine = 1.0 - aastep(fwidth(vUv.y) * thicknessInPixel, 1.0 - vUv.y);

    color = mix(color, WHITE, max(leftLine, rightLine));
    color = mix(color, WHITE, max(bottomLine, topLine));

    // Grey gradient
    if (vUv.y > 0.25 && vUv.y < 0.75 && vUv.x > tileSize.x / 2.0 && vUv.x < tileSize.x * 1.5) {
        color = mix(BLACK, WHITE, y);
    }

    // RGB gradient
    if (vUv.y > 0.25 && vUv.y < 0.75 && vUv.x > 1.0 - tileSize.x * 1.5 && vUv.x < 1.0 - tileSize.x / 2.0) {
        color = 0.5 + 0.5 * cos((TAU * y - time) + vec3(0.0, 2.094, 4.188));
    }

    // Red corners
    float cornerSize = 1.0 / tileCount.y * 0.5;
    if (vUv.x < cornerSize && vUv.y < cornerSize * ratio)
        color = RED;
    if (vUv.x > 1.0 - cornerSize && vUv.y < cornerSize * ratio)
        color = RED;
    if (vUv.x < cornerSize && vUv.y > 1.0 - cornerSize * ratio)
        color = RED;
    if (vUv.x > 1.0 - cornerSize && vUv.y > 1.0 - cornerSize * ratio)
        color = RED;

    return color;
}

float drawControlLines(vec2 uv, vec2 gridSize) {
    vec2 fw = fwidth(uv);
    float thicknessInPixel = 2.0;
    vec2 lineThickness = fw * thicknessInPixel * 0.5;
    vec2 tileCount = vec2(gridSize.x - 1.0, gridSize.y - 1.0);
    vec2 gridLineThickness = tileCount * lineThickness;
    vec2 gridUv = fract(uv * tileCount);
    float startLines = max((1.0 - step(gridLineThickness.x, gridUv.x)), (1.0 - step(gridLineThickness.y, gridUv.y)));
    float endLines = max(step(1.0 - gridLineThickness.x, gridUv.x), step(1.0 - gridLineThickness.y, gridUv.y));
    return clamp(0.0, 1.0, max(startLines, endLines));
}

float drawBorderLines(vec2 uv) {
    float thicknessInPixel = 2.0;
    float leftLine = 1.0 - aastep(fwidth(vUv.x) * thicknessInPixel, vUv.x);
    float rightLine = 1.0 - aastep(fwidth(vUv.x) * thicknessInPixel, 1.0 - vUv.x);
    float bottomLine = 1.0 - aastep(fwidth(vUv.y) * thicknessInPixel, vUv.y);
    float topLine = 1.0 - aastep(fwidth(vUv.y) * thicknessInPixel, 1.0 - vUv.y);
    return clamp(max(leftLine, max(rightLine, max(bottomLine, topLine))), 0.0, 1.0);
}

vec3 acesTonemap(vec3 v) {
    v *= 0.6;
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((v * (a * v + b)) / (v * (c * v + d) + e), 0.0, 1.0);
}

//0-TAU
vec3 hueShift(vec3 color, float hue) {
    const vec3 k = vec3(0.57735, 0.57735, 0.57735);
    float cosAngle = cos(hue * TAU);
    return color * cosAngle + cross(k, color) * sin(hue * TAU) + k * dot(k, color) * (1.0 - cosAngle);
}

vec3 brightnessContrast(vec3 col, float brightness, float contrast) {
    return (col - 0.5) * contrast + 0.5 + brightness;
}

vec3 imageAdjust(vec3 color) {
    if (uTonemap)
        color = acesTonemap(color); //hdr to 0.0-1.0 range

    float blacks = uShadows;
    float whites = max(uHighlights, blacks + 0.001);
    color = clamp((color - blacks) / (whites - blacks), 0.0, 1.0);
    color = pow(color, vec3(1.0 / uGamma)); //midtone gamma

    color = brightnessContrast(color, 0.0, uContrast);

    //sat
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luma), color, uSaturation);

    if (abs(uHue) > 0.001)
        color = hueShift(color, uHue);

    return clamp(color, 0.0, 1.0);
}

// Masks

float smootherstep(float edge0, float edge1, float x) {
    x = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

// Gaussian Filtered Rectangle
// Mathematically based on the Error Function (erf) approximation.
// Reference: https://www.shadertoy.com/view/NsVSWy
// More Information: https://raphlinus.github.io/graphics/2020/04/21/blurred-rounded-rects.html
float erf(in float x) {
    return sign(x) * sqrt(1.0 - exp2(-1.787776 * x * x));
}

float gaussianRect(in vec2 p, in vec2 b, in float w) {
    float u = erf((p.x + b.x) / w) - erf((p.x - b.x) / w);
    float v = erf((p.y + b.y) / w) - erf((p.y - b.y) / w);
    return u * v / 4.0;
}

const float MAX_EDGE_FEATHER = 0.25; //softness at feather 1, in plane heights
const float EDGE_FEATHER_INSET = 1.5; //pulls the blur inside the edge so the border reaches black

float gaussianRectMask(vec2 uv, vec2 res, float soft) {
    float aspect = res.x / res.y;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    vec2 baseSize = vec2(aspect, 1.0) * 0.5;
    vec2 insetSize = baseSize - (soft * EDGE_FEATHER_INSET);
    return gaussianRect(p, insetSize, soft);
}

// Polygon SDF, MIT Inigo Quilez (adapted for GLSL ES 1.0 fixed-size uniform array)
// https://www.shadertoy.com/view/wdBXRW
// Adapted for aspect ratio correction so smoothstep (feather) is uniform
float sdPolygon(vec2 p, float aspect) {
    p = p * vec2(aspect, 1.0);
    vec2 p0 = uPolygonPoints[0] * vec2(aspect, 1.0);
    float d = dot(p - p0, p - p0);
    float s = 1.0;
    int j = uPolygonPointCount - 1;
    for(int i = 0; i < MAX_POLYGON_POINTS; i++) {
        if(i >= uPolygonPointCount)
            break;
        vec2 vi = uPolygonPoints[i] * vec2(aspect, 1.0);
        vec2 vj = uPolygonPoints[j] * vec2(aspect, 1.0);
        vec2 e = vj - vi;
        vec2 w = p - vi;
        vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
        d = min(d, dot(b, b));
        bvec3 cond = bvec3(p.y >= vi.y, p.y < vj.y, e.x * w.y > e.y * w.x);
        if(all(cond) || all(not(cond)))
            s = -s;
        j = i;
    }
    return s * sqrt(d);
}

// Output space, so the polygon stays on a light leak while the warp moves the content
vec2 outputPlaneUv(vec2 worldPos, vec2 flatPlaneSize) {
    return worldPos / flatPlaneSize + 0.5;
}

float maskReveal(vec2 contentUv, vec2 outputUv) {
    float reveal = 1.0;

    //at zero feather the rect is the content edge itself, so it would mask nothing
    if (uMaskEnabled && uFeather > 0.0) {
        float soft = mix(0.0, MAX_EDGE_FEATHER, uFeather);
        reveal *= gaussianRectMask(contentUv, uWarpPlaneSize, soft);
    }

    if (uPolygonMaskEnabled && uPolygonPointCount >= 3) {
        float aspect = uFlatPlaneSize.x / uFlatPlaneSize.y; //output uv is of the flat plane
        float dist = sdPolygon(outputUv, aspect);
        float fw = fwidth(dist);
        float polyMask = 1.0 - smootherstep(-(uPolygonFeather + fw), fw + uPolygonFeather, dist);
        reveal *= uPolygonInvert ? 1.0 - polyMask : polyMask;
    }

    return reveal;
}

void main() {
    vec3 color;

    //test card always gets displayed at full res (render res)
    if (uShowTestCard) {
        color = testCard(vUv, uShouldWarp ? uWarpPlaneSize : uSurfaceResolution, uTime);
    } else {
        //uv rect crop only applies to content sampling — test card,
        //control lines and border lines stay per-surface screen furniture
        color = texture2D(uBuffer, uUvRectOffset + vUv * uUvRectScale).rgb;
    }

    // color = vec3(checkerboard(vUv, vec2(7.0, 4.0))); //for development tests
    color = imageAdjust(color);

    //Dither: Reduce Banding Artifacts
    color += (1.0 / 255.0) * hash12(gl_FragCoord.xy + fract(uTime)) - (0.5 / 255.0);

    if (uShouldWarp == false || uShowControlLines) {
        float borderLines = drawBorderLines(vUv);
        color = mix(color, vec3(0.75), borderLines);
    }

    if (uShowControlLines) {
        float lines = drawControlLines(vUv, vec2(float(uGridSizeX), float(uGridSizeY)));
        color = mix(color, vec3(0.75), lines);
    }

    color = clamp(color, 0.0, 1.0);

    gl_FragColor = vec4(color, maskReveal(vUv, outputPlaneUv(vWorldPos, uFlatPlaneSize)));
}
