// main.ts — hands in The Meridian Heist (Node 22, standard library only).
// The game itself is plain static files in game/ (index.html plus its ES
// modules, no build step, no network request). This program copies game/ and
// screenshots/ from this repository into the output directory and writes
// dossier.json there, using the vendored make.fun library so the scorer can
// compare its own dossier byte for byte.
//
// Run it outside the grader with MAKEFUN_OUTPUT_DIR pointing at a folder:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The caps are the bounty's own gate limits: the dossier text holds at most
// 160 KiB, at most 4 screenshots of 256 KiB each, and game/ stays under 993
// entries and 48 MiB with paths under 1000 bytes (the grader's /output cap is
// 1000 entries total, so game/ leaves room for screenshots/ and dossier.json).
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
