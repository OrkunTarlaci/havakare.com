// ==========================================================================
// HAVAKARE — droneProps.js
//
// dji_mini_3_pro.glb ships as 8 merged meshes with NO animation and NO
// separate propeller nodes: the 4 propellers (blades + spinner/hub caps)
// are loose triangles fused into the big "waike" / "jinshu" / "black-paint"
// meshes. To make the propellers spin without touching the file, this module
// splits those triangles out at load time:
//
//   1. Per mesh, triangles are grouped into connected pieces (vertices
//      welded by position, then union-find).
//   2. A piece belongs to a rotor if it sits within PROP_RADIUS of that
//      rotor's hub axis and is either a hub part (very close to the axis) or
//      a small blade piece. Arm covers (big pieces, ~460-500 triangles, near
//      the hub too) are deliberately left static, as are the stator coil
//      ("xianquan") and the underside LED ("deng").
//   3. For every rotor a pivot Group (named PROP_xx, positioned exactly on the
//      hub axis) gets one child Mesh per source mesh. Those child meshes
//      SHARE the original vertex buffers and only carry their own index
//      buffer, so no vertex data is duplicated. The source mesh keeps only
//      the remaining (static) triangles.
//
// Visually nothing changes at rest — every triangle still renders exactly
// where it was — the pivots just get rotation.y advanced every frame.
//
// The hub coordinates below were measured from this exact GLB (model space,
// before droneModel.js normalizes it). If the model is ever swapped, they
// (and PROP_MATERIALS) have to be re-measured.
// ==========================================================================

import * as THREE from 'three';

// Rotor hubs in the GLB's own space. dir = spin direction (+1 = counter-
// clockwise seen from above). Diagonal rotors share a direction, like a
// real quadcopter.
export const PROP_HUBS_MINI3 = [
  { name: 'FL', x: -0.1216, y: 0.0237, z: 0.0387, dir: -1 },
  { name: 'FR', x: 0.1206, y: 0.0237, z: 0.0387, dir: 1 },
  { name: 'RL', x: -0.0871, y: 0.0509, z: -0.1222, dir: 1 },
  { name: 'RR', x: 0.0861, y: 0.0509, z: -0.1222, dir: -1 },
];

const PROP_MATERIALS = new Set(['waike', 'jinshu', 'black-paint']);
const PROP_RADIUS = 0.055; // max horizontal distance (piece centre -> hub axis)
const HUB_RADIUS = 0.02; // pieces closer than this are always hub parts
const BLADE_MAX_TRIS = 150; // pieces farther out than HUB_RADIUS must be this small (blades, not arm covers)

// Radians per second. Fast enough to read as a spinning rotor, slow enough
// not to alias into a "backwards" wagon-wheel at 60 fps.
export const PROP_SPIN_RAD_PER_SEC = 38;

export function isPropPivot(node) {
  return node && node.userData && node.userData.isPropPivot === true;
}

/**
 * Splits the propeller triangles of `root` (the freshly loaded glTF scene)
 * into spinning pivot groups. Mutates `root`. Returns the pivots.
 */
