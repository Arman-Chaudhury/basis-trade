/* Chladni sand simulation, ported in spirit from chladni-plate-experiment.vercel.app:
   grains live in a float texture; each frame a fragment shader moves them.
   Physics: local drive Γ·|Ψ| vs. a per-grain lift-off threshold; above it the grain performs a random walk
   (σ ∝ excess^1.5) with a down-slope bias toward the rest contour; far above it, long flights re-sprinkle it.
   The plate field Ψ is a weighted sum of Rayleigh square-plate modes near the drive frequency, weighted by the
   mode shape at the drive point (off-centre drive breaks the symmetry). */

export const COMMON = /* glsl */`
const float PI = 3.141592653589793;
const float TWO_PI = 6.283185307179586;
const int MAX_MODES = 16;
uniform vec4 uModes[MAX_MODES];   // (m, n, weight, sign)
uniform int uModeCount;
uniform float uAmpMax;

uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 hash3(uvec3 v) { return vec3(pcg3d(v)) * (1.0 / 4294967296.0); }
float hash1(uint v) { return hash3(uvec3(v, 7u, 13u)).x; }
vec2 gaussian2(vec2 u) {
  float r = sqrt(-2.0 * log(max(u.x, 1.0e-7)));
  float a = TWO_PI * u.y;
  return r * vec2(cos(a), sin(a));
}
// Ψ(p) and ∇Ψ for p in [-1,1]^2. Mode k: sign-combined cos(nπx)cos(mπy) ± cos(mπx)cos(nπy).
void fieldEval(vec2 p, out float value, out vec2 grad) {
  value = 0.0; grad = vec2(0.0);
  float x = (p.x + 1.0) * 0.5 * PI, y = (p.y + 1.0) * 0.5 * PI;
  for (int k = 0; k < MAX_MODES; k++) {
    if (k >= uModeCount) break;
    vec4 md = uModes[k];
    float m = md.x, n = md.y, w = md.z, s = md.w;
    float cnx = cos(n * x), cmy = cos(m * y), cmx = cos(m * x), cny = cos(n * y);
    float snx = sin(n * x), smy = sin(m * y), smx = sin(m * x), sny = sin(n * y);
    float v = cnx * cmy + s * cmx * cny;
    float dx = (-n * snx * cmy + s * (-m * smx) * cny) * 0.5 * PI;
    float dy = (cnx * (-m * smy) + s * cmx * (-n * sny)) * 0.5 * PI;
    value += w * v; grad += w * vec2(dx, dy);
  }
}
bool onPlate(vec2 p) { return all(lessThanEqual(abs(p), vec2(1.0))); }
`

export const INIT_FRAG = /* glsl */`
precision highp float; precision highp int;
layout(location = 0) out vec4 outPos;
layout(location = 1) out vec4 outAux;
uniform uint uSeed;
${COMMON}
void main() {
  uvec2 texel = uvec2(gl_FragCoord.xy);
  vec3 rnd = hash3(uvec3(texel, uSeed));
  outPos = vec4(rnd.xy * 2.0 - 1.0, 0.0, 0.0);
  outAux = vec4(0.0, rnd.z * 2.0, 0.0, 0.0);
}`

