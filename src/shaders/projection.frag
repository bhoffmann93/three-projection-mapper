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
uniform bool uShouldWarp;

uniform sampler2D uBuffer;
uniform vec2 uBufferResolution;
uniform vec2 uWarpPlaneSize;
uniform float uTime;
uniform bool uShowTestCard;
uniform bool uShowControlLines;
uniform int uGridSizeX;
uniform int uGridSizeY;

uniform bool uMaskEnabled;
uniform float uFeather;
uniform bool uTonemap;
uniform float uGamma;
uniform float uContrast;
uniform float uHue;

// Bezier Mask
#define MAX_QUADRATIC_SEGMENTS 16

uniform bool uBezierMaskEnabled;
uniform int uBezierSegmentCount;
uniform vec2 uSegP0[MAX_QUADRATIC_SEGMENTS];
uniform vec2 uSegP1[MAX_QUADRATIC_SEGMENTS];
uniform vec2 uSegP2[MAX_QUADRATIC_SEGMENTS];
uniform float uBezierFeather;

struct BezierQuadratic {
    vec2 p0;
    vec2 p1;
    vec2 p2;
};

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

float smootherstep(float edge0, float edge1, float x) {
    x = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
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
    if(vUv.y < tileSize.y * 0.75 && vUv.x > 0.25 && vUv.x < 0.75) {
        float segment = floor(x * 8.0);

        vec3 barColor = BLACK;
        if(segment == 0.0)
            barColor = WHITE;
        else if(segment == 1.0)
            barColor = YELLOW;
        else if(segment == 2.0)
            barColor = CYAN;
        else if(segment == 3.0)
            barColor = GREEN;
        else if(segment == 4.0)
            barColor = MAGENTA;
        else if(segment == 5.0)
            barColor = RED;
        else if(segment == 6.0)
            barColor = BLUE;

        color = barColor;
    }

    // Grey gradient steps
    if(1.0 - vUv.y < tileSize.y * 0.75 && vUv.x > 0.25 && vUv.x < 0.75) {
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
    if(vUv.y > 0.25 && vUv.y < 0.75 && vUv.x > tileSize.x / 2.0 && vUv.x < tileSize.x * 1.5) {
        color = mix(BLACK, WHITE, y);
    }

    // RGB gradient
    if(vUv.y > 0.25 && vUv.y < 0.75 && vUv.x > 1.0 - tileSize.x * 1.5 && vUv.x < 1.0 - tileSize.x / 2.0) {
        color = 0.5 + 0.5 * cos((TAU * y - time) + vec3(0.0, 2.094, 4.188));
    }

    // Red corners
    float cornerSize = 1.0 / tileCount.y * 0.5;
    if(vUv.x < cornerSize && vUv.y < cornerSize * ratio)
        color = RED;
    if(vUv.x > 1.0 - cornerSize && vUv.y < cornerSize * ratio)
        color = RED;
    if(vUv.x < cornerSize && vUv.y > 1.0 - cornerSize * ratio)
        color = RED;
    if(vUv.x > 1.0 - cornerSize && vUv.y > 1.0 - cornerSize * ratio)
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

// Gaussian Filtered Rectangle 
// Mathematically based on the Error Function (erf) approximation.
// Reference: https://www.shadertoy.com/view/NsVSWy
// More Information: https://raphlinus.github.io/graphics/2020/04/21/blurred-rounded-rects.html
float erf(in float x) {
    return sign(x) * sqrt(1.0 - exp2(-1.787776 * x * x));
}

// Gaussian filtered blurry rectangle
float gaussianRect(in vec2 p, in vec2 b, in float w) {
    float u = erf((p.x + b.x) / w) - erf((p.x - b.x) / w);
    float v = erf((p.y + b.y) / w) - erf((p.y - b.y) / w);
    return u * v / 4.0;
}

float gaussianRectMask(vec2 uv, vec2 res, float soft) {
    float aspect = res.x / res.y;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    vec2 baseSize = vec2(aspect, 1.0) * 0.5;
    vec2 insetSize = baseSize - (soft * 1.5);
    float rectmask = gaussianRect(p, insetSize, soft);
    return rectmask;
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
    if(uTonemap)
        color = acesTonemap(color); //hdr to 0.0-1.0 range

    color = brightnessContrast(color, 0.0, uContrast);

    if(abs(uHue) > 0.001)
        color = hueShift(color, uHue);

    color = pow(max(color, 0.0), vec3(1.0 / uGamma)); //gamma
    return clamp(color, 0.0, 1.0);
}

// Winding number contribution from one quadratic bezier segment (32 linear sub-segments)
int quadraticCrossings(vec2 p, vec2 P0, vec2 B, vec2 P2) {
    int w = 0;
    vec2 prev = P0;
    for(int i = 1; i <= 32; i++) {
        float t = float(i) / 32.0;
        float mt = 1.0 - t;
        vec2 curr = mt * mt * P0 + 2.0 * mt * t * B + t * t * P2;
        if(prev.y <= p.y) {
            if(curr.y > p.y) {
                float c = (curr.x - prev.x) * (p.y - prev.y) - (p.x - prev.x) * (curr.y - prev.y);
                if(c > 0.0)
                    w++;
            }
        } else {
            if(curr.y <= p.y) {
                float c = (curr.x - prev.x) * (p.y - prev.y) - (p.x - prev.x) * (curr.y - prev.y);
                if(c < 0.0)
                    w--;
            }
        }
        prev = curr;
    }
    return w;
}

// Quadratic Bezier Distance 2D
// https://www.shadertoy.com/view/MlKcDD
// The MIT License
// Copyright © 2018 Inigo Quilez
float dot2(vec2 v) {
    return dot(v, v);
}
float cro(vec2 a, vec2 b) {
    return a.x * b.y - a.y * b.x;
}
float cos_acos_3(float x) {
    x = sqrt(0.5 + 0.5 * x);
    return x * (x * (x * (x * -0.008972 + 0.039071) - 0.107074) + 0.576975) + 0.5;
} // https://www.shadertoy.com/view/WltSD7

// signed distance to a quadratic bezier
float sdBezier(in vec2 pos, in vec2 A, in vec2 B, in vec2 C, out vec2 outQ) {
    vec2 a = B - A;
    vec2 b = A - 2.0 * B + C;
    vec2 c = a * 2.0;
    vec2 d = A - pos;

    // cubic to be solved (kx*=3 and ky*=3)
    float kk = 1.0 / dot(b, b);
    float kx = kk * dot(a, b);
    float ky = kk * (2.0 * dot(a, a) + dot(d, b)) / 3.0;
    float kz = kk * dot(d, a);

    float res = 0.0;
    float sgn = 0.0;

    float p = ky - kx * kx;
    float q = kx * (2.0 * kx * kx - 3.0 * ky) + kz;
    float p3 = p * p * p;
    float q2 = q * q;
    float h = q2 + 4.0 * p3;

    if(h >= 0.0) {   // 1 root
        h = sqrt(h);

        #if 0
        vec2 x = (vec2(h, -h) - q) / 2.0;
            #if 0
            // When p≈0 and p<0, h-q has catastrophic cancelation. So, we do
            // h=√(q²+4p³)=q·√(1+4p³/q²)=q·√(1+w) instead. Now we approximate
            // √ by a linear Taylor expansion into h≈q(1+½w) so that the q's
            // cancel each other in h-q. Expanding and simplifying further we
            // get x=vec2(p³/q,-p³/q-q). And using a second degree Taylor
            // expansion instead: x=vec2(k,-k-q) with k=(1-p³/q²)·p³/q
        if(abs(p) < 0.001) {
            float k = p3 / q;              // linear approx
              //float k = (1.0-p3/q2)*p3/q;  // quadratic approx 
            x = vec2(k, -k - q);
        }
            #endif

        vec2 uv = sign(x) * pow(abs(x), vec2(1.0 / 3.0));
        float t = uv.x + uv.y;
        #else
        h = (q < 0.0) ? h : -h; // copysign()
        float x = (h - q) / 2.0;
        float v = sign(x) * pow(abs(x), 1.0 / 3.0);
        float t = v - p / v;
        #endif

		// from NinjaKoala - single newton iteration to account for cancellation
        t -= (t * (t * t + 3.0 * p) + q) / (3.0 * t * t + 3.0 * p);

        t = clamp(t - kx, 0.0, 1.0);
        vec2 w = d + (c + b * t) * t;
        outQ = w + pos;
        res = dot2(w);
        sgn = cro(c + 2.0 * b * t, w);
    } else {   // 3 roots
        float z = sqrt(-p);
        #if 0
        float v = acos(q / (p * z * 2.0)) / 3.0;
        float m = cos(v);
        float n = sin(v);
        #else
        float m = cos_acos_3(q / (p * z * 2.0));
        float n = sqrt(1.0 - m * m);
        #endif
        n *= sqrt(3.0);
        vec3 t = clamp(vec3(m + m, -n - m, n - m) * z - kx, 0.0, 1.0);
        vec2 qx = d + (c + b * t.x) * t.x;
        float dx = dot2(qx), sx = cro(a + b * t.x, qx);
        vec2 qy = d + (c + b * t.y) * t.y;
        float dy = dot2(qy), sy = cro(a + b * t.y, qy);
        if(dx < dy) {
            res = dx;
            sgn = sx;
            outQ = qx + pos;
        } else {
            res = dy;
            sgn = sy;
            outQ = qy + pos;
        }
    }

    return sqrt(res) * sign(sgn);
}

float sdQuadraticBezier(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
    vec2 q;
    return sdBezier(p, p0, p1, p2, q);
}

void main() {
    vec3 color;

    //test card always gets displayed at full res (render res)
    if(uShowTestCard) {
        color = testCard(vUv, uShouldWarp ? uWarpPlaneSize : uBufferResolution, uTime);
    } else {
        color = texture2D(uBuffer, vUv).rgb;
    }

    // color = vec3(checkerboard(vUv, vec2(7.0, 4.0))); //for development tests
    color = imageAdjust(color);

    // Feather mask
    if(uMaskEnabled) {
        float soft = mix(0.0, 0.25, uFeather);
        float mask = gaussianRectMask(vUv, uShouldWarp ? uWarpPlaneSize : uBufferResolution, soft);
        color = mix(vec3(0.0), color, mask);
    }

    // Bezier mask
    if(uBezierMaskEnabled && uBezierSegmentCount > 0) {
        float minDist = 1e9;
        int winding = 0;
        for(int i = 0; i < MAX_QUADRATIC_SEGMENTS; i++) {
            if(i >= uBezierSegmentCount)
                break;
            BezierQuadratic seg = BezierQuadratic(uSegP0[i], uSegP1[i], uSegP2[i]);
            minDist = min(minDist, abs(sdQuadraticBezier(vUv, seg.p0, seg.p1, seg.p2)));
            winding += quadraticCrossings(vUv, seg.p0, seg.p1, seg.p2);
        }
        float inside = winding != 0 ? 1.0 : 0.0;
        float signedDist = inside > 0.5 ? minDist : -minDist;
        float fw = fwidth(minDist);
        float bezierMask = smootherstep(-fw - uBezierFeather, fw + uBezierFeather, signedDist);
        color = mix(vec3(0.0), color, bezierMask);
    }

    if(uShouldWarp == false || uShowControlLines) {
        float borderLines = drawBorderLines(vUv);
        color = mix(color, vec3(0.75), borderLines);
    }

    if(uShowControlLines) {
        float lines = drawControlLines(vUv, vec2(float(uGridSizeX), float(uGridSizeY)));
        color = mix(color, vec3(0.75), lines);
    }

    color += (1.0 / 255.0) * hash12(gl_FragCoord.xy + fract(uTime)) - (0.5 / 255.0); //dither banding reduction
    color = clamp(color, 0.0, 1.0);

    gl_FragColor = vec4(color, 1.0);
}
