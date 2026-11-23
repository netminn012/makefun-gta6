// city.js — Solmar City itself: the golden-hour sky and sea, the painted island ground, the
// causeway to the lighthouse island, every building (with the colliders the physics uses), the
// named places with their neon signs, palms, street lights and beach props. It also owns the
// two spatial questions everything else asks: how high is the ground here, and how do I keep a
// moving circle on land and out of the buildings.

import * as THREE from 'three';
import { AVENUES_X, BOULEVARD_Z, CAUSEWAY, NORTH, PLACES, ROAD_HALF, STREETS_Z, WORLD } from './config.js';
import { awningTexture, facadeSet, neonSign, palmTexture, posterTexture, waterTexture } from './textures.js';

/** One material for every vertex-coloured mesh (cars, people, palms, props). */
export const flatMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 });

/**
 * Bake a transform and a flat colour into a geometry clone: translate/rotate/scale it, then
 * paint every vertex `color`. The parts are merged with mergeGeoms into a single mesh, which
 * is how a whole car or person becomes one draw call.
 */
export function part(geom, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geom.clone();
  g.scale(sx, sy, sz);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  const count = g.attributes.position.count;
  const colours = new Float32Array(count * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < count; i += 1) {
    colours[i * 3] = c.r;
    colours[i * 3 + 1] = c.g;
    colours[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return g;
}

/** Merge part() geometries into one BufferGeometry (positions, normals, colours only). */
export function mergeGeoms(parts) {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of flat) total += g.attributes.position.count;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const colours = new Float32Array(total * 3);
  let at = 0;
  for (const g of flat) {
    positions.set(g.attributes.position.array, at * 3);
    normals.set(g.attributes.normal.array, at * 3);
    colours.set(g.attributes.color.array, at * 3);
    at += g.attributes.position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return merged;
}

/** The land shapes a moving thing may occupy: two islands and the causeway strip. */
const LAND = [
  { x1: -WORLD.islandHalfX, z1: -WORLD.islandHalfZ, x2: WORLD.islandHalfX, z2: WORLD.islandHalfZ },
  { x1: CAUSEWAY.x - CAUSEWAY.halfWidth, z1: CAUSEWAY.zEnd, x2: CAUSEWAY.x + CAUSEWAY.halfWidth, z2: -WORLD.islandHalfZ },
  { x1: NORTH.minX, z1: NORTH.minZ, x2: NORTH.maxX, z2: NORTH.maxZ },
];

/** Ground height at a point: the causeway deck profile, island level, or the sea floor. */
export function groundHeightAt(x, z) {
  if (Math.abs(x - CAUSEWAY.x) <= CAUSEWAY.halfWidth + 1 && z <= -WORLD.islandHalfZ && z >= CAUSEWAY.zEnd) {
    if (z >= -360) return CAUSEWAY.deckY * ((-z - 330) / 30); // south ramp, shore to deck
    if (z <= -606) return CAUSEWAY.deckY * ((z - CAUSEWAY.zEnd) / 30); // north ramp down
    return CAUSEWAY.deckY;
  }
  if (x >= -WORLD.islandHalfX && x <= WORLD.islandHalfX && z >= -WORLD.islandHalfZ && z <= WORLD.islandHalfZ) return 0;
  if (x >= NORTH.minX && x <= NORTH.maxX && z >= NORTH.minZ && z <= NORTH.maxZ) return 0;
  return WORLD.waterY;
}

/** Keep a circle of `radius` on land: if it left every land shape, slide it back to the nearest. */
export function clampToLand(pos, radius) {
  for (const shape of LAND) {
    if (pos.x >= shape.x1 + radius && pos.x <= shape.x2 - radius && pos.z >= shape.z1 + radius && pos.z <= shape.z2 - radius) return false;
  }
  let best = null;
  let bestDist = Infinity;
  for (const shape of LAND) {
    const cx = Math.min(Math.max(pos.x, shape.x1 + radius), shape.x2 - radius);
    const cz = Math.min(Math.max(pos.z, shape.z1 + radius), shape.z2 - radius);
    const d = (cx - pos.x) ** 2 + (cz - pos.z) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = { x: cx, z: cz };
    }
  }
  pos.x = best.x;
  pos.z = best.z;
  return true;
}

/** Push a circle out of every building collider; returns the hardest impact speed absorbed. */
export function collideColliders(colliders, pos, radius) {
  let impact = 0;
  for (const box of colliders) {
    const nearX = Math.min(Math.max(pos.x, box.x1), box.x2);
    const nearZ = Math.min(Math.max(pos.z, box.z1), box.z2);
    const dx = pos.x - nearX;
    const dz = pos.z - nearZ;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = nearX + (dx / d) * radius;
      pos.z = nearZ + (dz / d) * radius;
      impact = Math.max(impact, 1 - d / radius);
    } else {
      // Centre inside the box: leave by the shallowest face.
      const exits = [
        { d: pos.x - box.x1, x: box.x1 - radius, z: pos.z },
        { d: box.x2 - pos.x, x: box.x2 + radius, z: pos.z },
        { d: pos.z - box.z1, x: pos.x, z: box.z1 - radius },
        { d: box.z2 - pos.z, x: pos.x, z: box.z2 + radius },
      ];
      exits.sort((a, b) => a.d - b.d);
      pos.x = exits[0].x;
      pos.z = exits[0].z;
      impact = 1;
    }
  }
  return impact;
}

