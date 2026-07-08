import * as THREE from "three";
import type { RunStats } from "@/lib/score";

// First-person 3D voxel survival. Pointer-lock mouse look + WASD movement
// across a blocky forest of cube-trunk/leaf trees. A head-mounted lantern
// lights the dark; battery drains and the fog closes in as it dies.
// Blocky creatures path toward you and drain health on contact. Survive the
// per-night timer to advance; 5 escalating nights. This is a self-contained
// engine class: call start(mount) to run, dispose() to tear down.

const WORLD = 64; // world half-extent in blocks
const BLOCK = 2; // block size in world units

export class VoxelForest {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private lantern!: THREE.PointLight;
  private fog!: THREE.FogExp2;

  private creatures: THREE.Mesh[] = [];
  private items: THREE.Mesh[] = [];
  private colliders: THREE.Box3[] = [];

  private keys: Record<string, boolean> = {};
  private yaw = 0;
  private pitch = 0;
  private velocityY = 0;
  private pos = new THREE.Vector3(0, 3, 0);

  private night = 1;
  private battery = 100;
  private health = 100;
  private nightSeconds = 45;
  private elapsed = 0;
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

  private onGameOver: (s: RunStats) => void;
  private onHud: (h: {
    night: number;
    time: number;
    battery: number;
    health: number;
    score: number;
  }) => void;

  constructor(
    onGameOver: (s: RunStats) => void,
    onHud: (h: any) => void
  ) {
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
    this.renderer.shadowMap.enabled = false;
    mount.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05080b);
    this.fog = new THREE.FogExp2(0x05080b, 0.045);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(72, w / h, 0.1, 500);

    // dim moonlight ambient so it's never pitch black
    this.scene.add(new THREE.AmbientLight(0x223044, 0.5));
    const moon = new THREE.DirectionalLight(0x4a6a8a, 0.25);
    moon.position.set(-1, 2, 1);
    this.scene.add(moon);

    // lantern rides with the camera
    this.lantern = new THREE.PointLight(0xffca6a, 2.2, 26, 1.6);
    this.scene.add(this.lantern);

    this.buildGround();
    this.buildForest();
    this.spawnNight();

