import * as THREE from 'three';

// Clay bodies: colour at each point of the process (sRGB).
export const BODIES = {
  terracotta: {
    name: 'Terracotta', ko: '테라코타', note: 'Earthenware, iron-red. Fires to 1060°C.',
    wet: '#6e3a26', dry: '#c08a6c', fired: '#c0603a', speckle: 0.0, grog: 0.6,
  },
  stoneware: {
    name: 'Speckled stoneware', ko: '석기토', note: 'Buff body with iron speckle. Fires to 1240°C.',
    wet: '#6f675c', dry: '#c7c0b3', fired: '#d6c7ad', speckle: 1.0, grog: 1.0,
  },
  porcelain: {
    name: 'Porcelain', ko: '백자토', note: 'Fine, white, unforgiving. Fires to 1280°C.',
    wet: '#9c9a93', dry: '#e4e1d9', fired: '#f2f0ea', speckle: 0.0, grog: 0.15,
  },
};

// Glazes: raw (as dipped, powdery) and fired appearance.
export const GLAZES = {
  celadon: {
    name: 'Celadon', ko: '청자유', raw: '#d9d8d0', base: '#93b8a3', pool: '#4f7f6b', brk: '#c5d9cb', rough: 0.07, clarity: 0.55,
  },
  tenmoku: {
    name: 'Tenmoku', ko: '천목유', raw: '#b8a797', base: '#22150f', pool: '#0c0806', brk: '#9a5326', rough: 0.05, clarity: 0.0,
  },
  shino: {
    name: 'Shino', ko: '시노유', raw: '#efe9df', base: '#ece2d3', pool: '#f6f1ea', brk: '#cc7a45', rough: 0.32, clarity: 0.1,
  },
  cobalt: {
    name: 'Cobalt', ko: '코발트', raw: '#cfc8d6', base: '#1d3a8f', pool: '#0f1f5e', brk: '#5d7fd1', rough: 0.06, clarity: 0.2,
  },
  jun: {
    name: 'Jun blue', ko: '균요유', raw: '#dcdcd6', base: '#9db1cf', pool: '#6b7fae', brk: '#c98a7a', rough: 0.12, clarity: 0.05,
  },
};

const NOISE = /* glsl */`
vec3 kmod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 kmod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 kperm(vec4 x){return kmod289(((x*34.)+1.)*x);}
vec4 ktis(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=kmod289(i);
  vec4 p=kperm(kperm(kperm(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=ktis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
vec3 bumpN(vec3 pos, vec3 n, float h, float faceDir){
  vec3 sx=dFdx(pos), sy=dFdy(pos);
  vec3 r1=cross(sy,n), r2=cross(n,sx);
  float det=dot(sx,r1)*faceDir;
  vec2 dh=vec2(dFdx(h),dFdy(h));
  vec3 g=sign(det)*(dh.x*r1+dh.y*r2);
  return normalize(abs(det)*n-g);
}
`;