/** Paint the main island from above: sand, sidewalks, asphalt, dashes and the boulevard. */
function paintGround(rng) {
  const S = 2.18; // canvas pixels per metre
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  const X = (x) => (x + WORLD.islandHalfX) * S;
  const Y = (z) => (z + WORLD.islandHalfZ) * S;
  ctx.fillStyle = '#75806d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 2600; i += 1) { // speckle so the base is not one flat tone
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
    ctx.fillRect(rng.range(0, canvas.width), rng.range(0, canvas.height), 3, 3);
  }
  // The beach: a sand band along the south shore, with a wet darker line at the water.
  ctx.fillStyle = '#e6cd9c';
  ctx.fillRect(0, Y(WORLD.beachZ), canvas.width, Y(WORLD.islandHalfZ) - Y(WORLD.beachZ));
  ctx.fillStyle = '#c9ab77';
  ctx.fillRect(0, Y(322), canvas.width, 5);
  const road = (x1, z1, x2, z2) => {
    ctx.fillStyle = '#a3a89c'; // sidewalk band first, wider than the asphalt
    ctx.fillRect(X(x1) - 7, Y(z1) - 7, (x2 - x1) * S + 14, (z2 - z1) * S + 14);
    ctx.fillStyle = '#33373d';
    ctx.fillRect(X(x1), Y(z1), (x2 - x1) * S, (z2 - z1) * S);
  };
  for (const x of AVENUES_X) road(x - ROAD_HALF.avenue, -WORLD.islandHalfZ, x + ROAD_HALF.avenue, WORLD.islandHalfZ);
  for (const z of STREETS_Z) road(-WORLD.islandHalfX, z - ROAD_HALF.street, WORLD.islandHalfX, z + ROAD_HALF.street);
  road(-WORLD.islandHalfX, BOULEVARD_Z - ROAD_HALF.boulevard, WORLD.islandHalfX, BOULEVARD_Z + ROAD_HALF.boulevard);
  // Centre dashes down every road.
  ctx.fillStyle = 'rgba(240,230,180,0.75)';
  for (const x of AVENUES_X) for (let z = -WORLD.islandHalfZ; z < WORLD.islandHalfZ; z += 18) ctx.fillRect(X(x) - 1, Y(z), 2, 9);
  for (const z of [...STREETS_Z, BOULEVARD_Z]) for (let x = -WORLD.islandHalfX; x < WORLD.islandHalfX; x += 18) ctx.fillRect(X(x), Y(z) - 1, 9, 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** The named buildings the story needs, with signs; generic blocks grow around them. */
const SPECIALS = [
  { name: 'HOTEL AZAHAR', x: -170, z: 214, w: 66, d: 24, h: 36, sign: '#ff7fa5', facade: 0 },
  { name: 'CLUB AZUL', x: 60, z: 216, w: 46, d: 22, h: 15, sign: '#39c2d7', facade: 1 },
  { name: 'MARINA POLICE', x: 112, z: -124, w: 42, d: 20, h: 17, sign: '#7db4ff', facade: 3 },
  { name: 'SOLMAR CLINIC', x: -288, z: 54, w: 38, d: 20, h: 14, sign: '#ffffff', facade: 2 },
  { name: 'WEST DOCKS', x: -428, z: 146, w: 34, d: 46, h: 12, sign: '#f2c230', facade: 4 },
  { name: 'PALM COURT', x: 268, z: 214, w: 52, d: 24, h: 28, sign: '#7dd87d', facade: 5 },
  { name: 'HOTEL BRISA', x: -330, z: 214, w: 56, d: 24, h: 30, sign: '#ffd76e', facade: 4 },
];

/** Build the whole city into G.scene and fill G.colliders. Returns an update(dt) for the water. */
export function createCity(G) {
  const { scene, rng } = G;
  G.colliders = [];

  // Sky: a gradient dome, warm at the horizon where the sun sits, deep blue overhead.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2200, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:
        'varying vec3 vP; void main(){ float t = clamp(normalize(vP).y * 1.6 + 0.22, 0.0, 1.0);' +
        ' vec3 top = vec3(0.13, 0.25, 0.45); vec3 mid = vec3(0.93, 0.45, 0.30); vec3 low = vec3(1.0, 0.68, 0.42);' +
        ' vec3 c = t < 0.42 ? mix(low, mid, t / 0.42) : mix(mid, top, (t - 0.42) / 0.58); gl_FragColor = vec4(c, 1.0); }',
    }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(0xe88a5a, 220, 1750);

  // Golden-hour light: a low warm sun with shadows, a pink-blue sky bounce, and a sea fill.
  const sun = new THREE.DirectionalLight(0xffb066, 2.9);
  sun.position.set(-420, 210, 330);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -190;
  sun.shadow.camera.right = 190;
  sun.shadow.camera.top = 190;
  sun.shadow.camera.bottom = -190;
  sun.shadow.camera.far = 1200;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  G.sun = sun;
  scene.add(new THREE.HemisphereLight(0xffd9b0, 0x2e4a55, 0.85));

  // The ocean, all around, its stripes scrolling in update().
  const waterMat = new THREE.MeshPhongMaterial({ map: waterTexture(), color: 0x9fd4d8, shininess: 90 });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(5200, 5200), waterMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = WORLD.waterY;
  scene.add(ocean);

  // The main island: a painted top and a rock skirt under the waterline.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.islandHalfX * 2, WORLD.islandHalfZ * 2),
    new THREE.MeshStandardMaterial({ map: paintGround(rng), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(WORLD.islandHalfX * 2 + 8, 2.4, WORLD.islandHalfZ * 2 + 8), new THREE.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 1 }));
  skirt.position.y = -1.7;
  scene.add(skirt);

  // The north island: simpler paint — sand rim, grass middle, one road cross.
  const northCanvas = document.createElement('canvas');
  northCanvas.width = 512;
  northCanvas.height = 512;
  const nctx = northCanvas.getContext('2d');
  nctx.fillStyle = '#e6cd9c';
  nctx.fillRect(0, 0, 512, 512);
  nctx.fillStyle = '#6f8f5f';
  nctx.fillRect(36, 36, 440, 440);
  nctx.fillStyle = '#33373d';
  nctx.fillRect(238, 0, 36, 512); // the causeway road, running to the lighthouse
  nctx.fillRect(0, 200, 512, 30); // the shore road past the garage
  const northTex = new THREE.CanvasTexture(northCanvas);
  northTex.colorSpace = THREE.SRGBColorSpace;
  const north = new THREE.Mesh(new THREE.PlaneGeometry(NORTH.maxX - NORTH.minX, NORTH.maxZ - NORTH.minZ), new THREE.MeshStandardMaterial({ map: northTex, roughness: 0.95 }));
  north.rotation.x = -Math.PI / 2;
  north.position.set((NORTH.minX + NORTH.maxX) / 2, 0, (NORTH.minZ + NORTH.maxZ) / 2);
  north.receiveShadow = true;
  scene.add(north);

  buildCauseway(scene);
  buildBuildings(G);
  buildPalms(G);
  buildStreetlights(G);
  buildBeachProps(G);
  buildLighthouse(G);

  // Scroll the sea and breathe the lighthouse lamp; everything else in the city is still.
  const lampMat = G.lighthouseLamp.material;
  return {
    update(dt) {
      waterMat.map.offset.x += dt * 0.008;
      waterMat.map.offset.y += dt * 0.003;
      lampMat.emissiveIntensity = 1.6 + Math.sin(G.time * 2.2) * 0.9;
    },
  };
}

