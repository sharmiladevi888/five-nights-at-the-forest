import Phaser from "phaser";

// Procedural pixel-art. We draw each sprite from a tiny pixel map into an
// off-screen texture so the game ships with real characters and NO binary
// asset files to manage. Each string row = one pixel row; each char = a
// color key. Space = transparent.
type Palette = Record<string, number>;

function paintTexture(
  scene: Phaser.Scene,
  key: string,
  rows: string[],
  palette: Palette,
  pixel = 3
) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const c = rows[y][x];
      if (c === " ") continue;
      const color = palette[c];
      if (color === undefined) continue;
      g.fillStyle(color, 1);
      g.fillRect(x * pixel, y * pixel, pixel, pixel);
    }
  }
  g.generateTexture(key, w * pixel, h * pixel);
  g.destroy();
}

// Call once in Scene.create() before spawning anything.
export function buildSprites(scene: Phaser.Scene) {
  // Player: a hooded green survivor with a lantern.
  paintTexture(
    scene,
    "player",
    [
      "  gggg  ",
      " gggggg ",
      " gsggsg ",
      " gggggg ",
      "  gbbg  ",
      " bbbbbb ",
      " bb  bb ",
      " y    y ",
    ],
    { g: 0x5fae7e, s: 0x0b1410, b: 0x2f6b48, y: 0xffd166 }
  );

  // Creature: a red-eyed forest stalker.
  paintTexture(
    scene,
    "creature",
    [
      " k    k ",
      "  kkkk  ",
      " kkkkkk ",
      " krkkrk ",
      " kkkkkk ",
      "  kkkk  ",
      " kk  kk ",
      " k    k ",
    ],
    { k: 0x2a0d0d, r: 0xff2b2b }
  );

  // Tree: a chunky voxel pine.
  paintTexture(
    scene,
    "tree",
    [
      "   dd   ",
      "  dddd  ",
      " dddddd ",
      "dddddddd",
      "  dddd  ",
      " dddddd ",
      "dddddddd",
      "   tt   ",
      "   tt   ",
    ],
    { d: 0x1c3327, t: 0x4a2f1a }
  );

  // Item: a glowing battery/orb pickup.
  paintTexture(
    scene,
    "item",
    [
      "  ww  ",
      " wooe ",
      " oooe ",
      " oooe ",
      " eeee ",
      "  ee  ",
    ],
    { w: 0xfff3b0, o: 0xffd166, e: 0xd48a00 }
  );
}