export function createClayMaterial() {
  const u = {
    uWet: { value: 1 },          // 1 freshly thrown → 0 bone dry
    uFired: { value: 0 },        // bisque has happened
    uHeat: { value: 0 },         // glow inside the kiln
    uTime: { value: 0 },
    uBodyWet: { value: new THREE.Color() },
    uBodyDry: { value: new THREE.Color() },
    uBodyFired: { value: new THREE.Color() },
    uSpeckle: { value: 0 },
    uGrog: { value: 0.5 },
    uGlazeLine: { value: 9 },    // local y; glaze covers above it
    uDrip: { value: 0.12 },
    uGlazeMelt: { value: 0 },    // 0 raw powder → 1 fired glass
    uGlazeRaw: { value: new THREE.Color() },
    uGlazeBase: { value: new THREE.Color() },
    uGlazePool: { value: new THREE.Color() },
    uGlazeBreak: { value: new THREE.Color() },
    uGlazeRough: { value: 0.1 },
    uGlazeClarity: { value: 0 },
    uSeed: { value: 0.3 },
    uTop: { value: 1 },
  };

  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.9, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.12,
  });
  mat.userData.uniforms = u;

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vLocal; varying vec3 vObjN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLocal = position; vObjN = normal;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vLocal; varying vec3 vObjN;
        uniform float uWet, uFired, uHeat, uTime, uSpeckle, uGrog, uGlazeLine, uDrip, uGlazeMelt, uGlazeRough, uGlazeClarity, uSeed, uTop;
        uniform vec3 uBodyWet, uBodyDry, uBodyFired, uGlazeRaw, uGlazeBase, uGlazePool, uGlazeBreak;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 P = vLocal;
        // body
        float dry = 1.0 - uWet;
        float mottle = snoise(P * 2.6) * 0.5 + snoise(P * 7.0) * 0.25;
        vec3 body = mix(uBodyWet, uBodyDry, smoothstep(0.0, 1.0, dry + mottle * 0.18 * (1.0 - abs(dry * 2.0 - 1.0))));
        body = mix(body, uBodyFired, uFired);
        body *= 1.0 + mottle * 0.05;
        float spk = smoothstep(0.74, 0.8, snoise(P * 38.0 + 11.0)) * uSpeckle;
        float spk2 = smoothstep(0.86, 0.9, snoise(P * 90.0 - 4.0)) * uSpeckle;
        vec3 iron = vec3(0.16, 0.09, 0.06);
        body = mix(body, iron, clamp(spk * 0.8 + spk2 * 0.45, 0.0, 1.0) * (0.2 + 0.8 * max(dry, uFired)));

        // glaze, dipped from the top with runs below the line
        float run = pow(max(0.0, snoise(vec3(P.x * 7.0, 0.0, uSeed))), 2.0) * 0.6
                  + pow(max(0.0, snoise(vec3(P.x * 19.0, 3.1, uSeed))), 3.0) * 0.5;
        float edgeY = uGlazeLine - run * uDrip;
        float wob = snoise(P * 30.0) * 0.006;
        float gz = smoothstep(edgeY - 0.004, edgeY + 0.004, P.y + wob);
        float bead = gz * (1.0 - smoothstep(edgeY, edgeY + 0.05 + uDrip * 0.1, P.y + wob));
        float side = 1.0 - abs(normalize(vObjN).z);
        float thin = clamp(side * 0.9 + snoise(P * 11.0) * 0.25, 0.0, 1.0);
        vec3 glass = mix(uGlazeBase, uGlazePool, clamp(bead * 1.3 + (1.0 - thin) * 0.25 + snoise(P * 4.0 + 2.0) * 0.15, 0.0, 1.0));
        glass = mix(glass, uGlazeBreak, smoothstep(0.35, 0.95, thin) * 0.85);
        glass = mix(glass, glass * body * 1.7, uGlazeClarity * (1.0 - bead));
        glass += spk * uSpeckle * -0.15 * uGlazeMelt;
        float powder = snoise(P * 160.0) * 0.04;
        vec3 rawG = uGlazeRaw * (1.0 + powder) * (1.0 - bead * 0.08);
        vec3 glazeCol = mix(rawG, glass, uGlazeMelt);
        diffuseColor.rgb = mix(body, glazeCol, gz);
        float kWet = uWet * (1.0 - gz);
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float clayR = mix(0.96, 0.7, uWet * uWet);
        clayR = mix(clayR, 0.9, uFired * 0.5);
        float glazeR = mix(1.0, uGlazeRough, uGlazeMelt);
        roughnessFactor = mix(clayR, glazeR, gz);
      `)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float hgt = snoise(P * 12.0) * 0.6 + snoise(P * 34.0) * 0.22 * uGrog + snoise(P * 95.0) * 0.06 * uGrog * (0.4 + 0.6 * dry);
        hgt += spk * 0.35;
        float bumpAmt = 0.0026 * (1.0 - gz * mix(0.55, 0.92, uGlazeMelt));
        normal = bumpN(-vViewPosition, normal, hgt * bumpAmt, faceDirection);
      `)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float flick = 0.85 + 0.15 * snoise(vec3(P.xy * 2.0, uTime * 0.8));
        vec3 hot = mix(vec3(0.9, 0.16, 0.03), vec3(1.0, 0.62, 0.3), uHeat * uHeat);
        float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        totalEmissiveRadiance += hot * pow(uHeat, 1.6) * (0.7 + 1.1 * facing) * flick;
        diffuseColor.rgb *= 1.0 - uHeat * 0.6;
      `)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.clearcoat = clearcoat * max(gz * uGlazeMelt * (1.0 - uGlazeRough * 1.6), kWet * 0.06);
      `);
  };
  return mat;
}

export function setBody(mat, key) {
  const b = BODIES[key], u = mat.userData.uniforms;
  u.uBodyWet.value.set(b.wet);
  u.uBodyDry.value.set(b.dry);
  u.uBodyFired.value.set(b.fired);
  u.uSpeckle.value = b.speckle;
  u.uGrog.value = b.grog;
}

export function setGlaze(mat, key) {
  const g = GLAZES[key], u = mat.userData.uniforms;
  u.uGlazeRaw.value.set(g.raw);
  u.uGlazeBase.value.set(g.base);
  u.uGlazePool.value.set(g.pool);
  u.uGlazeBreak.value.set(g.brk);
  u.uGlazeRough.value = g.rough;
  u.uGlazeClarity.value = g.clarity;
}
