/* Atlas — gerçek zamanlı 3B sahneler.
   Her tedavi, tek bir fragment shader içinde ışın izleme (raymarching) ile
   çizilen matematiksel bir modeldir: model dosyası yok, kütüphane yok.
   HEAD (ortak anatomi) + sahne + TAIL (ışık, malzeme, kamera) birleştirilerek derlenir. */
(function () {
  'use strict';

  var VERT = 'attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';

  var HEAD = `
precision highp float;
uniform vec2  uRes;
uniform vec2  uCenter;   // ekran merkezi (viewport yüksekliği biriminde)
uniform float uScale;
uniform float uYaw;
uniform float uPitch;
uniform vec3  uShade;    // sRGB seramik tonu
uniform vec2  uPointer;  // -1..1 — anahtar ışığı kaydırır
uniform float uBack;     // arkadan ışık / geçirgenlik
uniform float uBackX;
uniform float uAlpha;
uniform float uT;        // sahne animasyonu 0..1
uniform float uTime;

const float FL  = 1.9;
const float CAM = 4.2;

struct Mat { vec3 alb; float f0; float rough; float trans; vec3 emis; };

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 toObj(vec3 v){ v.yz = rot(uPitch) * v.yz; v.xz = rot(uYaw) * v.xz; return v; }
vec3 toView(vec3 v){ v.xz = rot(-uYaw) * v.xz; v.yz = rot(-uPitch) * v.yz; return v; }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float ez(float x){ x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
float seg(float a, float b, float x){ return ez((x - a) / (b - a)); }
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float sdRoundBox(vec3 p, vec3 b, float r){
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r){
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2){
  vec3 ba = b - a;
  float l2 = dot(ba, ba), rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1.0 / l2;
  vec3 pa = p - a;
  float y = dot(pa, ba), z = y - l2;
  vec3 xv = pa * l2 - ba * y;
  float x2 = dot(xv, xv), y2 = y * y * l2, z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
float sdTrapezoid(vec2 p, float r1, float r2, float he){
  vec2 k1 = vec2(r2, he), k2 = vec2(r2 - r1, 2.0 * he);
  p.x = abs(p.x);
  vec2 ca = vec2(p.x - min(p.x, (p.y < 0.0) ? r1 : r2), abs(p.y) - he);
  vec2 cb = p - k1 + k2 * clamp(dot(k1 - p, k2) / dot(k2, k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}
float smin(float a, float b, float k){ float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float smax(float a, float b, float k){ return -smin(-a, -b, k); }

/* ── Azı dişi ─────────────────────────────────────────────────────────── */
float bodyW(float y){
  float h = clamp((y + 0.46) / 0.80, 0.0, 1.0);
  return 1.0 - 0.24 * (1.0 - h) * (1.0 - h) - 0.09 * h * h * h;
}
float body(vec3 p, float inset){
  float w = bodyW(p.y);
  vec3 q = vec3(p.x / w, p.y + 0.28, p.z / (w * 0.96));
  q.x /= 1.0 + 0.07 * clamp(p.z, -1.0, 1.0);
  return (sdRoundBox(q, vec3(0.58, 0.66, 0.52), 0.36) + inset) * 0.72;
}
float sdSeg(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
// oklüzal oluk deseni: xz düzleminde oluk eksenine uzaklık
float fissures(vec3 p){
  vec2 q = p.xz;
  float g = sdSeg(q, vec2(-0.235, 0.035), vec2(0.0, -0.005));
  g = smin(g, sdSeg(q, vec2(0.0, -0.005), vec2(0.225, -0.035)), 0.05);
  g = smin(g, sdSeg(q, vec2(0.0, 0.0), vec2(0.02, 0.36)), 0.05);
  g = smin(g, sdSeg(q, vec2(0.0, -0.01), vec2(-0.02, -0.34)), 0.05);
  g = smin(g, sdSeg(q, vec2(-0.235, 0.035), vec2(-0.315, 0.14)) + 0.016, 0.05);
  g = smin(g, sdSeg(q, vec2(-0.235, 0.035), vec2(-0.32, -0.07)) + 0.016, 0.05);
  g = smin(g, sdSeg(q, vec2(0.225, -0.035), vec2(0.31, 0.07)) + 0.016, 0.05);
  g = smin(g, sdSeg(q, vec2(0.225, -0.035), vec2(0.30, -0.14)) + 0.016, 0.05);
  return g;
}
float molarOuter(vec3 p, float fill){
  float d = body(p, 0.0);
  d = smin(d, length(p - vec3(-0.262, 0.238,  0.218)) - 0.240, 0.20);
  d = smin(d, length(p - vec3( 0.250, 0.224,  0.226)) - 0.228, 0.20);
  d = smin(d, length(p - vec3(-0.258, 0.214, -0.218)) - 0.232, 0.20);
  d = smin(d, length(p - vec3( 0.258, 0.190, -0.204)) - 0.215, 0.20);
  float g = fissures(p);
  float top = smoothstep(0.08, 0.30, p.y);
  float depth = 1.0 - 0.85 * fill;
  d += top * depth * (0.032 * exp(-g * g / 0.0026) + 0.024 * exp(-g * g / 0.014));
  float bx = p.x - 0.02;
  d += 0.014 * exp(-bx * bx / 0.0030) * smoothstep(0.28, 0.46, p.z) * smoothstep(-0.20, 0.25, p.y);
  return d * mix(1.0, 0.62, top * exp(-g * g / 0.03));
}
float molarMargin(vec3 p){ return -0.46 + 0.20 * (p.x * p.x - 0.8 * p.z * p.z); }
float crownShell(vec3 p){
  float d = molarOuter(p, 0.0);
  float inner = smax(body(p, 0.085), p.y - 0.10, 0.12);
  d = smax(d, -inner, 0.02);
  return smax(d, molarMargin(p) - p.y, 0.014);
}
float molarRoots(vec3 p){
  vec3 q = vec3(p.x, p.y, p.z * 0.74);
  float r1 = sdRoundCone(q, vec3(-0.27, -0.72, 0.0), vec3(-0.40, -1.74, 0.02), 0.25, 0.07);
  float r2 = sdRoundCone(q, vec3( 0.27, -0.72, 0.0), vec3( 0.33, -1.66, -0.02), 0.24, 0.07);
  return smin(body(p, 0.0), min(r1, r2), 0.18);
}
float prepTooth(vec3 p){
  float stump = smax(body(p, 0.11), p.y - 0.06, 0.10);
  float base = smax(molarRoots(p), p.y - molarMargin(p) + 0.004, 0.012);
  return min(stump, base);
}

/* ── Üst santral kesici: kesici kenar aşağıda, kök yukarıda, +z = dudak yüzü ── */
float incisorCrown(vec3 p){
  p.x += 0.03 * p.y;
  float o = sdTrapezoid(p.xy, 0.33, 0.205, 0.47) - 0.09;
  o = smax(o, length(vec2(p.x, (p.y + 0.25) * 0.72)) - 0.60, 0.06);
  float lab = (length(vec3(p.x * 1.15, (p.y - 0.12) * 0.80, p.z + 1.02)) - 1.28) * 0.87;
  lab -= 0.009 * cos(p.x * 15.0) * (1.0 - smoothstep(-0.5, 0.35, p.y));
  float lng = dot(vec2(p.y + 0.56, p.z - 0.05), vec2(-0.392, -0.920));
  float d = smax(o, lab, 0.14);
  d = smax(d, lng, 0.08);
  d = smax(d, -(length(p - vec3(0.0, -0.12, -0.52)) - 0.42), 0.10);
  d = smin(d, length(p - vec3(0.0, 0.34, -0.22)) - 0.20, 0.14);
  return d;
}
float incisorRoot(vec3 p){
  return sdRoundCone(p, vec3(0.0, 0.36, -0.07), vec3(0.03, 1.48, -0.13), 0.30, 0.11);
}

/* ── Gülüş hattı: 6 ön diş + diş eti, hafif bir kavis üzerinde ─────────── */
const float ARCH = 2.6;
vec3 archSpace(vec3 g){
  vec2 c = vec2(g.x, g.z + ARCH);
  return vec3(atan(c.x, c.y) * ARCH, g.y, length(c) - ARCH);
}
float toothU(float a){ return a < 1.0 ? 0.43 : (a < 2.0 ? 1.205 : 1.94); }
float toothS(float a){ return a < 1.0 ? 1.0 : (a < 2.0 ? 0.82 : 0.90); }
float smileTooth(vec3 s, float fi, float mis, out float br){
  float a = abs(fi), sg = sign(fi), sc = toothS(a);
  vec3 q = s - vec3(sg * toothU(a), 0.56 * (1.0 - sc), 0.20 * (1.0 - sc));
  float bound = length(q) - 0.80 * sc - 0.12;
  if (bound > 0.3){ br = bound; return bound; }
  float h1 = fract(sin((fi + 3.7) * 127.1) * 43758.5453) - 0.5;
  float h2 = fract(sin((fi + 9.1) * 311.7) * 43758.5453) - 0.5;
  float h3 = fract(sin((fi + 5.3) * 74.7) * 43758.5453) - 0.5;
  q.xz = rot(h1 * 1.05 * mis) * q.xz;
  q.xy = rot(h3 * 0.34 * mis) * q.xy;
  q.z -= h2 * 0.30 * mis;
  q.y -= h3 * 0.12 * mis;
  q.x *= sg;
  float d = incisorCrown(q / sc) * sc;
  if (a > 2.0) d = smax(d, (abs(q.x) * 0.42 - (q.y + 0.585 * sc)) * 0.92, 0.07);
  vec3 b = q - vec3(0.0, 0.02 - 0.56 * (1.0 - sc), 0.262 * sc + 0.028);
  br = sdRoundBox(b, vec3(0.085, 0.075, 0.035), 0.012);
  br = max(br, -max(abs(b.y) - 0.017, 0.012 - b.z));
  return d;
}
vec2 smile(vec3 s, float mis){
  float d = 1e5, b = 1e5;
  for (int i = 0; i < 6; i++){
    float br;
    float t = smileTooth(s, float(i) - 2.5, mis, br);
    d = min(d, t); b = min(b, br);
  }
  return vec2(d, b);
}
float gumLine(float u){
  float x = abs(u);
  float c = 0.43, hw = 0.43, top = 0.47;
  if (x > 0.86){ c = 1.205; hw = 0.355; top = 0.45; }
  if (x > 1.56){ c = 1.94; hw = 0.385; top = 0.50; }
  float t = min(abs(x - c) / hw, 1.12);
  return top - 0.24 * t * t;
}
float gumD(vec3 s, float puff){
  float slab = sdRoundBox(s - vec3(0.0, 0.82, -0.15), vec3(2.95, 0.66, 0.40), 0.30) - puff;
  return smax(slab, gumLine(s.x) - puff * 1.4 - s.y, 0.06);
}
`;

  /* Sahneler: BR (sınır küresi), STEPK (adım güvenliği), map, surf, fade */
  var PORCELAIN = 'Mat(lin(uShade), 0.055, 0.0, 1.0, vec3(0.0))';

  var SCENES = {

    /* Hero: tek başına zirkonyum kaplama */
    crown: `
const float BR = 0.97;
const float STEPK = 1.0;
float map(vec3 p){ return crownShell(p); }
Mat surf(vec3 p){ return ${PORCELAIN}; }
float fade(vec3 p){ return 1.0; }
`,

    /* Zirkonyum: kaplama, hazırlanmış dişin üzerine oturur */
    zirkonyum: `
const float BR = 1.70;
const float STEPK = 0.9;
const vec3 OFF = vec3(0.0, -0.15, 0.0);
float dCrown(vec3 g){ return crownShell(g - vec3(0.0, 0.95 * (1.0 - ez(uT)), 0.0)); }
float map(vec3 p){ vec3 g = p + OFF; return min(dCrown(g), prepTooth(g)); }
Mat surf(vec3 p){
  vec3 g = p + OFF;
  if (dCrown(g) < prepTooth(g)) return ${PORCELAIN};
  float root = smoothstep(0.0, 0.05, molarMargin(g) - g.y);
  vec3 a = mix(vec3(0.88, 0.77, 0.56), vec3(0.80, 0.71, 0.57), root);
  return Mat(lin(a), 0.03, 0.75, 0.25, vec3(0.0));
}
float fade(vec3 p){ return smoothstep(-1.85, -0.95, p.y + OFF.y); }
`,

    /* Lamine: yaprak porselen dişin ön yüzüne yapışır */
    lamine: `
const float BR = 1.36;
const float STEPK = 0.85;
const vec3 OFF = vec3(0.0, 0.48, 0.0);
float dVeneer(vec3 g){
  float e = 1.0 - ez(uT);
  vec3 q = g - vec3(0.0, 0.0, 0.62 * e);
  q.xz = rot(-0.5 * e) * q.xz;
  float c = incisorCrown(q);
  float shell = abs(c - 0.024) - 0.020;
  float v = smax(shell, 0.085 - 0.04 * (q.y + 0.56) - q.z, 0.025);
  return smax(v, q.y - (0.44 - 0.9 * q.x * q.x), 0.025);
}
float dTooth(vec3 g){ return smin(incisorCrown(g), incisorRoot(g), 0.20); }
float map(vec3 p){ vec3 g = p + OFF; return min(dVeneer(g), dTooth(g)); }
Mat surf(vec3 p){
  vec3 g = p + OFF;
  if (dVeneer(g) < dTooth(g)) return Mat(lin(uShade), 0.06, 0.0, 1.0, vec3(0.0));
  float root = smoothstep(0.0, 0.06, g.y - (0.50 - 1.0 * g.x * g.x));
  vec3 a = mix(vec3(0.90, 0.83, 0.68), vec3(0.83, 0.75, 0.61), root);
  return Mat(lin(a), mix(0.04, 0.02, root), mix(0.22, 0.9, root), mix(0.7, 0.1, root), vec3(0.0));
}
float fade(vec3 p){ return 1.0 - smoothstep(1.12, 1.62, p.y + OFF.y); }
`,

    /* E-max: ışığı geçiren ön bölge kaplaması */
    emax: `
const float BR = 0.94;
const float STEPK = 0.85;
const vec3 OFF = vec3(0.0, -0.05, 0.0);
float map(vec3 p){
  vec3 g = p + OFF;
  float c = incisorCrown(g);
  float inner = smax(c + 0.08, 0.12 - g.y, 0.10);
  float d = smax(c, -inner, 0.02);
  return smax(d, g.y - (0.45 - 1.3 * g.x * g.x), 0.014);
}
Mat surf(vec3 p){ return Mat(lin(uShade), 0.05, 0.0, 1.8, vec3(0.0)); }
float fade(vec3 p){ return 1.0; }
`,

    /* İmplant: vida + dayanak + kaplama */
    implant: `
const float BR = 1.70;
const float STEPK = 0.9;
float ex(){ return 1.0 - ez(uT); }
float dImplant(vec3 g){
  float r = length(g.xz);
  float t = clamp((-0.48 - g.y) / 1.08, 0.0, 1.0);
  float R = mix(0.232, 0.150, t * t) + 0.03 * smoothstep(-0.47, -0.37, g.y);
  float a = atan(g.z, g.x) + ex() * 9.0;
  float th = abs(fract(g.y / 0.135 + a / 6.2831853) - 0.5);
  float amp = 0.17 * (1.0 - smoothstep(-0.60, -0.47, g.y));
  float d = r - (R + (0.25 - th) * amp);
  d = max(d, g.y + 0.36);
  d = smax(d, -1.56 - g.y, 0.05);
  d = max(d, -max(r - 0.105, -0.47 - g.y));
  return d * 0.55;
}
float dAbut(vec3 g){
  vec3 q = g - vec3(0.0, -0.36 + 0.40 * ex(), 0.0);
  float r = length(q.xz);
  float R = mix(0.215, 0.135, clamp(q.y / 0.42, 0.0, 1.0));
  float d = max(r - R, abs(q.y - 0.21) - 0.21);
  d = min(d, max(r - 0.258, abs(q.y - 0.02) - 0.03));
  float hx = max(abs(q.z), max(abs(q.x * 0.866 + q.z * 0.5), abs(q.x * 0.866 - q.z * 0.5))) - 0.088;
  d = min(d, max(hx, abs(q.y + 0.05) - 0.055));
  d = max(d, -max(r - 0.05, 0.30 - q.y));
  return d - 0.006;
}
float dCrown(vec3 g){ return crownShell(g - vec3(0.0, 0.10 + 0.98 * ex(), 0.0)); }
float map(vec3 p){ return min(dCrown(p), min(dAbut(p), dImplant(p))); }
Mat surf(vec3 p){
  float c = dCrown(p), a = dAbut(p), i = dImplant(p);
  if (c < a && c < i) return ${PORCELAIN};
  if (a < i) return Mat(vec3(0.34, 0.35, 0.37), 0.55, 0.16, 0.0, vec3(0.0));
  return Mat(vec3(0.22, 0.23, 0.245), 0.38, 0.42, 0.0, vec3(0.0));
}
float fade(vec3 p){ return 1.0; }
`,

    /* Kanal tedavisi: kesit — temizleme, dolum, restorasyon */
    kanal: `
const float BR = 1.36;
const float STEPK = 0.9;
const vec3 OFF = vec3(0.0, -0.62, 0.0);
float dTooth(vec3 g){ return min(molarOuter(g, 0.0), molarRoots(g)); }
float map(vec3 p){ vec3 g = p + OFF; return smax(dTooth(g), g.z - 0.02, 0.012); }
float pulp(vec3 g){
  float ch = sdRoundBox(g - vec3(0.0, -0.20, 0.0), vec3(0.30, 0.17, 0.2), 0.12);
  ch = smin(ch, length(g - vec3(-0.22, -0.02, 0.0)) - 0.07, 0.08);
  ch = smin(ch, length(g - vec3( 0.21, -0.03, 0.0)) - 0.065, 0.08);
  float c1 = sdRoundCone(g, vec3(-0.25, -0.36, 0.0), vec3(-0.385, -1.66, 0.0), 0.075, 0.022);
  float c2 = sdRoundCone(g, vec3( 0.24, -0.36, 0.0), vec3( 0.325, -1.58, 0.0), 0.070, 0.022);
  return smin(ch, min(c1, c2), 0.06);
}
Mat surf(vec3 p){
  vec3 g = p + OFF;
  float below = smoothstep(0.0, 0.05, molarMargin(g) - g.y);
  vec3 enamel = lin(uShade);
  if (g.z < 0.012){
    vec3 oc = mix(enamel, lin(vec3(0.80, 0.71, 0.57)), below);
    return Mat(oc, mix(0.045, 0.02, below), mix(0.10, 0.9, below), mix(0.8, 0.1, below), vec3(0.0));
  }
  vec3 c = vec3(g.xy, 0.0);
  float w = 0.007;
  float en = smoothstep(-0.115 - w, -0.115 + w, dTooth(c)) * (1.0 - below);
  vec3 col = mix(lin(vec3(0.88, 0.76, 0.52)), enamel, en);
  float dp = pulp(c);
  float da = sdRoundBox(c - vec3(0.0, 0.16, 0.0), vec3(0.15, 0.30, 0.2), 0.04);
  float open   = seg(0.04, 0.15, uT);
  float yClean = mix(0.12, -1.80, seg(0.13, 0.42, uT));
  float yFill  = mix(-0.30, -1.80, seg(0.50, 0.78, uT));
  float rest   = seg(0.83, 0.96, uT);
  vec3 inflamed = lin(vec3(0.78, 0.17, 0.16)) * (0.82 + 0.18 * sin(uTime * 3.2));
  vec3 empty    = vec3(0.010, 0.008, 0.007);
  vec3 gutta    = lin(vec3(0.96, 0.54, 0.34));
  vec3 filling  = lin(vec3(0.78, 0.86, 0.92));
  float inP = 1.0 - smoothstep(-w, w, dp);
  vec3 pc = mix(inflamed, empty, smoothstep(yClean - 0.03, yClean + 0.03, g.y));
  float canal = 1.0 - smoothstep(-0.37, -0.31, g.y);
  pc = mix(pc, gutta, smoothstep(yFill - 0.025, yFill + 0.025, g.y) * canal * step(0.5, uT));
  pc = mix(pc, filling, rest * (1.0 - canal));
  col = mix(col, pc, inP);
  float inA = (1.0 - smoothstep(-w, w, da)) * (1.0 - inP) * open;
  col = mix(col, mix(empty, filling, rest), inA);
  return Mat(col, 0.03, 0.6, 0.0, vec3(0.0));
}
float fade(vec3 p){ return 1.0; }
`,

    /* Bleaching: ton, ışıkla birlikte açılır */
    bleaching: `
const float BR = 2.42;
const float STEPK = 0.8;
const vec3 OFF = vec3(0.0, 0.40, -0.35);
float map(vec3 p){
  vec3 s = archSpace(p + OFF);
  return smin(smile(s, 0.0).x, gumD(s, 0.0), 0.02);
}
Mat surf(vec3 p){
  vec3 s = archSpace(p + OFF);
  if (gumD(s, 0.0) < smile(s, 0.0).x) return Mat(lin(vec3(0.88, 0.52, 0.52)), 0.04, 0.38, 0.5, vec3(0.0));
  float xf = mix(-2.7, 2.7, uT);
  float k = 1.0 - smoothstep(xf - 0.22, xf + 0.22, s.x);
  vec3 a = mix(lin(vec3(0.87, 0.77, 0.55)), lin(vec3(0.975, 0.965, 0.94)), k);
  float band = exp(-(s.x - xf) * (s.x - xf) * 22.0);
  return Mat(a, 0.05, 0.08, 0.9, vec3(0.30, 0.55, 1.0) * 0.30 * band);
}
float fade(vec3 p){
  vec3 s = archSpace(p + OFF);
  return (1.0 - smoothstep(2.25, 2.75, abs(s.x))) * (1.0 - smoothstep(0.92, 1.44, s.y));
}
`,

    /* Ortodonti: çapraşık dişler tel üzerinde hizalanır */
    ortodonti: `
const float BR = 2.42;
const float STEPK = 0.75;
const vec3 OFF = vec3(0.0, 0.40, -0.35);
float mis(){ return 1.0 - ez(uT); }
float wire(vec3 s){ return sdCapsule(s, vec3(-2.25, 0.02, 0.287), vec3(2.25, 0.02, 0.287), 0.014); }
float map(vec3 p){
  vec3 s = archSpace(p + OFF);
  vec2 t = smile(s, mis());
  float d = smin(t.x, gumD(s, 0.0), 0.02);
  return min(d, min(t.y, wire(s)));
}
Mat surf(vec3 p){
  vec3 s = archSpace(p + OFF);
  vec2 t = smile(s, mis());
  float g = gumD(s, 0.0);
  float m = min(t.y, wire(s));
  if (m < t.x && m < g) return Mat(vec3(0.40, 0.42, 0.45), 0.62, 0.14, 0.0, vec3(0.0));
  if (g < t.x) return Mat(lin(vec3(0.88, 0.52, 0.52)), 0.04, 0.38, 0.5, vec3(0.0));
  return Mat(lin(vec3(0.94, 0.90, 0.80)), 0.05, 0.08, 0.9, vec3(0.0));
}
float fade(vec3 p){
  vec3 s = archSpace(p + OFF);
  return (1.0 - smoothstep(2.30, 2.80, abs(s.x))) * (1.0 - smoothstep(0.92, 1.44, s.y));
}
`,

    /* Dişeti tedavisi: diş taşı temizlenir, diş eti sağlığına kavuşur */
    diseti: `
const float BR = 2.42;
const float STEPK = 0.8;
const vec3 OFF = vec3(0.0, 0.40, -0.35);
float puff(){ return 0.045 * (1.0 - ez(uT)); }
float map(vec3 p){
  vec3 s = archSpace(p + OFF);
  return smin(smile(s, 0.0).x, gumD(s, puff()), 0.02);
}
Mat surf(vec3 p){
  vec3 s = archSpace(p + OFF);
  float h = ez(uT);
  if (gumD(s, puff()) < smile(s, 0.0).x){
    float near = 1.0 - smoothstep(0.0, 0.42, s.y - gumLine(s.x));
    vec3 sick = mix(lin(vec3(0.80, 0.33, 0.36)), lin(vec3(0.72, 0.10, 0.14)), near);
    vec3 a = mix(sick, lin(vec3(0.90, 0.56, 0.55)), h);
    return Mat(a, 0.05, mix(0.06, 0.42, h), 0.5, vec3(0.0));
  }
  float bandW = 1.0 - smoothstep(0.03, 0.24, gumLine(s.x) - s.y);
  float n = vnoise(s.xy * 26.0) * 0.6 + vnoise(s.xy * 61.0) * 0.4;
  float tartar = bandW * smoothstep(0.22, 0.55, n + bandW * 0.55) * (1.0 - seg(0.10, 0.62, uT));
  vec3 a = mix(lin(vec3(0.93, 0.89, 0.79)), lin(vec3(0.66, 0.54, 0.26)), tartar);
  return Mat(a, 0.05, mix(0.08, 0.9, tartar), 0.9 * (1.0 - tartar), vec3(0.0));
}
float fade(vec3 p){
  vec3 s = archSpace(p + OFF);
  return (1.0 - smoothstep(2.25, 2.75, abs(s.x))) * (1.0 - smoothstep(0.92, 1.44, s.y));
}
`,

    /* Çocuk diş hekimliği: fissür örtücü olukları kapatır */
    cocuk: `
const float BR = 1.02;
const float STEPK = 0.9;
const vec3 OFF = vec3(0.0, -0.08, 0.0);
float sealed(vec3 g){ return clamp(seg(0.10, 0.92, uT) * 1.9 - length(g.xz) * 1.5, 0.0, 1.0); }
float map(vec3 p){
  vec3 g = p + OFF;
  float d = molarOuter(g, sealed(g));
  return smax(d, -0.66 - g.y, 0.03);
}
Mat surf(vec3 p){
  vec3 g = p + OFF;
  float m = (1.0 - smoothstep(0.035, 0.075, fissures(g))) * sealed(g);
  vec3 a = mix(lin(uShade), vec3(0.50, 0.74, 0.95), 0.75 * m);
  return Mat(a, mix(0.05, 0.10, m), 0.0, 1.0 - 0.6 * m, vec3(0.10, 0.30, 0.60) * 0.10 * m);
}
float fade(vec3 p){ return smoothstep(-0.52, -0.20, p.y + OFF.y); }
`
  };

  var TAIL = `
vec3 calcNormal(vec3 p){
  const vec2 e = vec2(1.0, -1.0) * 0.0011;
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}
float calcAO(vec3 p, vec3 n){
  float o = 0.0, s = 1.0;
  for (int i = 0; i < 5; i++){
    float h = 0.012 + 0.05 * float(i);
    o += (h - map(p + n * h)) * s;
    s *= 0.72;
  }
  return clamp(1.0 - 2.1 * o, 0.0, 1.0);
}
float softShadow(vec3 ro, vec3 rd){
  float res = 1.0, t = 0.03;
  for (int i = 0; i < 12; i++){
    float h = map(ro + rd * t);
    res = min(res, 9.0 * h / t);
    t += clamp(h, 0.03, 0.2);
    if (res < 0.01 || t > 1.6) break;
  }
  return clamp(res, 0.0, 1.0);
}

/* Stüdyo: büyük softbox + şerit ışık + arka kontur. Yansımaları bunlar çizer. */
float panel(vec3 d, vec3 c, vec2 s, float soft){
  float k = dot(d, c);
  vec3 u = normalize(cross(vec3(0.0, 1.0, 0.0), c));
  vec3 v = cross(c, u);
  vec2 q = abs(vec2(dot(d, u), dot(d, v)) / max(k, 0.0001));
  vec2 a = 1.0 - smoothstep(s - soft, s + soft, q);
  return a.x * a.y * step(0.0, k);
}
vec3 env(vec3 d, float rough){
  float s = rough * 0.45;
  float g = 1.0 / (1.0 + rough * 3.0);
  vec3 c = mix(vec3(0.012, 0.014, 0.013), vec3(0.11, 0.12, 0.115), smoothstep(-0.4, 1.0, d.y));
  vec3 kc = normalize(vec3(-0.62 + uPointer.x * 0.55, 0.62 + uPointer.y * 0.35, 0.48));
  c += vec3(1.0, 0.965, 0.91) * 6.0 * g * panel(d, kc, vec2(0.50, 0.30), 0.07 + s);
  c += vec3(0.80, 0.90, 1.0) * 2.8 * g * panel(d, normalize(vec3(0.88, 0.12, 0.30)), vec2(0.09, 0.85), 0.05 + s);
  c += vec3(1.0, 0.92, 0.82) * 1.8 * g * panel(d, normalize(vec3(0.15, 0.35, -0.92)), vec2(0.75, 0.22), 0.12 + s);
  return c;
}

vec3 shade(vec3 p, vec3 rd){
  vec3 n = calcNormal(p);
  vec3 v = -rd;
  Mat m = surf(p);
  float ao = calcAO(p, n);
  vec3 Lk = toObj(normalize(vec3(-0.55 + uPointer.x * 0.9, 0.80 + uPointer.y * 0.5, 0.75)));
  vec3 Lf = toObj(normalize(vec3(0.85, -0.05, 0.45)));
  vec3 Lb = toObj(normalize(vec3(0.30 + uBackX - uPointer.x * 0.4, 0.40, -0.90)));

  float dk = clamp((dot(n, Lk) + 0.22) / 1.22, 0.0, 1.0);
  float df = clamp(dot(n, Lf) * 0.5 + 0.5, 0.0, 1.0);
  float sh = softShadow(p + n * 0.012, Lk);
  vec3 col = m.alb * (vec3(1.0, 0.97, 0.92) * 1.38 * (1.0 - clamp(0.12 + 0.36 * m.trans, 0.0, 0.86) * uBack) * dk * mix(0.28, 1.0, sh)
                    + vec3(0.70, 0.80, 0.96) * 0.12 * (1.0 - 0.5 * uBack) * df
                    + vec3(0.040, 0.043, 0.040));
  // oluklar ve dip bölgeler: daha koyu, daha sıcak
  col *= mix(vec3(0.38, 0.29, 0.22), vec3(1.0), ao);

  // geçirgenlik: ışık seramiğin içinden geçer; kalın bölgeler koyu, ince bölgeler aydınlık kalır
  float th = max(0.0, -map(p + Lb * 0.05)) + max(0.0, -map(p + Lb * 0.14)) + max(0.0, -map(p + Lb * 0.27)) + max(0.0, -map(p + Lb * 0.44));
  float thin = exp(-th * 8.5);
  float nv = clamp(dot(n, v), 0.0, 1.0);
  float edge = pow(1.0 - nv, 2.0);
  col += m.trans * m.alb * (mix(vec3(1.0, 0.62, 0.30), vec3(1.0, 0.90, 0.74), thin) * (0.05 + 0.70 * uBack) * (0.08 + 0.92 * thin) * (0.45 + 0.55 * edge)
                          + vec3(1.0, 0.93, 0.85) * (0.20 + 0.9 * uBack) * pow(clamp(dot(n, Lb), 0.0, 1.0), 2.0)
                          + vec3(0.55, 0.72, 1.0) * 0.04 * thin * dk);

  // sır / cila tabakası
  float F = m.f0 + (1.0 - m.f0) * pow(1.0 - nv, 5.0);
  vec3 rv = toView(reflect(rd, n));
  col = col * (1.0 - F) + env(rv, m.rough) * F * mix(0.25, 1.0, ao);
  return col + m.emis;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y - uCenter;
  vec2 q = uv / uScale;
  float r2 = dot(q, q) / (BR * BR);
  vec3 tint = mix(vec3(1.0), uShade, 0.6) * vec3(1.0, 0.95, 0.88);
  float halo = exp(-r2 * 6.5) * (0.050 + 0.20 * uBack) + exp(-r2 * 1.5) * 0.020;
  vec4 outc = vec4(tint * halo, halo * 0.35);

  vec3 ro = toObj(vec3(0.0, 0.0, CAM));
  vec3 rd = toObj(normalize(vec3(q, -FL)));
  float b = dot(ro, rd);
  float disc = b * b - (dot(ro, ro) - BR * BR);
  if (disc > 0.0){
    float sq = sqrt(disc);
    float t = max(-b - sq, 0.0);
    float tFar = -b + sq;
    float m = 1e9, tm = t;
    bool hit = false;
    for (int i = 0; i < 96; i++){
      float d = map(ro + rd * t);
      float a = d / t;
      if (a < m){ m = a; tm = t; }
      if (d < 0.0006 * t){ hit = true; break; }
      t += d * STEPK;
      if (t > tFar) break;
    }
    if (!hit && t <= tFar) hit = true;
    float pix = 1.0 / (uRes.y * uScale * FL);
    float cov = hit ? 1.0 : 1.0 - smoothstep(0.0, 1.6 * pix, m);
    vec3 hp = ro + rd * (hit ? t : tm);
    cov *= fade(hp);
    if (cov > 0.002){
      vec3 col = shade(hp, rd);
      col = col * (2.51 * col + 0.03) / (col * (2.43 * col + 0.59) + 0.14);
      col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
      outc = vec4(mix(outc.rgb, col, cov), mix(outc.a, 1.0, cov));
    }
  }
  outc.rgb += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = outc * uAlpha;
}
`;

  var UNIFORMS = ['uRes', 'uCenter', 'uScale', 'uYaw', 'uPitch', 'uShade', 'uPointer', 'uBack', 'uBackX', 'uAlpha', 'uT', 'uTime'];

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(log);
    }
    return s;
  }

  function create(canvas) {
    var gl = null;
    try {
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'high-performance' });
    } catch (e) { gl = null; }
    if (!gl) return null;

    var vert;
    try { vert = compile(gl, gl.VERTEX_SHADER, VERT); } catch (e) { return null; }

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    var programs = {};   // name → { prog, U } | false
    var current = null;
    var quality = 1;
    var cssW = 0, cssH = 0;

    function build(name) {
      if (name in programs) return programs[name];
      var entry = false;
      try {
        var prog = gl.createProgram();
        gl.attachShader(prog, vert);
        gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, HEAD + SCENES[name] + TAIL));
        gl.bindAttribLocation(prog, 0, 'aPos');
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        var U = {};
        UNIFORMS.forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
        entry = { prog: prog, U: U };
      } catch (err) {
        if (window.console) console.warn('[atlas] sahne derlenemedi: ' + name, err);
      }
      programs[name] = entry;
      return entry;
    }

    function use(name) {
      var e = build(name);
      if (!e) return false;
      current = e;
      gl.useProgram(e.prog);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      return true;
    }

    function resize() {
      cssW = canvas.clientWidth; cssH = canvas.clientHeight;
      var cap = cssW < 760 ? 1.5 : 1.75;
      var dpr = Math.min(window.devicePixelRatio || 1, cap) * quality;
      var w = Math.max(2, Math.round(cssW * dpr)), h = Math.max(2, Math.round(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function render(s) {
      if (!current) return;
      if (canvas.clientWidth !== cssW || canvas.clientHeight !== cssH) resize();
      var U = current.U;
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform2f(U.uCenter, s.cx || 0, s.cy || 0);
      gl.uniform1f(U.uScale, s.scale);
      gl.uniform1f(U.uYaw, s.yaw);
      gl.uniform1f(U.uPitch, s.pitch);
      gl.uniform3f(U.uShade, s.shade[0], s.shade[1], s.shade[2]);
      gl.uniform2f(U.uPointer, s.px || 0, s.py || 0);
      gl.uniform1f(U.uBack, s.back || 0);
      gl.uniform1f(U.uBackX, s.backX || 0);
      gl.uniform1f(U.uAlpha, s.alpha == null ? 1 : s.alpha);
      gl.uniform1f(U.uT, s.t || 0);
      gl.uniform1f(U.uTime, s.time || 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); current = null; programs = {}; });

    resize();
    return {
      use: use,
      render: render,
      resize: resize,
      setQuality: function (q) { if (q !== quality) { quality = q; resize(); } },
      getQuality: function () { return quality; }
    };
  }

  window.AtlasScene = { create: create, names: Object.keys(SCENES) };
})();
