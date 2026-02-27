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
uniform float uGamma;
uniform float uContrast;
uniform float uHue;

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

// Hash without Sine 
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

// https://www.shadertoy.com/view/ltSfWV
// continuity is independent of steepness parameter s
// at x = 1/2: 3rd derivative = 0 for s = 1;  2rd derivative = 0 for all values of s
float smootheststep(float x, float s) {
    const float ss = 2.88539;// 2.0 / log(2.0)
    s *= ss;
    x = clamp(x, 0.0, 1.0);
    return 1.0 / (1.0 + exp2(tan(x * PI - PI * 0.5) * -s));
}

float smootherstep(float edge0, float edge1, float x) {
    x = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

float sdBox(vec2 p, vec2 size) {
    vec2 r = abs(p) - size;
    return min(max(r.x, r.y), 0.0) + length(max(r, vec2(0, 0)));
}

// UV-space mask: always fits the plane (vUv 0-1), feather inward by soft units
// SDF is negative inside, 0 at boundary — transition from -soft (opaque) to 0 (black)
float getRoundedMask(vec2 uv, float soft, float radius) {
    vec2 p = uv - 0.5;
    float dist = sdBox(p, vec2(0.5 - radius)) - radius;
    return 1.0 - smoothstep(-soft, 0.0, dist);
}

vec3 hueShift(vec3 color, float hue) {
    vec3 k = vec3(0.57735);
    float cosAngle = cos(hue * TAU);
    return color * cosAngle + cross(k, color) * sin(hue * TAU) + k * dot(k, color) * (1.0 - cosAngle);
}

void main() {
    vec3 color;

    //test card always gets displayed at full res (render res)
    if(uShowTestCard) {
        color = testCard(vUv, uShouldWarp ? uWarpPlaneSize : uBufferResolution, uTime);
    } else {
        color = texture2D(uBuffer, vUv).rgb;
    }

    if(uShouldWarp == false || uShowControlLines) {
        float borderLines = drawBorderLines(vUv);
        color = mix(color, vec3(0.75), borderLines);
    }

    if(uShowControlLines) {
        float lines = drawControlLines(vUv, vec2(float(uGridSizeX), float(uGridSizeY)));
        color = mix(color, vec3(0.75), lines);
    }

    // Image adjustments
    color = (color - 0.5) * uContrast + 0.5;
    if(abs(uHue) > 0.001) {
        color = hueShift(color, uHue);
    }
    color = pow(max(color, 0.0), vec3(1.0 / uGamma));

    // Feather mask
    if(uMaskEnabled) {
        float mask = getRoundedMask(vUv, uFeather, 0.0);
        color = mix(vec3(0.0), color, mask);
    }

    gl_FragColor = vec4(color, 1.0);
}
