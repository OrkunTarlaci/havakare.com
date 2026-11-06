// ==========================================================================
// HAVAKARE — droneBuilds.js
// Envanterdeki FPV Aksiyon Dronu ve Avata 360 için GLB dosyası yok. Bu iki dron
// kodla (three.js geometrileriyle) kurulur: indirme yok, dosya boyutu birkaç KB.
// Biçimleri images/fpv-aksiyon-drone.jpg ve images/avata-360.webp fotoğraflarına
// göre verildi. Ölçü birimi serbest; normalize() en büyük boyutu GLB'lerle aynı
// değere (1.6) getirir. Burun +Z yönündedir (droneModel.js ile aynı).
//
// Pervaneler droneProps.js'in pivot sözleşmesini kullanır (userData.isPropPivot +
// propDir), yani createPropAnimator ile Mini 3 Pro'yla aynı hızda döner.
// ==========================================================================

import * as THREE from 'three';
import { createPropAnimator } from './droneProps.js';

const NORMALIZED_SIZE = 1.6;

const std = (color, roughness, metalness = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

// Karbon fiber örgüsü: küçük tekrarlı doku, plakalara gerçek malzeme hissi verir.
function carbonTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#17171a';
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#2a2a2f' : '#1d1d21';
      g.fillRect(x * 8 + 1, y * 8 + 1, 6, 6);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Tek kanat: kökte dar, ~%40'ta en geniş, uca doğru incelen profil. +X yönüne uzanır. */
function bladeGeometry(radius, chord) {
  const s = new THREE.Shape();
  s.moveTo(0, -chord * 0.16);
  s.bezierCurveTo(radius * 0.3, -chord * 0.62, radius * 0.72, -chord * 0.5, radius, -chord * 0.06);
  s.bezierCurveTo(radius * 0.9, chord * 0.2, radius * 0.4, chord * 0.34, 0, chord * 0.16);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false, curveSegments: 10 });
  g.rotateX(Math.PI / 2); // profil XZ düzlemine yatar
  return g;
}

/** `blades` kanatlı pervane pivotu. dir: +1 saat yönü tersi (droneProps.js ile aynı). */
function propeller({ radius, chord, blades, material, hubMaterial, dir }) {
  const pivot = new THREE.Group();
  pivot.userData.isPropPivot = true;
  pivot.userData.propDir = dir;
  const geo = bladeGeometry(radius, chord);
  for (let i = 0; i < blades; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i / blades) * Math.PI * 2;
    const blade = new THREE.Mesh(geo, material);
    blade.rotation.x = 0.2 * dir; // kanat hücum açısı
    arm.add(blade);
    pivot.add(arm);
  }
  pivot.add(mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.03, 16), hubMaterial));
  return pivot;
}

/** Ortalar, en büyük boyutu NORMALIZED_SIZE yapar; GLB rig'leriyle aynı biçimde döner. */
function normalize(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  const group = new THREE.Group();
  group.add(root);
  group.scale.setScalar(NORMALIZED_SIZE / Math.max(size.x, size.y, size.z));
  return { orientationGroup: group, animateProps: createPropAnimator(group) };
}

