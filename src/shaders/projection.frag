// Renders input texture with optional procedural testcard for alignment

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

// Corner constants
const vec2 bottomLeft01 = vec2(0.0, 0.0);
const vec2 bottomRight01 = vec2(1.0, 0.0);
const vec2 topLeft01 = vec2(0.0, 1.0);
const vec2 topRight01 = vec2(1.0, 1.0);

// Hash function for dithering
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Aspect correction for UV coordinates
vec2 aspect01(vec2 uv, vec2 resolution) {
    float aspect = resolution.x / resolution.y;
    vec2 scale = resolution.x > resolution.y ? vec2(aspect, 1.0) : vec2(1.0, 1.0 / aspect);
    return (uv - 0.5) * scale + 0.5;
}

// Anti-aliased step function
float aastep(float edge, float value) {
    float afwidth = fwidth(value);
    return smoothstep(edge - afwidth, edge + afwidth, value);
}

// Signed distance to line segment
float sdLine(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

// Checkerboard pattern
float checkerboard(vec2 uv, vec2 tiles) {
    return mod(floor(uv.x * tiles.x) + floor(uv.y * tiles.y), 2.0);
}

// Number printing functions
float digitBin(const int x) {
    return x == 0 ? 480599.0 : x == 1 ? 139810.0 : x == 2 ? 476951.0 : x == 3 ? 476999.0 : x == 4 ? 350020.0 : x == 5 ? 464711.0 : x == 6 ? 464727.0 : x == 7 ? 476228.0 : x == 8 ? 481111.0 : x == 9 ? 481095.0 : 0.0;
}

float printValue(vec2 vStringCoords, float fValue, float fMaxDigits, float fDecimalPlaces) {
    if((vStringCoords.y < 0.0) || (vStringCoords.y >= 1.0))
        return 0.0;

    bool bNeg = (fValue < 0.0);
    fValue += 1e-5;
    fValue = abs(fValue);

    float fLog10Value = log2(abs(fValue)) / log2(10.0);
    float fBiggestIndex = max(floor(fLog10Value), 0.0);
    float fDigitIndex = fMaxDigits - floor(vStringCoords.x);
    float fCharBin = 0.0;
    if(fDigitIndex > (-fDecimalPlaces - 1.01)) {
        if(fDigitIndex > fBiggestIndex) {
            if((bNeg) && (fDigitIndex < (fBiggestIndex + 1.5)))
                fCharBin = 1792.0;
        } else {
            if(fDigitIndex == -1.0) {
                if(fDecimalPlaces > 0.0)
                    fCharBin = 2.0;
            } else {
                float fReducedRangeValue = fValue;
                if(fDigitIndex < 0.0) {
                    fReducedRangeValue = fract(fValue);
                    fDigitIndex += 1.0;
                }
                float fDigitValue = (abs(fReducedRangeValue / (pow(10.0, fDigitIndex))));
                fCharBin = digitBin(int(floor(mod(fDigitValue, 10.0))));
            }
        }
    }
    return floor(mod((fCharBin / pow(2.0, floor(fract(vStringCoords.x) * 4.0) + (floor(vStringCoords.y * 5.0) * 4.0))), 2.0));
}

//procedural resolution & aspect independent testcard 
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

    float timeDigits = printValue((uv - vec2(0.385, 0.3)) * 30.0, time, 2.0, 2.0);
    color = mix(color, WHITE, timeDigits);
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

    // color += (1.0 / 255.0) * hash12(gl_FragCoord.xy) - (0.5 / 255.0);
    gl_FragColor = vec4(color, 1.0);
}