/** The causeway: three deck slabs (two ramps, one flat), rails, lamps and pillars. */
function buildCauseway(scene) {
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.9 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.6 });
  const slope = Math.atan2(CAUSEWAY.deckY, 30);
  const segments = [
    { z: -345, y: CAUSEWAY.deckY / 2, len: 30.2, rot: slope },
    { z: -483, y: CAUSEWAY.deckY - 0.5, len: 246, rot: 0 },
    { z: -621, y: CAUSEWAY.deckY / 2, len: 30.2, rot: -slope },
  ];
  for (const seg of segments) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(CAUSEWAY.halfWidth * 2, 1, seg.len), deckMat);
    deck.position.set(CAUSEWAY.x, seg.y, seg.z);
    deck.rotation.x = seg.rot;
    deck.receiveShadow = true;
    scene.add(deck);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, seg.len), railMat);
      rail.position.set(CAUSEWAY.x + side * (CAUSEWAY.halfWidth - 0.2), seg.y + 0.95, seg.z);
      rail.rotation.x = seg.rot;
      scene.add(rail);
    }
  }
  const pillarGeom = new THREE.CylinderGeometry(1.3, 1.6, CAUSEWAY.deckY + 2.4, 8);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x9a958a, roughness: 1 });
  for (let z = -390; z >= -590; z -= 40) {
    const pillar = new THREE.Mesh(pillarGeom, pillarMat);
    pillar.position.set(CAUSEWAY.x, 0.4, z);
    scene.add(pillar);
  }
}