// --------------------------------------------------------------------------
// FPV: gerçek X şasi, ince uzun karbon gövde, öne eğik kamera kafesi, arkada iki
// anten, turkuaz halkalı motorlar, yarı saydam füme 3 kanatlı pervaneler.
// --------------------------------------------------------------------------
export function buildFpvDrone() {
  const root = new THREE.Group();
  const carbon = std(0xffffff, 0.42, 0.25, { map: carbonTexture() });
  const black = std(0x101012, 0.5, 0.3);
  const rubber = std(0x18181a, 0.85);
  const alu = std(0x2c2c30, 0.35, 0.8);
  const teal = std(0x2fa7b5, 0.35, 0.6);
  const glass = std(0x0d1a22, 0.08, 0.9);
  const propMat = std(0x5a5e60, 0.3, 0.1, { transparent: true, opacity: 0.68, side: THREE.DoubleSide });

  // Kollar: gövdeden motora incelen karbon plakalar (X düzeni)
  const armLen = 0.74;
  const armShape = new THREE.Shape();
  armShape.moveTo(0, -0.05);
  armShape.lineTo(armLen - 0.05, -0.034);
  armShape.quadraticCurveTo(armLen + 0.03, 0, armLen - 0.05, 0.034);
  armShape.lineTo(0, 0.05);
  armShape.closePath();
  const armGeo = new THREE.ExtrudeGeometry(armShape, { depth: 0.022, bevelEnabled: false, curveSegments: 8 });
  armGeo.rotateX(Math.PI / 2);

  const corners = [
    { x: 1, z: 1, dir: -1 },
    { x: -1, z: 1, dir: 1 },
    { x: 1, z: -1, dir: 1 },
    { x: -1, z: -1, dir: -1 },
  ];
  corners.forEach(({ x, z, dir }) => {
    const ang = Math.atan2(z, x);
    const arm = new THREE.Mesh(armGeo, carbon);
    arm.rotation.y = -ang;
    arm.position.y = 0.011;
    root.add(arm);

    const mx = Math.cos(ang) * armLen;
    const mz = Math.sin(ang) * armLen;
    root.add(mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.022, 24), alu, mx, 0.022, mz)); // taban
    root.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 24), teal, mx, 0.04, mz)); // halka
    root.add(mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.05, 24), black, mx, 0.07, mz)); // çan
    root.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), rubber, mx, -0.03, mz)); // alt takoz

    const prop = propeller({ radius: 0.42, chord: 0.15, blades: 3, material: propMat, hubMaterial: alu, dir });
    prop.position.set(mx, 0.108, mz);
    root.add(prop);
  });

  // Üst ve alt plaka: içinde hafifletme delikleri olan uzun gövde
  const plate = new THREE.Shape();
  const pw = 0.13;
  const pl = 0.4;
  plate.moveTo(-pw, -pl);
  plate.lineTo(pw, -pl);
  plate.lineTo(pw, pl);
  plate.lineTo(-pw, pl);
  plate.closePath();
  [-0.2, 0, 0.2].forEach((cy) => {
    const hole = new THREE.Path();
    hole.moveTo(-0.06, cy - 0.06);
    hole.lineTo(0.06, cy - 0.06);
    hole.lineTo(0.06, cy + 0.06);
    hole.lineTo(-0.06, cy + 0.06);
    hole.closePath();
    plate.holes.push(hole);
  });
  const plateGeo = new THREE.ExtrudeGeometry(plate, { depth: 0.016, bevelEnabled: false });
  plateGeo.rotateX(Math.PI / 2);
  root.add(mesh(plateGeo, carbon, 0, 0.03, 0));
  root.add(mesh(plateGeo, carbon, 0, 0.15, 0));

  // Aradaki elektronik yığını ve ayaklar
  root.add(mesh(new THREE.BoxGeometry(0.17, 0.08, 0.3), black, 0, 0.085, -0.04));
  [[-0.11, -0.36], [0.11, -0.36], [-0.11, 0.1], [0.11, 0.1]].forEach(([x, z]) => {
    root.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 10), alu, x, 0.085, z));
  });

  // Kamera kafesi: öne ve yukarı eğik
  const cam = new THREE.Group();
  cam.position.set(0, 0.09, 0.4);
  cam.rotation.x = -0.42;
  cam.add(mesh(new THREE.BoxGeometry(0.15, 0.13, 0.13), black));
  cam.add(mesh(new THREE.BoxGeometry(0.018, 0.17, 0.17), rubber, -0.09, 0, 0));
  cam.add(mesh(new THREE.BoxGeometry(0.018, 0.17, 0.17), rubber, 0.09, 0, 0));
  const barrel = mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.06, 28), alu, 0, 0, 0.09);
  barrel.rotation.x = Math.PI / 2;
  cam.add(barrel);
  const lens = mesh(new THREE.SphereGeometry(0.042, 24, 16), glass, 0, 0, 0.105);
  lens.scale.z = 0.5;
  cam.add(lens);
  root.add(cam);

  // Arkada iki anten
  [-0.05, 0.05].forEach((x) => {
    const ant = new THREE.Group();
    ant.position.set(x, 0.15, -0.36);
    ant.rotation.set(-0.5, 0, x > 0 ? -0.3 : 0.3);
    ant.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.16, 8), rubber, 0, 0.08, 0));
    ant.add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.075, 14), rubber, 0, 0.19, 0));
    root.add(ant);
  });

  return normalize(root);
}

