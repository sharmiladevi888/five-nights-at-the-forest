# Game engine

`VoxelForest.ts` is a self-contained first-person 3D voxel survival engine
built on Three.js. It replaces the earlier 2D Phaser prototype.

- **Controls:** click to lock the pointer, WASD to move, mouse to look, Esc to release.
- **Loop:** 5 escalating nights; lantern battery drains and fog thickens as it dies; blocky creatures hunt the player; battery pickups restore light and add score.
- **Integration:** `start(mount)` renders into a DOM element; `dispose()` tears everything down. Reports HUD state and final `RunStats` via callbacks so React stays in control of scoring/submission.

## Not yet (future layers)
- Infinite procedural terrain
- Block breaking / placing
- Multiplayer
- Textured block atlas + custom models
