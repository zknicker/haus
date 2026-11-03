/**
 * The flurries behind the roofline: one full-screen triangle, and the
 * fragment shader paints a few flakes in three depths, drifting as they fall
 * and melting out before the bottom edge, so none lands on what sits below.
 * Pale white on dark grounds, blue-grey on light ones (`u_light`).
 *
 * Coordinates are CSS px, y down, origin at the canvas's top-left, whatever
 * the backing resolution (`u_scale` is backing px per CSS px). Output is
 * premultiplied alpha.
 */
export const flurriesVertexShader = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

export const flurriesFragmentShader = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_scale;
uniform vec2 u_size;
uniform float u_time;
// 0 on dark grounds, 1 on light ones.
uniform float u_light;

float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

// One depth of falling flakes: cells of cell px, falling fall px/s, flake radius r px.
float snow(vec2 p, float cell, float fall, float r, float seed, float density){
  vec2 q = vec2(p.x + sin(u_time*.21 + seed)*cell*.35, p.y - u_time*fall) / cell;
  vec2 id = floor(q); vec2 f = fract(q) - .5;
  float h = hash(id + seed*7.13);
  float on = step(1. - density, h);
  vec2 o = (vec2(hash(id + seed + 1.7), hash(id + seed + 4.1)) - .5)*.55;
  o.x += .14*sin(u_time*(.5 + h) + h*6.283);
  float d = length((f - o)*cell);
  return on * (1. - smoothstep(r*.3, r, d)) * (.6 + .4*fract(h*13.7));
}

void main(){
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_scale;
  float s = snow(p, 12., 3., mix(.8, .85, u_light), 1., .4)*mix(.5, .55, u_light)
          + snow(p, 18., 5., mix(1.1, 1.2, u_light), 2., .34)*mix(.75, .8, u_light)
          + snow(p, 27., 7.5, mix(1.5, 1.6, u_light), 3., .3);
  float a = clamp(s, 0., 1.) * (1. - smoothstep(u_size.y*.5, u_size.y, p.y)) * mix(.8, .75, u_light);
  gl_FragColor = vec4(mix(vec3(.9, .93, 1.), vec3(.58, .68, .83), u_light)*a, a);
}
`;