// --------------------------------------------------------------------------
// Avata: gri kapsül gövde, iki yanda birbirine değen kanal halkaları, içlerinde
// korunaklı pervaneler, siyah burun ve yeşil yansımalı büyük kamera lensi.
// --------------------------------------------------------------------------
export function buildAvataDrone() {
  const root = new THREE.Group();
  const shell = std(0x8f908d, 0.5, 0.08);
  const duct = std(0xa9aaa6, 0.46, 0.05);
  const dark = std(0x18181a, 0.45, 0.2);
  const mid = std(0x3c3d3e, 0.55, 0.2);
  const ringMetal = std(0x55585a, 0.3, 0.8);
  const glass = std(0x123a2c, 0.06, 0.95);
  const propMat = std(0x222224, 0.4, 0.1, { side: THREE.DoubleSide });

  // Gövde: yassı kapsül
  const body = mesh(new THREE.CapsuleGeometry(0.17, 0.44, 8, 24), shell);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1.12, 1, 0.9);
  body.position.y = 0.03;
  root.add(body);
  root.add(mesh(new THREE.BoxGeometry(0.1, 0.012, 0.024), mid, 0, 0.185, 0.1)); // üstteki ışık yarığı
  // Arka: batarya yarıkları
  [-0.26, -0.3, -0.34].forEach((z) => root.add(mesh(new THREE.BoxGeometry(0.2, 0.012, 0.016), mid, 0, 0.17, z)));

  // Burun ve kamera
  const nose = mesh(new THREE.BoxGeometry(0.21, 0.19, 0.16), dark, 0, -0.012, 0.3);
  root.add(nose);
  const cam = new THREE.Group();
  cam.position.set(0, -0.012, 0.385);
  const bezel = mesh(new THREE.CylinderGeometry(0.082, 0.09, 0.05, 36), ringMetal);
  bezel.rotation.x = Math.PI / 2;
  cam.add(bezel);
  const lens = mesh(new THREE.SphereGeometry(0.07, 28, 18), glass, 0, 0, 0.02);
  lens.scale.z = 0.55;
  cam.add(lens);
  root.add(cam);

  // Kanal halkaları ve pervaneler
  const R = 0.3;
  const ductGeo = new THREE.TorusGeometry(R, 0.019, 12, 56);
  ductGeo.rotateX(Math.PI / 2);
  ductGeo.scale(1, 2.5, 1);
  const spokeGeo = new THREE.BoxGeometry(R * 2 - 0.02, 0.014, 0.024);
  [
    { x: 1, z: 1, dir: -1 },
    { x: -1, z: 1, dir: 1 },
    { x: 1, z: -1, dir: 1 },
    { x: -1, z: -1, dir: -1 },
  ].forEach(({ x, z, dir }) => {
    const cx = x * 0.46;
    const cz = z * 0.315;
    root.add(mesh(ductGeo, duct, cx, 0, cz));
    [0, Math.PI / 3, -Math.PI / 3].forEach((a) => {
      const spoke = mesh(spokeGeo, mid, cx, -0.03, cz);
      spoke.rotation.y = a;
      root.add(spoke);
    });
    root.add(mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.06, 20), dark, cx, -0.005, cz)); // motor

    const prop = propeller({ radius: 0.255, chord: 0.11, blades: 3, material: propMat, hubMaterial: dark, dir });
    prop.position.set(cx, 0.036, cz);
    root.add(prop);

    // Halkayı gövdeye bağlayan kol
    const link = mesh(new THREE.BoxGeometry(0.18, 0.05, 0.1), shell, x * 0.17, -0.005, z * 0.2);
    link.rotation.y = x * z * 0.5;
    root.add(link);
  });

  return normalize(root);
}
