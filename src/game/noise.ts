// Tiny deterministic value-noise. No deps. Seeded so the same world regenerates
// identically every run, and every client agrees on terrain. Good enough for a
// blocky heightmap; not Perlin, but smooth and cheap.

function hash2(ix: number, iz: number, seed: number): number {
  // integer hash -> [0,1)
  let h = ix * 374761393 + iz * 668265263 + seed * 2147483647;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967295;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t); // smoothstep
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// value noise at continuous (x,z)
function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fz = smooth(z - z0);
  const v00 = hash2(x0, z0, seed);
  const v10 = hash2(x0 + 1, z0, seed);
  const v01 = hash2(x0, z0 + 1, seed);
  const v11 = hash2(x0 + 1, z0 + 1, seed);
  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fz);
}

// Fractal (octave) noise -> smooth rolling hills. Returns [0,1].
export function fbm(x: number, z: number, seed = 1337): number {
  let amp = 1;
  let freq = 1 / 24; // base feature size in blocks
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < 4; o++) {
    sum += amp * valueNoise(x * freq, z * freq, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// Terrain surface height (integer block y) at world block coords (gx,gz).
export function heightAt(gx: number, gz: number, seed = 1337): number {
  const n = fbm(gx, gz, seed);
  return Math.floor(n * 10); // 0..10 blocks of relief
}

// Deterministic per-column chance a tree grows here.
export function treeAt(gx: number, gz: number, seed = 1337): boolean {
  return hash2(gx, gz, seed + 555) > 0.978;
}