export const STEP_FRAG = /* glsl */`
precision highp float; precision highp int; precision highp sampler2D;
layout(location = 0) out vec4 outPos;   // x, y, hop, fieldUnder
layout(location = 1) out vec4 outAux;   // settled, age, falling, unused
uniform sampler2D uPos; uniform sampler2D uAux;
uniform float uDelta; uniform float uTime; uniform uint uFrame;
uniform float uGamma;       // drive acceleration at the antinode, in g
uniform float uStepScale;   // r.m.s. hop per √frame at unit excess
uniform float uSlopeBias;   // down-slope speed per unit slope
uniform float uFlightRate;  // long flights per second of a hard-shaken grain
uniform float uSprinkle;    // respawn rate of fallen grains (1/s)
uniform float uHopHeight;   // visual hop amplitude
uniform float uShake;       // strike wave strength
uniform float uRipple;      // 0..1 travel of the strike front
uniform vec2 uRippleOrigin;
${COMMON}
const float REFERENCE_FPS = 60.0;
const float FALL_RATE = 1.5, FALL_DROP = 2.5, RESPAWN_HOP = 0.6;
const float AIRBORNE_RATE = 2.0, LIFT_OFF_SPREAD = 0.35;
const float FLIGHT_EXCESS_MIN = 0.6, FLIGHT_EXCESS_FULL = 2.5;
const float BIAS_MAX_APPROACH = 0.8;
const float HOP_EASE = 12.0, SETTLE_EASE = 3.0;
const float FLICKER_BASE = 0.7, FLICKER_DEPTH = 0.3, DRIVE_FLICKER_HZ = 9.0;
const float RIPPLE_REACH = 2.0, KICK_WIDTH = 0.15, WAKE_LENGTH = 0.5, RIPPLE_SPREAD = 1.5;
const float SHAKE_STEP = 0.05, SHAKE_HOP = 0.8, CREST_LIFT = 0.5, SHAKE_THROW = 0.22;

float kickAt(vec2 p) {
  float front = uRipple * RIPPLE_REACH;
  float fromFront = length(p - uRippleOrigin) - front;
  float spread = 1.0 + RIPPLE_SPREAD * uRipple;
  float width = KICK_WIDTH * spread;
  float band = fromFront > 0.0 ? exp(-(fromFront * fromFront) / (width * width)) : exp(fromFront / (WAKE_LENGTH * spread));
  return uShake * (1.0 - uRipple) * band;
}

void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  vec4 P = texelFetch(uPos, texel, 0);
  vec4 X = texelFetch(uAux, texel, 0);
  vec2 pos = P.xy; float hop = P.z;
  float settled = X.x, age = X.y, falling = X.z;
  float dt = uDelta;
  uvec2 grain = uvec2(texel);
  vec3 rnd = hash3(uvec3(grain, uFrame));
  vec3 rnd2 = hash3(uvec3(grain + uvec2(977u, 331u), uFrame * 3u + 1u));
  vec3 rnd3 = hash3(uvec3(grain + uvec2(1531u, 2117u), uFrame * 5u + 2u));
  float frameScale = sqrt(dt * REFERENCE_FPS);

  if (falling > 0.0 || !onPlate(pos)) {
    falling += dt * FALL_RATE; hop -= dt * FALL_DROP;
    if (falling >= 1.0 && rnd.z < uSprinkle * dt) {
      pos = rnd.xy * 2.0 - 1.0; hop = RESPAWN_HOP; falling = 0.0; age = 0.0; settled = 0.0;
    }
    outPos = vec4(pos, hop, P.w); outAux = vec4(settled, age, falling, 0.0); return;
  }

  float value; vec2 grad;
  fieldEval(pos, value, grad);
  float ampScale = 1.0 / max(uAmpMax, 1.0e-6);
  float under = value * ampScale;
  float amp = abs(under);
  float gammaLocal = uGamma * amp;
  float liftOff = pow(hash3(uvec3(grain, 99u)).x, LIFT_OFF_SPREAD);
  float excess = max(gammaLocal - liftOff, 0.0);
  float airborne = 1.0 - exp(-AIRBORNE_RATE * excess);
  vec2 gradAmp = sign(under) * grad * ampScale;
  float slope = length(gradAmp);
  vec2 downSlope = -gradAmp / max(slope, 1.0e-6);

  float kick = uShake > 0.0 ? kickAt(pos) : 0.0;
  float flightRate = uFlightRate * smoothstep(FLIGHT_EXCESS_MIN, FLIGHT_EXCESS_FULL, excess);
  if (rnd.z < flightRate * dt) {
    outPos = vec4(rnd2.xy * 2.0 - 1.0, RESPAWN_HOP, 0.0); outAux = vec4(0.0); return;
  }
  // strike wave: throw grains away from the strike, a few far
  if (kick > 0.0 && rnd3.x < 6.0 * kick * dt) {
    vec2 away = pos - uRippleOrigin; float L = length(away);
    vec2 radial = L > 1.0e-5 ? away / L : vec2(0.0);
    float range = min(-log(max(rnd3.z, 1.0e-7)) * 0.14, 0.4);
    pos = clamp(pos + (gaussian2(rnd2.xy) * 0.3 + radial) * range * SHAKE_THROW / 0.14, -1.0, 1.0);
    hop = max(hop, SHAKE_HOP); settled = 0.0;
  }

  float sigma = uStepScale * pow(excess, 1.5) * frameScale;
  pos += sigma * gaussian2(rnd.xy);
  float ampRest = liftOff / max(uGamma, 1.0e-6);
  float toRest = max(amp - ampRest, 0.0) / max(slope, 1.0e-6);
  pos += downSlope * min(uSlopeBias * airborne * slope * dt, BIAS_MAX_APPROACH * toRest);

  if (kick > 0.0) {
    pos += kick * SHAKE_STEP * frameScale * gaussian2(rnd2.xy);
    hop = max(hop, kick * SHAKE_HOP);
    settled = min(settled, 1.0 - CREST_LIFT * kick);
  }
  float flickerPhase = hash3(uvec3(grain, 5u)).x * TWO_PI;
  float flicker = FLICKER_BASE + FLICKER_DEPTH * sin(uTime * DRIVE_FLICKER_HZ + flickerPhase);
  float hopTarget = uHopHeight * airborne * flicker;
  hop += (hopTarget - hop) * min(1.0, dt * HOP_EASE);
  settled += ((1.0 - airborne) - settled) * min(1.0, dt * SETTLE_EASE);
  age += dt;
  outPos = vec4(pos, hop, under); outAux = vec4(settled, age, 0.0, 0.0);
}`

