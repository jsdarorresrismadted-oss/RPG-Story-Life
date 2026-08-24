import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { api } from "../lib/api";
import Phaser from "phaser";

const GameScene = new Phaser.Class({
  Extends: Phaser.Scene,
  initialize: function() {
    Phaser.Scene.call(this, { key: "GameScene" });
  },

  preload() {
    // Load assets
    this.load.image("tiles", "/assets/tiles.png");
    this.load.spritesheet("player", "/assets/player.png", { frameWidth: 32, frameHeight: 32 });
    this.load.image("npc", "/assets/npc.png");
    this.load.image("monster", "/assets/monster.png");
  },

  create() {
    // Create tilemap
    const map = this.make.tilemap({ key: "map" });
    const tileset = map.addTilesetImage("tileset", "tiles");
    const groundLayer = map.createLayer("Ground", tileset, 0, 0);
    const collisionLayer = map.createLayer("Collision", tileset, 0, 0);
    collisionLayer.setCollisionByProperty({ collides: true });

    // Player
    this.player = this.physics.add.sprite(400, 300, "player");
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, collisionLayer);

    // Camera follow player
    this.cameras.main.startFollow(this.player);
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys("W,A,S,D");

    // NPC interactions
    this.npcs = this.physics.add.group();
    // ... load NPCs from server
  },

  update() {
    if (!this.player) return;

    const speed = 160;
    this.player.setVelocity(0);

    if (this.cursors.left.isDown || this.wasd.A.isDown) {
      this.player.setVelocityX(-speed);
      this.player.anims.play("left", true);
    } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
      this.player.setVelocityX(speed);
      this.player.anims.play("right", true);
    } else if (this.cursors.up.isDown || this.wasd.W.isDown) {
      this.player.setVelocityY(-speed);
      this.player.anims.play("up", true);
    } else if (this.cursors.down.isDown || this.wasd.S.isDown) {
      this.player.setVelocityY(speed);
      this.player.anims.play("down", true);
    } else {
      this.player.anims.play("turn");
    }
  },
});

export function GamePage() {
  const { selectedCharacter, token } = useAuthStore();
  const [gameInstance, setGameInstance] = useState<Phaser.Game | null>(null);
  const [loading, setLoading] = useState(true);
  const gameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedCharacter) return;

    const initGame = async () => {
      try {
        // Fetch map data
        const { data: mapData } = await api.get(`/api/maps/active`);
        
        const config: Phaser.Types.Core.GameConfig = {
          type: Phaser.AUTO,
          parent: gameRef.current!,
          width: window.innerWidth,
          height: window.innerHeight,
          physics: {
            default: "arcade",
            arcade: { gravity: { y: 0 }, debug: false },
          },
          scene: [GameScene],
          scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
        };

        const game = new Phaser.Game(config);
        setGameInstance(game);
        setLoading(false);
      } catch (err) {
        console.error("Failed to init game:", err);
        setLoading(false);
      }
    };

    initGame();

    return () => {
      if (gameInstance) {
        gameInstance.destroy(true);
      }
    };
  }, [selectedCharacter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-yellow-400 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen" ref={gameRef} />
  );
}