/** One building: a facade box, a cornice slab, and its collider. Signs and awnings optional. */
function addBuilding(G, { x, z, w, d, h, facade, sign, signColour, awning }) {
  const { scene } = G;
  const source = G.facades[facade % G.facades.length];
  const map = source.map.clone();
  map.needsUpdate = true;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(Math.max(1, Math.round(w / 26)), Math.max(1, Math.round(h / 46)));
  const glow = source.glow.clone();
  glow.needsUpdate = true;
  glow.wrapS = THREE.RepeatWrapping;
  glow.wrapT = THREE.RepeatWrapping;
  glow.repeat.copy(map.repeat);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ map, emissiveMap: glow, emissive: 0xffb45e, emissiveIntensity: 0.5, roughness: 0.9 }),
  );
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 1, d + 1.2), new THREE.MeshStandardMaterial({ color: 0xf4ead8, roughness: 0.8 }));
  cornice.position.set(x, h + 0.5, z);
  cornice.castShadow = true;
  scene.add(cornice);
  if (sign) {
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(w * 0.92, 34), 4.2),
      new THREE.MeshBasicMaterial({ map: neonSign(sign, signColour) }),
    );
    signMesh.position.set(x, h - 3.4, z + d / 2 + 0.15); // faces south, toward the street or beach
    scene.add(signMesh);
  }
  if (awning) {
    const awn = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.3, 3.4), new THREE.MeshStandardMaterial({ map: awningTexture('#e2603f', '#fdeed3'), roughness: 0.9 }));
    awn.position.set(x, 3.4, z + d / 2 + 1.6);
    awn.rotation.x = 0.35;
    scene.add(awn);
  }
  G.colliders.push({ x1: x - w / 2 - 0.3, z1: z - d / 2 - 0.3, x2: x + w / 2 + 0.3, z2: z + d / 2 + 0.3 });
  return mesh;
}

