import Phaser from "phaser";
import type { RunStats } from "@/lib/score";
import { buildSprites } from "./sprites";

// A compact but real survival loop: block/voxel-styled top-down forest.
// Player moves with WASD/arrows, battery drains, creatures hunt you,
// items restore battery and add score. Survive the timer to clear a night;
// 5 nights escalate. Getting caught = game over.
export class ForestScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Image;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private creatures!: Phaser.Physics.Arcade.Group;
  private items!: Phaser.Physics.Arcade.Group;

  private night = 1;
  private battery = 100;
  private health = 100;
  private nightSeconds = 45; // seconds to survive per night
  private elapsed = 0;
  private stats: RunStats = {
    nightsCleared: 0,
    secondsSurvived: 0,
    creaturesEvaded: 0,
    itemsCollected: 0,
  };
  private hud!: Phaser.GameObjects.Text;
  private darkness!: Phaser.GameObjects.Rectangle;
  private onGameOver: (stats: RunStats) => void;
  private gameEnded = false;

  constructor(onGameOver: (stats: RunStats) => void) {
    super("ForestScene");
    this.onGameOver = onGameOver;
  }

  create() {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor("#0b1410");

    // Build all pixel-art textures before spawning anything.
    buildSprites(this);

    // scatter voxel trees for atmosphere
    for (let i = 0; i < 40; i++) {
      const x = Phaser.Math.Between(20, width - 20);
      const y = Phaser.Math.Between(20, height - 20);
      this.add.image(x, y, "tree").setDepth(1);
    }

    // player
    this.player = this.physics.add.image(width / 2, height / 2, "player");
    this.player.setCollideWorldBounds(true).setDepth(5);

    this.creatures = this.physics.add.group();
    this.items = this.physics.add.group();
    this.spawnNight();

    this.physics.add.overlap(this.player, this.creatures, () => this.caught());
    this.physics.add.overlap(this.player, this.items, (_p, item) =>
      this.collectItem(item as Phaser.Physics.Arcade.Image)
    );

    // input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D") as any;

    // darkness overlay driven by battery
    this.darkness = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0)
      .setDepth(10);

    this.hud = this.add
      .text(10, 10, "", { fontFamily: "monospace", fontSize: "14px", color: "#5fae7e" })
      .setDepth(20);

    // battery drain + timers
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tick() });
  }

  private spawnNight() {
    const { width, height } = this.scale;
    const count = 2 + this.night; // more creatures each night
    const speed = 40 + this.night * 12; // faster each night
    for (let i = 0; i < count; i++) {
      const c = this.physics.add.image(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        "creature"
      );
      c.setCollideWorldBounds(true).setDepth(4);
      (c as any).speed = speed;
      this.creatures.add(c);
    }
    for (let i = 0; i < 3; i++) {
      const it = this.physics.add.image(
        Phaser.Math.Between(20, width - 20),
        Phaser.Math.Between(20, height - 20),
        "item"
      );
      it.setDepth(3);
      this.items.add(it);
    }
  }

  private tick() {
    if (this.gameEnded) return;
    this.elapsed += 1;
    this.stats.secondsSurvived += 1;
    this.battery = Math.max(0, this.battery - (4 + this.night));
    if (this.battery <= 0) this.health -= 10;
    if (this.health <= 0) return this.endGame();

    if (this.elapsed >= this.nightSeconds) {
      // night cleared
      this.stats.nightsCleared += 1;
      if (this.night >= 5) return this.endGame();
      this.night += 1;
      this.elapsed = 0;
      this.battery = 100;
      this.spawnNight();
    }
  }

  private collectItem(item: Phaser.Physics.Arcade.Image) {
    item.destroy();
    this.battery = Math.min(100, this.battery + 25);
    this.stats.itemsCollected += 1;
  }

  private caught() {
    this.health -= 34;
    // knockback: respawn creatures away
    this.creatures.children.each((c: any) => {
      c.x = Phaser.Math.Between(0, this.scale.width);
      c.y = Phaser.Math.Between(0, this.scale.height);
      return true;
    });
    this.stats.creaturesEvaded += 1;
    if (this.health <= 0) this.endGame();
  }

  private endGame() {
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.physics.pause();
    this.onGameOver(this.stats);
  }

  update() {
    if (this.gameEnded) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const speed = 160;
    body.setVelocity(0);

    if (this.cursors.left.isDown || this.keys.A.isDown) body.setVelocityX(-speed);
    else if (this.cursors.right.isDown || this.keys.D.isDown) body.setVelocityX(speed);
    if (this.cursors.up.isDown || this.keys.W.isDown) body.setVelocityY(-speed);
    else if (this.cursors.down.isDown || this.keys.S.isDown) body.setVelocityY(speed);

    // creatures hunt the player
    this.creatures.children.each((c: any) => {
      this.physics.moveToObject(c, this.player, c.speed);
      return true;
    });

    // darkness grows as battery drops
    const dark = 1 - this.battery / 100;
    this.darkness.setFillStyle(0x000000, dark * 0.75);

    const score =
      this.stats.nightsCleared * 1000 +
      this.stats.secondsSurvived * 5 +
      this.stats.creaturesEvaded * 50 +
      this.stats.itemsCollected * 25;

    this.hud.setText(
      `NIGHT ${this.night}/5   TIME ${this.nightSeconds - this.elapsed}s\n` +
        `BATTERY ${this.battery}%   HP ${Math.max(0, this.health)}\n` +
        `SCORE ${score}`
    );
  }
}
