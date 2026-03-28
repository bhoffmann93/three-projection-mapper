varying vec2 vUv;

uniform vec2 uWarpPlaneSize;
uniform bool uMaskEnabled;
uniform float uFeather;

uniform bool uPolygonMaskEnabled;
uniform int uPolygonPointCount;
uniform vec2 uPolygonPoints[MAX_POLYGON_POINTS];
uniform float uPolygonFeather;

uniform bool uShouldWarp;

float aastep(float edge, float value) {
    float afwidth = fwidth(value);
    return smoothstep(edge - afwidth, edge + afwidth, value);
}

// Draws a 2-pixel-wide border at each UV edge (0 and 1).
float drawBorderLines(vec2 uv) {
    float thicknessInPixel = 2.0;
    float leftLine = 1.0 - aastep(fwidth(uv.x) * thicknessInPixel, uv.x);
    float rightLine = 1.0 - aastep(fwidth(uv.x) * thicknessInPixel, 1.0 - uv.x);
    float bottomLine = 1.0 - aastep(fwidth(uv.y) * thicknessInPixel, uv.y);
    float topLine = 1.0 - aastep(fwidth(uv.y) * thicknessInPixel, 1.0 - uv.y);
    return clamp(max(leftLine, max(rightLine, max(bottomLine, topLine))), 0.0, 1.0);
}

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

float gaussianRectMask(vec2 uv, vec2 res, float soft) {
    float aspect = res.x / res.y;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    vec2 baseSize = vec2(aspect, 1.0) * 0.5;
    vec2 insetSize = baseSize - (soft * 1.5);
    return gaussianRect(p, insetSize, soft);
}

// Polygon SDF — Inigo Quilez (adapted for GLSL ES 1.0 fixed-size uniform array)
float sdPolygon(vec2 p) {
    float d = dot(p - uPolygonPoints[0], p - uPolygonPoints[0]);
    float s = 1.0;
    int j = uPolygonPointCount - 1;
    for(int i = 0; i < MAX_POLYGON_POINTS; i++) {
        if(i >= uPolygonPointCount)
            break;
        vec2 vi = uPolygonPoints[i];
        vec2 vj = uPolygonPoints[j];
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

void main() {
    float reveal = 1.0;

    if(uMaskEnabled) {
        float soft = mix(0.0, 0.25, uFeather);
        reveal *= gaussianRectMask(vUv, uWarpPlaneSize, soft);
    }

    if(uPolygonMaskEnabled && uPolygonPointCount >= 3) {
        float dist = sdPolygon(vUv);
        float fw = fwidth(dist);
        float polyMask = 1.0 - smootherstep(-(uPolygonFeather + fw), fw + uPolygonFeather, dist);
        reveal *= polyMask;
    }

    // Border: visible when warp is off as an alignment guide; polygon mask overwrites it.
    if(!uShouldWarp) {
        reveal *= (1.0 - drawBorderLines(vUv));
    }

    vec3 color = vec3(0.0);
    if(uShouldWarp == false) {
        float borderLines = drawBorderLines(vUv);
        color = mix(color, vec3(0.75), borderLines);
    }

    gl_FragColor = vec4(color, 1.0 - reveal);
}