/** Specials first, then generic deco blocks in every grid cell they do not touch. */
function buildBuildings(G) {
  const { rng } = G;
  G.facades = facadeSet(rng);
  const taken = [];
  for (const s of SPECIALS) {
    addBuilding(G, { x: s.x, z: s.z, w: s.w, d: s.d, h: s.h, facade: s.facade, sign: s.name, signColour: s.sign, awning: s.name.includes('CLUB') || s.name.includes('HOTEL') });
    taken.push({ x1: s.x - s.w / 2 - 6, z1: s.z - s.d / 2 - 6, x2: s.x + s.w / 2 + 6, z2: s.z + s.d / 2 + 6 });
  }
  // The hideout garage on the north island: low, wide doors, one green sign.
  addBuilding(G, { x: PLACES.hideout.x, z: PLACES.hideout.z - 10, w: 26, d: 14, h: 8, facade: 2, sign: 'GARAGE', signColour: '#7dd87d' });
  taken.push({ x1: 70, z1: -700, x2: 125, z2: -655 });
  // Dock crates and a second warehouse shed at the west end.
  addBuilding(G, { x: -428, z: 84, w: 26, d: 26, h: 9, facade: 3 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xb07a3f, roughness: 1 });
  for (let i = 0; i < 9; i += 1) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), crateMat);
    crate.position.set(-444 + (i % 3) * 3.2, 1.2 + Math.floor(i / 6) * 2.4, 108 + Math.floor((i % 6) / 3) * 3.2);
    crate.castShadow = true;
    G.scene.add(crate);
  }
  G.colliders.push({ x1: -446, z1: 104, x2: -436, z2: 116 });

  const overlaps = (box) => taken.some((t) => box.x1 < t.x2 && box.x2 > t.x1 && box.z1 < t.z2 && box.z2 > t.z1);
  // Generic blocks: each grid cell gets one to four buildings, taller toward the centre.
  for (let ai = 0; ai < AVENUES_X.length - 1; ai += 1) {
    for (let si = 0; si <= STREETS_Z.length; si += 1) {
      const x1 = AVENUES_X[ai] + ROAD_HALF.avenue + 3;
      const x2 = AVENUES_X[ai + 1] - ROAD_HALF.avenue - 3;
      const zTop = si === 0 ? -WORLD.islandHalfZ + 4 : STREETS_Z[si - 1] + ROAD_HALF.street + 3;
      const zBot = si < STREETS_Z.length ? STREETS_Z[si] - ROAD_HALF.street - 3 : BOULEVARD_Z - ROAD_HALF.boulevard - 3;
      if (x2 - x1 < 24 || zBot - zTop < 22) continue;
      const lots = rng.int(1, 3);
      for (let lot = 0; lot < lots; lot += 1) {
        const w = (x2 - x1) / lots - rng.range(3, 7);
        const cx = x1 + ((x2 - x1) / lots) * (lot + 0.5);
        const d = (zBot - zTop) * rng.range(0.55, 0.85);
        const cz = (zTop + zBot) / 2 + rng.range(-3, 3);
        const box = { x1: cx - w / 2 - 2, z1: cz - d / 2 - 2, x2: cx + w / 2 + 2, z2: cz + d / 2 + 2 };
        if (overlaps(box)) continue;
        const distCentre = Math.hypot(cx, cz) / 480;
        const h = Math.max(9, (64 - distCentre * 52) * rng.range(0.65, 1.25));
        addBuilding(G, { x: cx, z: cz, w, d, h, facade: rng.int(0, 5) });
        taken.push(box);
      }
    }
  }
  // Billboards over the boulevard: the club's poster and a cola ad, both fictional.
  for (const [x, line1, line2, colour] of [[150, 'CLUB AZUL', 'TONIGHT · DJ ONDA', '#39c2d7'], [-60, 'SOLA COLA', 'TASTE THE SUNSET', '#ffd76e']]) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(15, 20), new THREE.MeshBasicMaterial({ map: posterTexture(line1, line2, colour), side: THREE.DoubleSide }));
    board.position.set(x, 17, 232);
    G.scene.add(board);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 8, 6), new THREE.MeshStandardMaterial({ color: 0x555a60 }));
    pole.position.set(x, 4, 232);
    G.scene.add(pole);
  }
}