    this.bindInput();
    this.clock.start();
    this.loop();
  }

  private buildGround() {
    const geo = new THREE.PlaneGeometry(WORLD * BLOCK * 2, WORLD * BLOCK * 2);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x10231a });
    const ground = new THREE.Mesh(geo, mat);
    ground.position.y = 0;
    this.scene.add(ground);

    // scatter a few darker "dirt" blocks for texture underfoot
    const dirtGeo = new THREE.BoxGeometry(BLOCK, BLOCK * 0.4, BLOCK);
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x0c1a12 });
    const dirt = new THREE.InstancedMesh(dirtGeo, dirtMat, 120);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 120; i++) {
      const x = (Math.random() * 2 - 1) * WORLD * BLOCK;
      const z = (Math.random() * 2 - 1) * WORLD * BLOCK;
      m.setPosition(x, 0.2, z);
      dirt.setMatrixAt(i, m);
    }
    this.scene.add(dirt);
  }

  private buildForest() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2616 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1c3b25 });
    const trunkGeo = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
    const leafGeo = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);

    // build ~90 blocky trees: 3-4 stacked trunk cubes + a 3x3 leaf cap
    for (let t = 0; t < 90; t++) {
      const bx = Math.round((Math.random() * 2 - 1) * (WORLD - 2)) * BLOCK;
      const bz = Math.round((Math.random() * 2 - 1) * (WORLD - 2)) * BLOCK;
      if (Math.abs(bx) < 6 && Math.abs(bz) < 6) continue; // keep spawn clear
      const trunkH = 3 + Math.floor(Math.random() * 2);
      for (let y = 0; y < trunkH; y++) {
        const c = new THREE.Mesh(trunkGeo, trunkMat);
        c.position.set(bx, BLOCK * (y + 0.5), bz);
        this.scene.add(c);
        if (y === 0) this.colliders.push(new THREE.Box3().setFromObject(c));
      }
      // leaf cap (3x3x2)
      for (let lx = -1; lx <= 1; lx++)
        for (let lz = -1; lz <= 1; lz++)
          for (let ly = 0; ly < 2; ly++) {
            const c = new THREE.Mesh(leafGeo, leafMat);
            c.position.set(
              bx + lx * BLOCK,
              BLOCK * (trunkH + 0.5 + ly),
              bz + lz * BLOCK
            );
            this.scene.add(c);
          }
    }
  }

  private spawnNight() {
    // clear previous
    for (const c of this.creatures) this.scene.remove(c);
    for (const it of this.items) this.scene.remove(it);
    this.creatures = [];
    this.items = [];

    const count = 2 + this.night;
    const geo = new THREE.BoxGeometry(BLOCK * 0.9, BLOCK * 1.6, BLOCK * 0.9);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x140606,
        emissive: 0x330000,
        emissiveIntensity: 0.6,
      });
      const cr = new THREE.Mesh(geo, mat);
      const ang = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 30;
      cr.position.set(Math.cos(ang) * dist, BLOCK * 0.8, Math.sin(ang) * dist);
      // glowing red eyes
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

    // battery pickups
    const itemGeo = new THREE.BoxGeometry(BLOCK * 0.5, BLOCK * 0.5, BLOCK * 0.5);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffd166,
        emissive: 0xffb020,
        emissiveIntensity: 0.8,
      });
      const it = new THREE.Mesh(itemGeo, mat);
      it.position.set(
        (Math.random() * 2 - 1) * 40,
        BLOCK * 0.6,
        (Math.random() * 2 - 1) * 40
      );
      this.scene.add(it);
      this.items.push(it);
    }
  }

  private bindInput() {
    const el = this.renderer.domElement;
    el.addEventListener("click", () => el.requestPointerLock());
    this._onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== el) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch));
    };
    this._onDown = (e: KeyboardEvent) => (this.keys[e.code] = true);
    this._onUp = (e: KeyboardEvent) => (this.keys[e.code] = false);
    document.addEventListener("mousemove", this._onMove);
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
  private _onDown!: (e: KeyboardEvent) => void;
  private _onUp!: (e: KeyboardEvent) => void;
  private _onResize!: () => void;

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

  private collides(nx: number, nz: number): boolean {
    const r = 0.8;
    const box = new THREE.Box3(
      new THREE.Vector3(nx - r, 0, nz - r),
      new THREE.Vector3(nx + r, BLOCK, nz + r)
    );
    for (const c of this.colliders) if (c.intersectsBox(box)) return true;
    return false;
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

    // movement
    const speed = 8 * dt;
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    let nx = this.pos.x;
    let nz = this.pos.z;
    if (this.keys["KeyW"]) { nx -= fwd.x * speed; nz -= fwd.z * speed; }
    if (this.keys["KeyS"]) { nx += fwd.x * speed; nz += fwd.z * speed; }
    if (this.keys["KeyA"]) { nx -= right.x * speed; nz -= right.z * speed; }
    if (this.keys["KeyD"]) { nx += right.x * speed; nz += right.z * speed; }
    if (!this.collides(nx, this.pos.z)) this.pos.x = nx;
    if (!this.collides(this.pos.x, nz)) this.pos.z = nz;
    this.pos.x = Math.max(-WORLD * BLOCK, Math.min(WORLD * BLOCK, this.pos.x));
    this.pos.z = Math.max(-WORLD * BLOCK, Math.min(WORLD * BLOCK, this.pos.z));

    // camera + lantern
    this.camera.position.set(this.pos.x, this.pos.y, this.pos.z);
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this.camera.lookAt(
      this.pos.x - dir.x,
      this.pos.y - dir.y,
      this.pos.z - dir.z
    );
    this.lantern.position.copy(this.camera.position);
    this.lantern.intensity = 0.6 + (this.battery / 100) * 2.0;
    // fog thickens as battery dies
    this.fog.density = 0.03 + (1 - this.battery / 100) * 0.06;

    // creatures hunt
    for (const cr of this.creatures) {
      const to = new THREE.Vector3(
        this.pos.x - cr.position.x,
        0,
        this.pos.z - cr.position.z
      );
      const d = to.length();
      to.normalize();
      cr.position.x += to.x * (cr as any).speed * dt;
      cr.position.z += to.z * (cr as any).speed * dt;
      cr.rotation.y = Math.atan2(to.x, to.z);
      if (d < 1.6) {
        this.health -= 34;
        this.stats.creaturesEvaded += 1;
        // knock the creature back out
        const ang = Math.random() * Math.PI * 2;
        cr.position.set(
          this.pos.x + Math.cos(ang) * 35,
          BLOCK * 0.8,
          this.pos.z + Math.sin(ang) * 35
        );
        if (this.health <= 0) this.end();
      }
    }

    // item pickups + gentle spin/bob
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.rotation.y += dt * 2;
      it.position.y = BLOCK * 0.6 + Math.sin(performance.now() / 400 + i) * 0.2;
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
      this.stats.itemsCollected * 25;
    this.onHud({
      night: this.night,
      time: Math.max(0, this.nightSeconds - this.elapsed),
      battery: this.battery,
      health: Math.max(0, this.health),
      score,
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
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.mount) {
      this.mount.removeChild(this.renderer.domElement);
    }
  }
}