export const GRAIN_VERT = /* glsl */`
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uPosTex; uniform sampler2D uAuxTex;
uniform int uTexSize;
uniform vec2 uPlateHalfSize;
uniform float uGrainWorldSize, uHopScale, uProjectionScale, uReveal, uDisplace, uPhase;
uniform mat4 modelViewMatrix, projectionMatrix;
out float vSettled; out float vFade; out float vRand;
${COMMON}
const float GRAIN_REST_HEIGHT = 0.5, MAX_POINT_PX = 48.0;
void main() {
  int id = gl_VertexID;
  ivec2 texel = ivec2(id % uTexSize, id / uTexSize);
  vec4 P = texelFetch(uPosTex, texel, 0);
  vec4 X = texelFetch(uAuxTex, texel, 0);
  vRand = hash1(uint(id));
  float ride = uDisplace * P.w * cos(uPhase);
  vec3 local = vec3(P.x * uPlateHalfSize.x, P.y * uPlateHalfSize.y, uGrainWorldSize * GRAIN_REST_HEIGHT + P.z * uHopScale + ride);
  vec4 mv = modelViewMatrix * vec4(local, 1.0);
  float sizePx = uGrainWorldSize * (0.75 + 0.5 * vRand) * uProjectionScale / max(-mv.z, 0.01);
  gl_PointSize = clamp(sizePx, 1.0, MAX_POINT_PX);
  gl_Position = projectionMatrix * mv;
  vSettled = X.x;
  float sprinkleIn = smoothstep(0.0, 0.6, X.y);
  float fallOut = X.z > 0.0 ? clamp(1.0 - X.z, 0.0, 1.0) : 1.0;
  vFade = sprinkleIn * fallOut * uReveal;
}`

export const GRAIN_FRAG = /* glsl */`
precision highp float;
uniform vec3 uSandColor; uniform vec3 uLightDir; uniform float uAirborneGlow;
in float vSettled; in float vFade; in float vRand;
out vec4 fragColor;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(q, q);
  if (d2 > 1.0) discard;
  vec3 normal = vec3(q.x, -q.y, sqrt(1.0 - d2));
  float diffuse = max(dot(normal, uLightDir), 0.0);
  vec3 albedo = uSandColor * (0.92 + 0.16 * vRand);
  vec3 color = albedo * (0.38 + 0.62 * diffuse);
  color += albedo * uAirborneGlow * (1.0 - vSettled);
  float edge = smoothstep(1.0, 0.55, d2);
  float alpha = edge * vFade * mix(0.6, 0.96, vSettled);
  fragColor = vec4(color * alpha, alpha);
}`

export const PLATE_VERT = /* glsl */`
precision highp float; precision highp int;
uniform float uDisplace, uPhase;
uniform mat4 modelViewMatrix, projectionMatrix; uniform mat3 normalMatrix;
in vec3 position; in vec3 normal; in vec2 uv;
out vec2 vPlate; out vec3 vNormal; out vec3 vViewPos; out float vAmp;
${COMMON}
void main() {
  float value; vec2 grad;
  fieldEval(position.xy, value, grad);
  float scale = uDisplace / max(uAmpMax, 1.0e-6);
  float deflection = value * cos(uPhase) * scale;
  vec3 displaced = vec3(position.xy, position.z + deflection);
  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  vViewPos = mv.xyz;
  vec3 localNormal = normal.z > 0.5 ? normalize(vec3(-grad.x * cos(uPhase) * scale, -grad.y * cos(uPhase) * scale, 1.0)) : normal;
  vNormal = normalize(normalMatrix * localNormal);
  vPlate = position.xy;
  vAmp = abs(value) / max(uAmpMax, 1.0e-6);
  gl_Position = projectionMatrix * mv;
}`

export const PLATE_FRAG = /* glsl */`
precision highp float;
uniform vec3 uBaseColor, uGlowColor, uLightDir;
uniform float uGlow, uRipple, uRippleStrength, uEdge;
uniform vec2 uRippleOrigin;
in vec2 vPlate; in vec3 vNormal; in vec3 vViewPos; in float vAmp;
out vec4 fragColor;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(-vViewPos);
  vec3 lightPos = uLightDir * 4.0;
  vec3 L = normalize(lightPos - vViewPos);
  vec3 H = normalize(L + V);
  float diffuse = max(dot(N, L), 0.0);
  float spec = pow(max(dot(N, H), 0.0), 90.0) * 0.7;
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 color = uBaseColor * (0.55 + 0.45 * diffuse) + vec3(spec) * 0.35 + uBaseColor * fresnel * 0.6;
  // amplitude glow: antinodes breathe faintly (the "driving point" highlight)
  color += uGlowColor * uGlow * 1.4 * vAmp * vAmp * 0.25;
  // strike ripple ring
  float front = uRipple * 2.0;
  float d = length(vPlate - uRippleOrigin) - front;
  float ring = exp(-(d * d) / (0.14 * 0.14)) * (1.0 - uRipple) * uRippleStrength;
  color += uGlowColor * ring * 0.5;
  // rim darkening
  float rim = max(abs(vPlate.x), abs(vPlate.y));
  color *= mix(1.0, 0.82, smoothstep(0.75, 1.0, rim));
  if (uEdge > 0.5) color = uBaseColor * (0.55 + 0.5 * diffuse);
  fragColor = vec4(color, 1.0);
}`
