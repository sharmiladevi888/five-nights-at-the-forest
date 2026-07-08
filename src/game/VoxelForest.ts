import * as THREE from "three";
import type { RunStats } from "@/lib/score";
import { heightAt, treeAt } from "./noise";

// First-person 3D voxel survival with block breaking/placing on INFINITE,
// procedurally generated terrain, now with real vertical physics: velocity-
// based gravity, spacebar jump, and proper ground/ceiling collision. You can
// stack blocks and jump up to climb the terrain you build.
//
// The world streams in as chunks around the player: a seeded value-noise
// heightmap gives rolling hills, dirt/stone layers, and scattered blocky
// trees. Player edits (break/place) override generated terrain.

const BLOCK = 2;
const REACH = 6;
const CHUNK = 8;
const RADIUS = 3;
const SEED = 1337;

// physics (world units). EYE is how high the camera sits above the player's
// feet; the body is ~1.6 blocks tall.
const GRAVITY = 34; // units/s^2
const JUMP_V = 11; // initial jump velocity
const EYE = BLOCK * 0.8;
const PLAYER_H = BLOCK * 1.6;

type BlockType = "dirt" | "trunk" | "leaf" | "stone" | "grass";

const BLOCK_COLORS: Record<BlockType, number> = {
  dirt: 0x0c1a12,
  grass: 0x18351f,
  trunk: 0x3a2616,
  leaf: 0x1c3b25,
  stone: 0x555b61,
};
const PLACEABLE: BlockType[] = ["dirt", "trunk", "leaf", "stone"];
const ALL: BlockType[] = ["dirt", "grass", "trunk", "leaf", "stone"];

