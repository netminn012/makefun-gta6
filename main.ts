// Neon Shores — the make.fun gta6-01 entry program (Node 22, standard library only).
//
// What ships is the game/ folder beside this file: a complete open-world crime game for a
// desktop browser — "Neon Shores", a golden-hour coastal city (Solmar City) built on a
// vendored three.js, with a walkable/driving protagonist, traffic, pedestrians, a wanted
// system with police pursuit, a five-mission story chain and synthesized WebAudio sound.
// It loads fully offline: every reference inside game/ resolves inside game/.
//
// This program's whole job is the hand-in: copy game/ and screenshots/ into the output
// directory (/output in the grader, or $MAKEFUN_OUTPUT_DIR when run by hand) and write the
// dossier the judge reads, using the vendored buildDossier so the bytes match what the
// gate rebuilds on its side. Run it twice and the output is identical.
//
// Try the game locally with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy the payload: the game itself, then the screenshots (the folder is created first so
// an entry with its screenshots already in place copies cleanly either way).
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The dossier, under the scorer's own caps: the text budget shapes which bytes are kept,
// and the rest refuse up front what the scorer would refuse anyway — at most 4 screenshots
// of at most 256 KiB each, at most 993 files and 48 MiB in game/, no game/ path over
// 1000 bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