/** Palms everywhere the postcards want them: boulevard rows, beach scatter, plaza clusters. */
function buildPalms(G) {
  const { rng, scene } = G;
  const spots = [];
  for (let x = -450; x <= 450; x += 24) {
    spots.push({ x: x + rng.range(-3, 3), z: 268 + rng.range(-2, 2) });
    spots.push({ x: x + rng.range(-3, 3), z: 238 + rng.range(-2, 2) });
  }
  for (let i = 0; i < 46; i += 1) spots.push({ x: rng.range(-460, 460), z: rng.range(278, 322) });
  for (let i = 0; i < 16; i += 1) spots.push({ x: rng.range(-440, 440), z: rng.range(-300, 200) });
  spots.push({ x: 84, z: -664 }, { x: 226, z: -700 }, { x: 120, z: -770 }, { x: 176, z: -648 });
  const trunkGeom = new THREE.CylinderGeometry(0.13, 0.24, 5.4, 5);
  trunkGeom.translate(0, 2.7, 0);
  const frondGeom = new THREE.PlaneGeometry(6.4, 6.4);
  frondGeom.rotateX(-Math.PI / 2);
  frondGeom.translate(0, 5.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeom, new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 }), spots.length);
  const fronds = new THREE.InstancedMesh(frondGeom, new THREE.MeshStandardMaterial({ map: palmTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }), spots.length);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  spots.forEach((spot, i) => {
    const scale = rng.range(0.85, 1.3);
    euler.set(rng.range(-0.06, 0.06), rng.range(0, Math.PI * 2), rng.range(-0.06, 0.06));
    quat.setFromEuler(euler);
    matrix.compose(new THREE.Vector3(spot.x, groundHeightAt(spot.x, spot.z), spot.z), quat, new THREE.Vector3(scale, scale, scale));
    trunks.setMatrixAt(i, matrix);
    fronds.setMatrixAt(i, matrix);
  });
  trunks.castShadow = true;
  fronds.castShadow = true;
  scene.add(trunks);
  scene.add(fronds);
}

/** Street lights along the avenues and the boulevard: poles instanced, heads glowing. */
function buildStreetlights(G) {
  const { scene } = G;
  const spots = [];
  for (const x of AVENUES_X) for (let z = -300; z <= 300; z += 52) spots.push({ x: x + 9.5, z });
  for (let x = -440; x <= 440; x += 52) spots.push({ x, z: BOULEVARD_Z - 13.5 });
  for (let z = -380; z >= -600; z -= 44) spots.push({ x: CAUSEWAY.x + 7, z });
  const poleGeom = mergeGeoms([
    part(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 5), 0x3c4148, 0, 2.8, 0),
    part(new THREE.BoxGeometry(0.14, 0.14, 1.6), 0x3c4148, 0, 5.5, -0.7),
  ]);
  const headGeom = new THREE.BoxGeometry(0.5, 0.16, 0.9);
  const poles = new THREE.InstancedMesh(poleGeom, flatMaterial, spots.length);
  const heads = new THREE.InstancedMesh(headGeom, new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), spots.length);
  const matrix = new THREE.Matrix4();
  spots.forEach((spot, i) => {
    matrix.makeTranslation(spot.x, groundHeightAt(spot.x, spot.z), spot.z);
    poles.setMatrixAt(i, matrix);
    matrix.makeTranslation(spot.x, groundHeightAt(spot.x, spot.z) + 5.5, spot.z - 1.3);
    heads.setMatrixAt(i, matrix);
  });
  scene.add(poles);
  scene.add(heads);
}