function bkey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}
function ckey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export class VoxelForest {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private lantern!: THREE.PointLight;
  private fog!: THREE.FogExp2;

  private edits = new Map<string, BlockType | null>();
  private chunks = new Map<string, THREE.InstancedMesh[]>();
  private highlight!: THREE.LineSegments;

  private creatures: THREE.Mesh[] = [];
  private items: THREE.Mesh[] = [];

  private keys: Record<string, boolean> = {};
  private yaw = 0;
  private pitch = 0;
  private pos = new THREE.Vector3(0, 24, 0); // camera (eye) position
  private velY = 0; // vertical velocity
  private onGround = false;
  private selected: BlockType = "stone";
  private lastChunk = "";

  private night = 1;
  private battery = 100;
  private health = 100;
  private nightSeconds = 45;
  private elapsed = 0;
  private blocksMined = 0;
  private stats: RunStats = {
    nightsCleared: 0,
    secondsSurvived: 0,
    creaturesEvaded: 0,
    itemsCollected: 0,
  };

  private mount!: HTMLElement;
  private raf = 0;
  private clock = new THREE.Clock();
  private secondTimer = 0;
  private ended = false;
  private raycaster = new THREE.Raycaster();
  private aimed:
    | { x: number; y: number; z: number; nx: number; ny: number; nz: number }
    | null = null;

  private onGameOver: (s: RunStats) => void;
  private onHud: (h: any) => void;

  constructor(onGameOver: (s: RunStats) => void, onHud: (h: any) => void) {
    this.onGameOver = onGameOver;
    this.onHud = onHud;
  }

  start(mount: HTMLElement) {
    this.mount = mount;
    const w = mount.clientWidth || 800;
    const h = mount.clientHeight || 500;

    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    mount.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05080b);
    this.fog = new THREE.FogExp2(0x05080b, 0.045);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(72, w / h, 0.1, 500);
    this.scene.add(new THREE.AmbientLight(0x223044, 0.5));
    const moon = new THREE.DirectionalLight(0x4a6a8a, 0.25);
    moon.position.set(-1, 2, 1);
    this.scene.add(moon);
    this.lantern = new THREE.PointLight(0xffca6a, 2.2, 26, 1.6);
    this.scene.add(this.lantern);

    // spawn standing on the surface at origin
    this.pos.y = (heightAt(0, 0, SEED) + 1) * BLOCK + BLOCK / 2 + EYE;

    this.buildHighlight();
    this.refreshChunks(true);
    this.spawnNight();

    this.bindInput();
    this.clock.start();
    this.loop();
  }

  // ---- terrain generation ----

  private blockAt(x: number, y: number, z: number): BlockType | null {
    const e = this.edits.get(bkey(x, y, z));
    if (e !== undefined) return e;
    return this.generated(x, y, z);
  }

  private generated(x: number, y: number, z: number): BlockType | null {
    if (y < 0) return null;
    const h = heightAt(x, z, SEED);
    if (y > h) return this.treeBlock(x, y, z, h);
    if (y === h) return "grass";
    if (y >= h - 2) return "dirt";
    return "stone";
  }

  private treeBlock(x: number, y: number, z: number, h: number): BlockType | null {
    if (treeAt(x, z, SEED)) {
      const trunkTop = h + 4;
      if (y > h && y <= trunkTop) return "trunk";
      if (y >= trunkTop && y <= trunkTop + 1) return "leaf";
    }
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        if (treeAt(x + dx, z + dz, SEED)) {
          const nh = heightAt(x + dx, z + dz, SEED);
          const top = nh + 4;
          if (y >= top && y <= top + 1) return "leaf";
        }
      }
    return null;
  }

  private exposed(x: number, y: number, z: number): boolean {
    return (
      this.blockAt(x + 1, y, z) === null ||
      this.blockAt(x - 1, y, z) === null ||
      this.blockAt(x, y + 1, z) === null ||
      this.blockAt(x, y - 1, z) === null ||
      this.blockAt(x, y, z + 1) === null ||
      this.blockAt(x, y, z - 1) === null
    );
  }

  private buildChunk(cx: number, cz: number): THREE.InstancedMesh[] {
    const buckets: Record<BlockType, THREE.Matrix4[]> = {
      dirt: [], grass: [], trunk: [], leaf: [], stone: [],
    };
    const m = new THREE.Matrix4();
    for (let lx = 0; lx < CHUNK; lx++)
      for (let lz = 0; lz < CHUNK; lz++) {
        const x = cx * CHUNK + lx;
        const z = cz * CHUNK + lz;
        const h = heightAt(x, z, SEED);
        for (let y = Math.max(0, h - 4); y <= h + 6; y++) {
          const t = this.blockAt(x, y, z);
          if (!t) continue;
          if (!this.exposed(x, y, z)) continue;
          m.setPosition(x * BLOCK, y * BLOCK + BLOCK / 2, z * BLOCK);
          buckets[t].push(m.clone());
        }
      }

    const meshes: THREE.InstancedMesh[] = [];
    const geo = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
    for (const t of ALL) {
      const list = buckets[t];
      if (list.length === 0) continue;
      const mat = new THREE.MeshStandardMaterial({ color: BLOCK_COLORS[t] });
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((mat4, i) => im.setMatrixAt(i, mat4));
      im.instanceMatrix.needsUpdate = true;
      (im as any).blockType = t;
      (im as any).chunkKey = ckey(cx, cz);
      this.scene.add(im);
      meshes.push(im);
    }
    return meshes;
  }

  private disposeChunk(key: string) {
    const meshes = this.chunks.get(key);
    if (!meshes) return;
    for (const im of meshes) {
      this.scene.remove(im);
      im.geometry.dispose();
      (im.material as THREE.Material).dispose();
    }
    this.chunks.delete(key);
  }

  private refreshChunks(force = false) {
    const pcx = Math.floor(this.pos.x / BLOCK / CHUNK);
    const pcz = Math.floor(this.pos.z / BLOCK / CHUNK);
    const nowKey = ckey(pcx, pcz);
    if (!force && nowKey === this.lastChunk) return;
    this.lastChunk = nowKey;

    const needed = new Set<string>();
    for (let dx = -RADIUS; dx <= RADIUS; dx++)
      for (let dz = -RADIUS; dz <= RADIUS; dz++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const k = ckey(cx, cz);
        needed.add(k);
        if (!this.chunks.has(k)) this.chunks.set(k, this.buildChunk(cx, cz));
      }
    for (const k of [...this.chunks.keys()]) {
      if (!needed.has(k)) this.disposeChunk(k);
    }
  }

  private rebuildAround(x: number, z: number) {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const k = ckey(cx + dx, cz + dz);
        if (this.chunks.has(k)) {
          this.disposeChunk(k);
          this.chunks.set(k, this.buildChunk(cx + dx, cz + dz));
        }
      }
  }

  private buildHighlight() {
    const geo = new THREE.BoxGeometry(BLOCK * 1.02, BLOCK * 1.02, BLOCK * 1.02);
    const edges = new THREE.EdgesGeometry(geo);
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    this.highlight = new THREE.LineSegments(edges, mat);
    this.highlight.visible = false;
    this.scene.add(this.highlight);
  }

  private spawnNight() {
    for (const c of this.creatures) this.scene.remove(c);
    for (const it of this.items) this.scene.remove(it);
    this.creatures = [];
    this.items = [];

    const count = 2 + this.night;
    const geo = new THREE.BoxGeometry(BLOCK * 0.9, BLOCK * 1.6, BLOCK * 0.9);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x140606, emissive: 0x330000, emissiveIntensity: 0.6 });
      const cr = new THREE.Mesh(geo, mat);
      const ang = Math.random() * Math.PI * 2;
      const dist = 22 + Math.random() * 24;
      const cxp = this.pos.x + Math.cos(ang) * dist;
      const czp = this.pos.z + Math.sin(ang) * dist;
      cr.position.set(cxp, this.surfaceY(cxp, czp) + BLOCK * 0.8, czp);
      const eyeGeo = new THREE.BoxGeometry(0.3, 0.3, 0.1);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2b2b });
      const e1 = new THREE.Mesh(eyeGeo, eyeMat);
      e1.position.set(-0.4, 0.5, BLOCK * 0.46);
      const e2 = e1.clone();
      e2.position.x = 0.4;
      cr.add(e1, e2);
      (cr as any).speed = 3 + this.night * 0.8;
      this.scene.add(cr);
      this.creatures.push(cr);
    }

    const itemGeo = new THREE.BoxGeometry(BLOCK * 0.5, BLOCK * 0.5, BLOCK * 0.5);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffb020, emissiveIntensity: 0.8 });
      const it = new THREE.Mesh(itemGeo, mat);
      const ang = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 26;
      const ixp = this.pos.x + Math.cos(ang) * dist;
      const izp = this.pos.z + Math.sin(ang) * dist;
      it.position.set(ixp, this.surfaceY(ixp, izp) + BLOCK * 0.6, izp);
      this.scene.add(it);
      this.items.push(it);
    }
  }

  // ---- input ----

  private bindInput() {
    const el = this.renderer.domElement;
    el.addEventListener("click", () => {
      if (document.pointerLockElement !== el) el.requestPointerLock();
    });
    this._onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== el) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch));
    };
    this._onMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== el || this.ended) return;
      if (e.button === 0) this.breakBlock();
      else if (e.button === 2) this.placeBlock();
    };
    this._onContext = (e: Event) => e.preventDefault();
    this._onDown = (e: KeyboardEvent) => {
      this.keys[e.code] = true;
      const idx = ["Digit1", "Digit2", "Digit3", "Digit4"].indexOf(e.code);
      if (idx >= 0) this.selected = PLACEABLE[idx];
      // jump
      if (e.code === "Space" && this.onGround) {
        this.velY = JUMP_V;
        this.onGround = false;
      }
    };
    this._onUp = (e: KeyboardEvent) => (this.keys[e.code] = false);
    document.addEventListener("mousemove", this._onMove);
    el.addEventListener("mousedown", this._onMouseDown);
    el.addEventListener("contextmenu", this._onContext);
    document.addEventListener("keydown", this._onDown);
    document.addEventListener("keyup", this._onUp);
    this._onResize = () => {
      const w = this.mount.clientWidth;
      const h = this.mount.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    addEventListener("resize", this._onResize);
  }

  private _onMove!: (e: MouseEvent) => void;
  private _onMouseDown!: (e: MouseEvent) => void;
  private _onContext!: (e: Event) => void;
  private _onDown!: (e: KeyboardEvent) => void;
  private _onUp!: (e: KeyboardEvent) => void;
  private _onResize!: () => void;

  // ---- mining / placing ----

  private updateAim() {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = REACH * BLOCK;
    const targets: THREE.Object3D[] = [];
    for (const meshes of this.chunks.values()) targets.push(...meshes);
    const hits = this.raycaster.intersectObjects(targets, false);
    if (hits.length === 0) {
      this.aimed = null;
      this.highlight.visible = false;
      return;
    }
    const hit = hits[0];
    const p = hit.point.clone();
    const n = hit.face!.normal.clone();
    const inside = p.clone().addScaledVector(n, -BLOCK * 0.25);
    const gx = Math.round(inside.x / BLOCK);
    const gy = Math.round((inside.y - BLOCK / 2) / BLOCK);
    const gz = Math.round(inside.z / BLOCK);
    this.aimed = { x: gx, y: gy, z: gz, nx: n.x, ny: n.y, nz: n.z };
    this.highlight.position.set(gx * BLOCK, gy * BLOCK + BLOCK / 2, gz * BLOCK);
    this.highlight.visible = true;
  }

  private breakBlock() {
    if (!this.aimed) return;
    const { x, y, z } = this.aimed;
    if (y <= 0) return;
    if (this.blockAt(x, y, z) === null) return;
    this.edits.set(bkey(x, y, z), null);
    this.rebuildAround(x, z);
    this.blocksMined += 1;
  }

  private placeBlock() {
    if (!this.aimed) return;
    const { x, y, z, nx, ny, nz } = this.aimed;
    const px = x + Math.round(nx);
    const py = y + Math.round(ny);
    const pz = z + Math.round(nz);
    if (py < 1) return;
    if (this.blockAt(px, py, pz) !== null) return;
    // don't place inside the player's own body column
    const feetX = Math.round(this.pos.x / BLOCK);
    const feetZ = Math.round(this.pos.z / BLOCK);
    const feetY = Math.floor((this.pos.y - EYE) / BLOCK);
    if (px === feetX && pz === feetZ && (py === feetY || py === feetY + 1)) return;
    this.edits.set(bkey(px, py, pz), this.selected);
    this.rebuildAround(px, pz);
  }

  // ---- collision helpers ----

  private solidCell(gx: number, gy: number, gz: number): boolean {
    return this.blockAt(gx, gy, gz) !== null;
  }

  // Is the player's body blocked at eye position `eyeY` and x/z? Checks the two
  // cells the ~1.6-block-tall body occupies (feet + head).
  private bodyBlocked(wx: number, eyeY: number, wz: number): boolean {
    const gx = Math.round(wx / BLOCK);
    const gz = Math.round(wz / BLOCK);
    const feetY = Math.floor((eyeY - EYE) / BLOCK);
    const headY = Math.floor((eyeY - EYE + PLAYER_H) / BLOCK);
    return this.solidCell(gx, feetY, gz) || this.solidCell(gx, headY, gz);
  }

  // Topmost solid surface (world Y of its top face) at a world x/z.
  private surfaceY(wx: number, wz: number): number {
    const gx = Math.round(wx / BLOCK);
    const gz = Math.round(wz / BLOCK);
    let top = heightAt(gx, gz, SEED);
    for (let y = top + 8; y >= 0; y--) {
      if (this.blockAt(gx, y, gz) !== null) { top = y; break; }
    }
    return (top + 1) * BLOCK; // top face of the highest block
  }

  private tickSecond() {
    if (this.ended) return;
    this.stats.secondsSurvived += 1;
    this.battery = Math.max(0, this.battery - (4 + this.night));
    if (this.battery <= 0) this.health -= 10;
    if (this.health <= 0) return this.end();
    this.elapsed += 1;
    if (this.elapsed >= this.nightSeconds) {
      this.stats.nightsCleared += 1;
      if (this.night >= 5) return this.end();
      this.night += 1;
      this.elapsed = 0;
      this.battery = 100;
      this.spawnNight();
    }
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.secondTimer += dt;
    if (this.secondTimer >= 1) {
      this.secondTimer -= 1;
      this.tickSecond();
    }
    if (this.ended) return;

    // ---- horizontal movement with collision ----
    const speed = 8 * dt;
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    let nx = this.pos.x;
    let nz = this.pos.z;
    if (this.keys["KeyW"]) { nx -= fwd.x * speed; nz -= fwd.z * speed; }
    if (this.keys["KeyS"]) { nx += fwd.x * speed; nz += fwd.z * speed; }
    if (this.keys["KeyA"]) { nx -= right.x * speed; nz -= right.z * speed; }
    if (this.keys["KeyD"]) { nx += right.x * speed; nz += right.z * speed; }
    if (!this.bodyBlocked(nx, this.pos.y, this.pos.z)) this.pos.x = nx;
    if (!this.bodyBlocked(this.pos.x, this.pos.y, nz)) this.pos.z = nz;

    // ---- vertical physics: gravity + jump + ground/ceiling collision ----
    this.velY -= GRAVITY * dt;
    let nextY = this.pos.y + this.velY * dt;

    const ground = this.surfaceY(this.pos.x, this.pos.z); // top face of terrain
    const feetTargetEye = ground + EYE; // eye height when standing on surface

    if (this.velY <= 0 && nextY <= feetTargetEye) {
      // landed / standing on the surface
      nextY = feetTargetEye;
      this.velY = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
      // ceiling bonk: if head would enter a solid block, stop upward motion
      const headCellY = Math.floor((nextY - EYE + PLAYER_H) / BLOCK);
      const gx = Math.round(this.pos.x / BLOCK);
      const gz = Math.round(this.pos.z / BLOCK);
      if (this.velY > 0 && this.solidCell(gx, headCellY, gz)) {
        this.velY = 0;
        nextY = this.pos.y;
      }
    }
    this.pos.y = nextY;

    this.refreshChunks();

    this.camera.position.set(this.pos.x, this.pos.y, this.pos.z);
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this.camera.lookAt(this.pos.x - dir.x, this.pos.y - dir.y, this.pos.z - dir.z);
    this.lantern.position.copy(this.camera.position);
    this.lantern.intensity = 0.6 + (this.battery / 100) * 2.0;
    this.fog.density = 0.03 + (1 - this.battery / 100) * 0.06;

    this.updateAim();

    for (const cr of this.creatures) {
      const to = new THREE.Vector3(this.pos.x - cr.position.x, 0, this.pos.z - cr.position.z);
      const d = to.length();
      to.normalize();
      cr.position.x += to.x * (cr as any).speed * dt;
      cr.position.z += to.z * (cr as any).speed * dt;
      cr.position.y = this.surfaceY(cr.position.x, cr.position.z) + BLOCK * 0.8;
      cr.rotation.y = Math.atan2(to.x, to.z);
      if (d < 1.6) {
        this.health -= 34;
        this.stats.creaturesEvaded += 1;
        const ang = Math.random() * Math.PI * 2;
        cr.position.set(this.pos.x + Math.cos(ang) * 28, cr.position.y, this.pos.z + Math.sin(ang) * 28);
        if (this.health <= 0) this.end();
      }
    }

    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.rotation.y += dt * 2;
      const baseY = this.surfaceY(it.position.x, it.position.z) + BLOCK * 0.6;
      it.position.y = baseY + Math.sin(performance.now() / 400 + i) * 0.2;
      const dx = it.position.x - this.pos.x;
      const dz = it.position.z - this.pos.z;
      if (Math.hypot(dx, dz) < 1.6) {
        this.battery = Math.min(100, this.battery + 25);
        this.stats.itemsCollected += 1;
        this.scene.remove(it);
        this.items.splice(i, 1);
      }
    }

    const score =
      this.stats.nightsCleared * 1000 +
      this.stats.secondsSurvived * 5 +
      this.stats.creaturesEvaded * 50 +
      this.stats.itemsCollected * 25 +
      this.blocksMined * 10;
    this.onHud({
      night: this.night,
      time: Math.max(0, this.nightSeconds - this.elapsed),
      battery: this.battery,
      health: Math.max(0, this.health),
      score,
      block: this.selected,
    });

    this.renderer.render(this.scene, this.camera);
  };

  private end() {
    if (this.ended) return;
    this.ended = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.onGameOver(this.stats);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    document.removeEventListener("mousemove", this._onMove);
    document.removeEventListener("keydown", this._onDown);
    document.removeEventListener("keyup", this._onUp);
    removeEventListener("resize", this._onResize);
    for (const k of [...this.chunks.keys()]) this.disposeChunk(k);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.mount) {
      this.mount.removeChild(this.renderer.domElement);
    }
  }
}
