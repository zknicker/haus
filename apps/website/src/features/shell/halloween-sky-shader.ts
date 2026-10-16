/**
 * The Halloween sky's shaders: one full-screen triangle, the fragment shader
 * paints everything. A dim moon partly veiled by moonlit clouds on a deep
 * indigo night that fades to transparent at the bottom and the trailing edge,
 * so it melts into whatever ground sits under it.
 *
 * Coordinates are CSS px, y down, origin at the canvas's top-left, whatever the
 * backing resolution (`u_scale` is backing px per CSS px). Output is
 * premultiplied alpha.
 */
export const skyVertexShader = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

export const skyFragmentShader = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_scale;
uniform vec2 u_size;
uniform float u_time;
// Moon centre (CSS px) and radius.
uniform vec3 u_moon;

float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3. - 2.*f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.; float a = .5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++){ v += a*noise(p); p = m*p + vec2(3.1, 1.7); a *= .5; }
  return v;
}

// Domain-warped billows. The warp itself creeps, so shapes change as they drift.
float billow(vec2 p, float layer){
  float t = u_time;
  vec2 q = vec2((p.x + t*(.05 + layer*.045)) / 40., p.y / 14.) + layer*17.3;
  vec2 w = vec2(fbm(q*.6 + vec2(0., t*.0035)), fbm(q*.6 + vec2(5.2, 1.3) - vec2(t*.003, 0.)));
  return fbm(q + 1.8*w);
}

// A bank whose billowed top edge sits near y = top; thicker below.
// x: density, y: rim light on the moon-facing side.
vec2 bank(vec2 p, float layer, float top, float depth, vec2 mc){
  vec2 ld = normalize(mc - p + 1e-4);
  float d1 = billow(p, layer) + (p.y - top)/depth - .5;
  float d2 = billow(p + ld*2.6, layer) + (p.y + ld.y*2.6 - top)/depth - .5;
  return vec2(smoothstep(-.06, .22, d1), clamp((d1 - d2)*3., 0., 1.));
}

vec3 shadeCloud(vec3 col, vec2 c, float opacity, vec2 p, vec2 mc, vec3 moonC){
  float near = exp(-length((p - mc)*vec2(.5, 1.))/24.);
  vec3 body = vec3(.074, .070, .122) + moonC*(.015 + near*(.09 + .45*c.y));
  return mix(col, body, c.x*opacity);
}

void main(){
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_scale;
  vec2 mc = u_moon.xy; float mr = u_moon.z;
  vec3 moonC = vec3(.80, .80, .86);

  // Deep indigo night, a touch lifted toward the horizon.
  float h = clamp(p.y / u_size.y, 0., 1.);
  vec3 col = mix(vec3(.034, .032, .084), vec3(.056, .050, .112), h);

  // Moon: a faint halo, then a soft, dim disc.
  float md = length(p - mc);
  float o = max(md - mr, 0.);
  col += moonC*(exp(-o/3.5)*.075 + exp(-o/16.)*.045);
  float maria = smoothstep(.45, .75, fbm((p - mc)*(2.2/mr) + 3.));
  vec3 disc = moonC*(1. - .14*maria)*(1. - .14*smoothstep(mr*.2, mr, md));
  col = mix(col, disc, (1. - smoothstep(-.9, .9, md - mr))*.40);

  // Calm ground behind the traffic lights: clouds gather toward the moon.
  float gather = smoothstep(mc.x - 120., mc.x - 40., p.x);
  // A thin veil across the moon, then the bank rising over its lower half.
  vec2 veil = bank(p, 0., mc.y - 2., 7., mc);
  veil.x *= gather*exp(-pow((p.y - mc.y)/7., 2.));
  col = shadeCloud(col, veil, .5, p, mc, moonC);
  vec2 front = bank(p, 1., mc.y + 3., 13., mc);
  front.x *= gather;
  col = shadeCloud(col, front, .9, p, mc, moonC);

  // Melt into the ground: out at the bottom, and before the trailing edge.
  float a = 1. - smoothstep(u_size.y*.42, u_size.y, p.y);
  a *= 1. - smoothstep(u_size.x - 40., u_size.x, p.x);
  a *= mix(.72, 1., smoothstep(0., mc.x, p.x));
  float dither = (hash(gl_FragCoord.xy) - .5)/255.;
  gl_FragColor = vec4(clamp(col*a + dither, 0., a), a);
}
`;