/** Beach umbrellas and benches: small colour for the cover shot's foreground. */
function buildBeachProps(G) {
  const { rng, scene } = G;
  const umbrellaGeom = mergeGeoms([
    part(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), 0xe8e4da, 0, 1.2, 0),
    part(new THREE.ConeGeometry(1.9, 0.7, 8), 0xffffff, 0, 2.5, 0),
  ]);
  const umbrellas = new THREE.InstancedMesh(umbrellaGeom, flatMaterial, 16);
  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();
  for (let i = 0; i < 16; i += 1) {
    const x = rng.range(-440, 440);
    const z = rng.range(282, 318);
    matrix.makeRotationY(rng.range(0, 3));
    matrix.setPosition(x, 0, z);
    umbrellas.setMatrixAt(i, matrix);
    umbrellas.setColorAt(i, colour.setHex(rng.pick([0xe2603f, 0x39c2d7, 0xf2c230, 0xff7fa5])));
  }
  // Note: instance colours multiply the white cone only where vertices are white; poles stay pale.
  scene.add(umbrellas);
  const benchGeom = mergeGeoms([
    part(new THREE.BoxGeometry(2.2, 0.12, 0.55), 0x7a4a2b, 0, 0.55, 0),
    part(new THREE.BoxGeometry(2.2, 0.5, 0.1), 0x7a4a2b, 0, 0.95, -0.26, -0.25),
    part(new THREE.BoxGeometry(0.12, 0.55, 0.5), 0x3c4148, -0.9, 0.27, 0),
    part(new THREE.BoxGeometry(0.12, 0.55, 0.5), 0x3c4148, 0.9, 0.27, 0),
  ]);
  const benches = new THREE.InstancedMesh(benchGeom, flatMaterial, 12);
  for (let i = 0; i < 12; i += 1) {
    matrix.makeRotationY(Math.PI); // face the sea
    matrix.setPosition(-420 + i * 76, 0, 270);
    benches.setMatrixAt(i, matrix);
  }
  scene.add(benches);
}

/** The lighthouse on the north island: banded tower, lamp room, and the lamp the update breathes. */
function buildLighthouse(G) {
  const { scene } = G;
  const { x, z } = PLACES.lighthouse;
  const bands = document.createElement('canvas');
  bands.width = 64;
  bands.height = 256;
  const bctx = bands.getContext('2d');
  for (let i = 0; i < 6; i += 1) {
    bctx.fillStyle = i % 2 ? '#e2603f' : '#fdeed3';
    bctx.fillRect(0, i * 43, 64, 43);
  }
  const bandTex = new THREE.CanvasTexture(bands);
  bandTex.colorSpace = THREE.SRGBColorSpace;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.9, 24, 12), new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.8 }));
  tower.position.set(x, 12, z);
  tower.castShadow = true;
  scene.add(tower);
  const room = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x22242a }));
  room.position.set(x, 25, z);
  scene.add(room);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffdf7e, emissiveIntensity: 1.6 }));
  lamp.position.set(x, 25, z);
  scene.add(lamp);
  G.lighthouseLamp = lamp;
  G.colliders.push({ x1: x - 3.4, z1: z - 3.4, x2: x + 3.4, z2: z + 3.4 });
}