export function splitPropellers(root, hubs = PROP_HUBS_MINI3) {
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();

  const pivots = hubs.map((h) => {
    const g = new THREE.Group();
    g.name = 'PROP_' + h.name;
    g.position.set(h.x, h.y, h.z);
    g.userData.isPropPivot = true;
    g.userData.propDir = h.dir;
    return g;
  });

  const sources = [];
  root.traverse((o) => {
    if (o.isMesh && o.geometry && o.geometry.attributes.position && o.material && PROP_MATERIALS.has(o.material.name)) {
      sources.push(o);
    }
  });

  const v = new THREE.Vector3();

  for (const mesh of sources) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const n = pos.count;
    const idxAttr = geo.index;
    const triCount = (idxAttr ? idxAttr.count : n) / 3;
    const vertOf = idxAttr ? (i) => idxAttr.getX(i) : (i) => i;

    // -- weld vertices that share a position, then union triangle corners --
    const weld = new Map();
    const rep = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const key = pos.getX(i) + ',' + pos.getY(i) + ',' + pos.getZ(i);
      const hit = weld.get(key);
      if (hit === undefined) { weld.set(key, i); rep[i] = i; } else rep[i] = hit;
    }
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (x) => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    };
    for (let t = 0; t < triCount; t++) {
      const a = rep[vertOf(t * 3)], b = rep[vertOf(t * 3 + 1)], c = rep[vertOf(t * 3 + 2)];
      const ra = find(a);
      parent[find(b)] = ra;
      parent[find(c)] = find(ra);
    }

    // -- per piece: triangle count + bounding box in root space --
    const toRoot = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld);
    const pieces = new Map();
    const triRoot = new Int32Array(triCount);
    for (let t = 0; t < triCount; t++) {
      const r = find(rep[vertOf(t * 3)]);
      triRoot[t] = r;
      let p = pieces.get(r);
      if (!p) { p = { tris: 0, box: new THREE.Box3() }; pieces.set(r, p); }
      p.tris++;
      for (let k = 0; k < 3; k++) {
        const i = vertOf(t * 3 + k);
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(toRoot);
        p.box.expandByPoint(v);
      }
    }

    // -- classify each piece: which rotor (or -1 = static)? --
    const owner = new Map();
    const c = new THREE.Vector3();
    for (const [r, p] of pieces) {
      p.box.getCenter(c);
      let best = -1, bestD = Infinity;
      for (let h = 0; h < hubs.length; h++) {
        const d = Math.hypot(c.x - hubs[h].x, c.z - hubs[h].z);
        if (d < bestD) { bestD = d; best = h; }
      }
      const isProp = bestD < PROP_RADIUS && (bestD < HUB_RADIUS || p.tris < BLADE_MAX_TRIS);
      owner.set(r, isProp ? best : -1);
    }

    // -- split the index buffer --
    const buckets = hubs.map(() => []);
    const rest = [];
    for (let t = 0; t < triCount; t++) {
      const h = owner.get(triRoot[t]);
      const dst = h >= 0 ? buckets[h] : rest;
      dst.push(vertOf(t * 3), vertOf(t * 3 + 1), vertOf(t * 3 + 2));
    }
    if (buckets.every((b) => b.length === 0)) continue;

    const IndexArray = n > 65535 ? Uint32Array : Uint16Array;

    buckets.forEach((tris, h) => {
      if (!tris.length) return;
      const g = new THREE.BufferGeometry();
      for (const name of Object.keys(geo.attributes)) g.setAttribute(name, geo.attributes[name]);
      g.setIndex(new THREE.BufferAttribute(new IndexArray(tris), 1));

      // Tight bounds from just the vertices this rotor uses (in attribute
      // space, same as computeBoundingBox) — the default would cover the
      // whole shared buffer.
      const box = new THREE.Box3();
      for (let i = 0; i < tris.length; i++) {
        box.expandByPoint(v.set(pos.getX(tris[i]), pos.getY(tris[i]), pos.getZ(tris[i])));
      }
      g.boundingBox = box;
      g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());

      const child = new THREE.Mesh(g, mesh.material);
      child.name = mesh.name + '_prop_' + hubs[h].name;
      child.castShadow = mesh.castShadow;
      child.receiveShadow = mesh.receiveShadow;
      // child local = T(-hub) * (mesh -> root), so it lands at the same
      // root-space place it had before while the pivot sits on the hub axis.
      const local = new THREE.Matrix4()
        .makeTranslation(-hubs[h].x, -hubs[h].y, -hubs[h].z)
        .multiply(toRoot);
      local.decompose(child.position, child.quaternion, child.scale);
      pivots[h].add(child);
    });

    // Original mesh keeps only the static triangles. Its bounding volumes
    // (whole buffer) stay as they were, so overall model bounds don't move.
    if (!geo.boundingBox) geo.computeBoundingBox();
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    geo.setIndex(new THREE.BufferAttribute(new IndexArray(rest), 1));
  }

  pivots.forEach((p) => { if (p.children.length) root.add(p); });
  return pivots;
}

/**
 * Returns a function that spins every propeller pivot found under `root`
 * (a cloned rig). Call it once per rendered frame; it measures its own
 * delta time (clamped, so a tab coming back from the background doesn't
 * produce a giant jump).
 */
export function createPropAnimator(root) {
  const pivots = [];
  root.traverse((n) => { if (isPropPivot(n)) pivots.push(n); });
  if (!pivots.length) return null;

  let last = performance.now();
  return function animateProps() {
    const now = performance.now();
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
    last = now;
    for (let i = 0; i < pivots.length; i++) {
      pivots[i].rotation.y += pivots[i].userData.propDir * PROP_SPIN_RAD_PER_SEC * dt;
    }
  };
}

/**
 * GLB'nin içinde hazır pervane animasyonu varsa (dji_mavic_3.glb -> "SpinProps",
 * Prop_FL/FR/RL/RR düğümleri) onu AnimationMixer ile oynatır. Hız, Mini 3 Pro
 * pervaneleriyle aynı olacak şekilde PROP_SPIN_RAD_PER_SEC'e göre ölçeklenir.
 * Hedef düğümler isPropPivot ile işaretlenir; böylece holdPropsAtRest kamera
 * ölçümlerinde bunları duruş pozunda tutar.
 */
export function createClipPropAnimator(root, clips, clipRevolutionSec = 0.5) {
  const mixer = new THREE.AnimationMixer(root);
  clips.forEach((clip) => {
    clip.tracks.forEach((t) => {
      const node = root.getObjectByName(t.name.split('.')[0]);
      if (node) node.userData.isPropPivot = true;
    });
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
  });
  // Klip 0.5 sn'de tam tur atıyor (2π / 0.5 rad/s); Mini 3 Pro hızına eşitle.
  mixer.timeScale = PROP_SPIN_RAD_PER_SEC / ((Math.PI * 2) / clipRevolutionSec);

  let last = performance.now();
  return function animateProps() {
    const now = performance.now();
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
    last = now;
    mixer.update(dt);
  };
}

/**
 * Temporarily puts all propeller pivots back to rotation 0 so bounding-box
 * measurements (camera fit, mobile layout) always see the same pose as
 * before the props started spinning. Returns a restore function.
 */
export function holdPropsAtRest(root) {
  const saved = [];
  root.traverse((n) => {
    if (isPropPivot(n)) { saved.push([n, n.rotation.y]); n.rotation.y = 0; }
  });
  if (saved.length) root.updateMatrixWorld(true);
  return () => {
    saved.forEach(([n, y]) => { n.rotation.y = y; });
    if (saved.length) root.updateMatrixWorld(true);
  };
}
