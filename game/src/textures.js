// textures.js — every texture in Solmar City is painted on a canvas at boot: deco facades with
// their lit windows, neon signs for the named businesses, palm fronds, awning stripes and the
// ocean's moving stripes. No image files ship with the game, so nothing loads over the network
// and the golden-hour look is the same on every machine.

import * as THREE from 'three';

/** Paint a canvas with a draw callback and wrap it as a texture. */
function paint(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * One deco facade: a pastel wall, a grid of windows (some lit for the emissive pass), a cornice
 * line and a darker shopfront at street level. Returns { map, glow } sharing one window layout,
 * so the lit windows sit exactly where the dark ones are drawn.
 */
function facade(rng, wall, trim) {
  const cols = 6;
  const rows = 10;
  const lit = [];
  for (let i = 0; i < cols * rows; i += 1) lit.push(rng.chance(0.42));
  const drawWindows = (ctx, litOnly) => {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const on = lit[r * cols + c];
        if (litOnly && !on) continue;
        ctx.fillStyle = litOnly ? '#ffc46b' : on ? '#ffd9a0' : '#22384a';
        ctx.fillRect(18 + c * 38, 26 + r * 44, 22, 30);
      }
    }
  };
  const map = paint(256, 512, (ctx, w, h) => {
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = trim; // cornice and base bands, the deco part
    ctx.fillRect(0, 0, w, 14);
    ctx.fillRect(0, h - 58, w, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.16)'; // shopfront shade at street level
    ctx.fillRect(0, h - 48, w, 48);
    drawWindows(ctx, false);
  });
  const glow = paint(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    drawWindows(ctx, true);
  });
  return { map, glow };
}

/** The facade set the city builder picks from: six pastel deco colourways. */
export function facadeSet(rng) {
  const colours = [
    ['#f6c9d0', '#e88ca0'], // flamingo pink
    ['#bfe8e2', '#57b8ac'], // lagoon mint
    ['#fdeed3', '#e0aa6e'], // sand cream
    ['#cfe0f4', '#7d9fc4'], // harbour blue
    ['#f9e2ae', '#d9944a'], // sunset gold
    ['#e6d7f2', '#9a7fc4'], // orchid lilac
  ];
  return colours.map(([wall, trim]) => facade(rng, wall, trim));
}

/** A neon sign: glowing tube letters on a dark plaque, drawn with shadow blur. */
export function neonSign(text, colour) {
  return paint(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#14101c';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.font = 'bold 54px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = colour;
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, w / 2, h / 2 + 2);
    ctx.fillStyle = colour;
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
}

/** An awning's stripes, for shopfronts and the beach club. */
export function awningTexture(colourA, colourB) {
  return paint(128, 32, (ctx, w, h) => {
    for (let i = 0; i < 8; i += 1) {
      ctx.fillStyle = i % 2 ? colourA : colourB;
      ctx.fillRect(i * 16, 0, 16, h);
    }
  });
}

/** Palm fronds: radiating tapered leaves on transparency, one texture for every palm. */
export function palmTexture() {
  const texture = paint(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 2;
      ctx.save();
      ctx.rotate(angle);
      ctx.fillStyle = i % 2 ? '#2e8b57' : '#37a866';
      // One frond: a long leaf that droops at the tip, drawn as a thin triangle fan.
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(60, -14, 118, 26);
      ctx.quadraticCurveTo(60, 6, 0, 4);
      ctx.fill();
      ctx.restore();
    }
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The ocean: soft horizontal wave stripes that the city scrolls slowly for moving water. */
export function waterTexture() {
  const texture = paint(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#17616e';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i += 1) {
      const y = (i / 26) * h + (i % 3) * 3;
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(0, y, w, 3);
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(60, 60);
  return texture;
}

/** A poster for the club wall and billboards: gradient sky, a sun disc and the game's wordmark. */
export function posterTexture(line1, line2, colour) {
  return paint(256, 340, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#2e4a7a');
    gradient.addColorStop(0.6, '#e2603f');
    gradient.addColorStop(1, '#f7a56b');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffd76e';
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.42, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#14101c';
    ctx.fillRect(0, h * 0.62, w, 4);
    ctx.font = 'bold 30px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line1, w / 2, h * 0.76);
    ctx.font = 'bold 21px Georgia, serif';
    ctx.fillStyle = colour;
    ctx.fillText(line2, w / 2, h * 0.86);
  });
}
