document.getElementById("start-button").onclick = () => {
  document.getElementById("start-menu").style.display = "none";
  game.scene.start("game");
};


class PathfindingController {
  constructor(scene, maze) {
    this.scene = scene;
    this.maze = maze;
    this.worker = new Worker("pathfinderWorker.js");
    this.worker.onmessage = (e) => {
      this.scene.onPathFound(e.data);
    };
  }

  requestPath(start, player) {
    this.worker.postMessage({ maze: this.maze, start, player });
  }
}

class BallController {
  constructor(scene, ball, speed) {
    this.scene = scene;
    this.ball = ball;
    this.speed = speed;
    this.path = [];
    this.currentIndex = 0;
    this.target = null;
  }

  setPath(path) {
    this.path = path || [];
    this.currentIndex = 1;
    this.moveToNext();
  }

  moveToNext() {
    if (this.currentIndex >= this.path.length) {
      this.ball.body.setVelocity(0, 0);
      this.target = null;
      return;
    }
    const nextTile = this.path[this.currentIndex];
    this.target = {
      c: nextTile.c,
      r: nextTile.r,
      x: this.scene.centerX(nextTile.c),
      y: this.scene.centerY(nextTile.r),
    };
    this.scene.physics.moveTo(this.ball, this.target.x, this.target.y, this.speed);
  }

  update() {
    if (!this.target) return;
    const dist = Phaser.Math.Distance.Between(
      this.ball.x, this.ball.y, this.target.x, this.target.y
    );
    if (dist < 6) {
      this.ball.setPosition(this.target.x, this.target.y);
      this.ball.body.setVelocity(0, 0);
      this.currentIndex++;
      this.moveToNext();
    }
  }
}

let globalScore = 0;

class MyGame extends Phaser.Scene {
  constructor() {
    super("game");
  }

  preload() {
    this.load.image("tank_left", "assets/tanque/tank_left.png");
    this.load.image("tank_right", "assets/tanque/tank_right.png");
    this.load.image("tank_up", "assets/tanque/tank_up.png");
    this.load.image("tank_down", "assets/tanque/tank_down.png");

    this.load.image("bullet", "https://placehold.co/16x16/00ff00/000000?text=BULLET");
    this.load.image("ball", "https://placehold.co/64x64/e94560/ffffff?text=BALL");

    // Flechas táctiles (si las usas dentro del canvas)
    this.load.image("btnLeft", "assets/ui/flecha_izquierda.png");
    this.load.image("btnRight", "assets/ui/flecha_derecha.png");
    this.load.image("btnUp", "assets/ui/flecha_arriba.png");
    this.load.image("btnDown", "assets/ui/flecha_abajo.png");

    // Botón disparo (si lo usas dentro del canvas)
    this.load.image("btnShoot", "https://placehold.co/64x64/ffcc00/000000?text=FIRE");
  }

  // ---------------------------------------------------
  // Controles táctiles dentro del canvas (robustos)
  // ---------------------------------------------------
  activateTouchControls() {
    const screenW = this.scale.width;
    const screenH = this.scale.height;
    const btnSize = Phaser.Math.Clamp(screenW * 0.12, 48, 72);

    // map pointerId -> action ('left','right','up','down','shoot')
    this.activeTouchActions = this.activeTouchActions || {};

    const createButton = (x, y, texture, action, scale = 1) => {
      const btn = this.add.image(x, y, texture)
        .setInteractive()
        .setDisplaySize(btnSize * scale, btnSize * scale)
        .setAlpha(0.7);

      // pointerdown
      btn.on("pointerdown", (pointer) => {
        const pid = (pointer && (pointer.id !== undefined)) ? pointer.id : (pointer && pointer.pointerId) ? pointer.pointerId : "mouse";
        this.activeTouchActions[pid] = action;
        this.updateTouchState();
        btn.setAlpha(1);
      });

      // pointerup (normal / outside / cancel) -> limpiar el pointer id concreto
      const upHandler = (pointer) => {
        const pid = (pointer && (pointer.id !== undefined)) ? pointer.id : (pointer && pointer.pointerId) ? pointer.pointerId : "mouse";
        delete this.activeTouchActions[pid];
        this.updateTouchState();
        btn.setAlpha(0.7);
      };

      btn.on("pointerup", upHandler);
      btn.on("pointerupoutside", upHandler);
      btn.on("pointercancel", upHandler);

      return btn;
    };

    // posiciones
    const baseX = screenW * 0.15;
    const baseY = screenH * 0.8;

    createButton(baseX - btnSize, baseY, "btnLeft", "left");
    createButton(baseX + btnSize, baseY, "btnRight", "right");
    createButton(baseX, baseY - btnSize, "btnUp", "up");
    createButton(baseX, baseY + btnSize, "btnDown", "down");

    createButton(screenW * 0.85, screenH * 0.8, "btnShoot", "shoot", 1.3);
  }

  // recalcula touchDirection e isShooting según activeTouchActions
  updateTouchState() {
    // elegir cualquier dirección activa si la hay (prioridad por aparición)
    this.touchDirection = null;
    for (const pid in this.activeTouchActions) {
      const a = this.activeTouchActions[pid];
      if (["left","right","up","down"].includes(a)) {
        this.touchDirection = a;
        break;
      }
    }
    // disparo activo si cualquier action === 'shoot'
    this.isShooting = Object.values(this.activeTouchActions).some(v => v === "shoot");
  }

  // ---------------------------------------------------
  // create()
  // ---------------------------------------------------
  create() {
    this.T = 40;
    this.speedTank = 200;
    this.speedBall = 220;
    this.bulletSpeed = 600;

    this.isQuestionActive = false;
    this.lives = 3;

    this.cameras.main.setBackgroundColor("#1a1a40");

    this.walls = this.physics.add.staticGroup();
    this.drawMaze();

    this.tank = this.physics.add.sprite(this.centerX(1), this.centerY(1), "tank_down")
      .setScale(this.T / 40)
      .setCollideWorldBounds(true);
    this.tank.body.setSize(this.T * 0.4, this.T * 0.4, true);

    this.physics.add.collider(this.tank, this.walls);

    // Controles teclado
    this.cursors = this.input.keyboard.createCursorKeys();
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Inicializar estados táctiles/última dirección/cooldown
    this.touchDirection = null;
    this.isShooting = false;
    this.activeTouchActions = {};
    this.shootCooldown = 0;
    this.lastDirection = "up"; // por defecto

    // soporte multi-touch: añadir 2 pointers extra (para que se permita tocar mover + disparar)
    if (this.sys.game.device.input.touch) {
      // agregar 2 pointers extra -> soporte hasta 3 punteros
      this.input.addPointer(2);
      this.activateTouchControls();
    }

    // ⚽ Bola
    this.ball = this.physics.add.image(this.centerX(19), this.centerY(10), "ball")
      .setScale(0.36).setCollideWorldBounds(true);
    this.ball.body.setSize(this.T * 0.7, this.T * 0.7, true);
    this.physics.add.collider(this.ball, this.walls, this.onBallHitWall, null, this);

    // 💥 Balas
    this.bulletGroup = this.physics.add.group();
    this.physics.add.collider(this.bulletGroup, this.walls, (bullet) => bullet.destroy());
    this.bulletBallCollider = this.physics.add.collider(
      this.bulletGroup, this.ball, this.onBulletHitsBall, null, this
    );

    this.pathfindingController = new PathfindingController(this, maze);
    this.ballController = new BallController(this, this.ball, this.speedBall);

    this.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => this.updateFleePath(true),
    });

    // 🟡 HUD
    this.score = globalScore;
    this.scoreText = this.add.text(700, 10, "Puntos: " + this.score, { fontSize: "20px", fill: "#fff" });
    this.livesText = this.add.text(700, 40, "Vidas: " + this.lives, { fontSize: "20px", fill: "#fff" });
    this.totalTime = 600;
    this.timerText = this.add.text(10, 10, "Tiempo: 10:00", { fontSize: "20px", fill: "#fff" });

    // 🎨 estilo caricaturesco
    this.scoreText.setStyle({ fontSize: "22px", fill: "#ffcc00", fontFamily: "Comic Sans MS" });
    this.livesText.setStyle({ fontSize: "22px", fill: "#ff6666", fontFamily: "Comic Sans MS" });
    this.timerText.setStyle({ fontSize: "22px", fill: "#66ffcc", fontFamily: "Comic Sans MS" });

    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.isQuestionActive) return;
        this.totalTime--;
        const m = Math.floor(this.totalTime / 60);
        const s = this.totalTime % 60;
        this.timerText.setText(`Tiempo: ${m}:${s.toString().padStart(2, "0")}`);
        if (this.totalTime <= 0) this.endGame();
      },
    });

    this.questionsAsked = new Set();
  }

  // ---------- UTILIDADES ----------
  centerX(c) { return c * this.T + this.T / 2; }
  centerY(r) { return r * this.T + this.T / 2; }
  toCol(x) { return Math.floor(x / this.T); }
  toRow(y) { return Math.floor(y / this.T); }
  isWalkable(c, r) { return r >= 0 && r < maze.length && c >= 0 && c < maze[0].length && maze[r][c] === 0; }
  getTile(x, y) { return { c: this.toCol(x), r: this.toRow(y) }; }

  drawMaze() {
    for (let r = 0; r < maze.length; r++) {
      for (let c = 0; c < maze[r].length; c++) {
        if (maze[r][c] === 1) {
          const x = this.centerX(c);
          const y = this.centerY(r);

          const wall = this.add.rectangle(x, y, this.T, this.T, 0x2aa9ff);
          this.physics.add.existing(wall, true);

          wall.body.setSize(this.T * 0.95, this.T * 0.95);
          wall.body.setOffset(this.T * 0.025, this.T * 0.025);

          this.walls.add(wall);
        }
      }
    }
  }

  update() {
    if (this.isQuestionActive) return;

    // Reset velocidades
    this.tank.body.setVelocity(0);

    // Primero movimiento (touchDirection tiene prioridad si existe)
    const dir = this.touchDirection || (
      this.cursors.left.isDown ? "left" :
      this.cursors.right.isDown ? "right" :
      this.cursors.up.isDown ? "up" :
      this.cursors.down.isDown ? "down" : null
    );

    if (dir === "left") {
      if (this.tank.texture.key !== "tank_left") this.tank.setTexture("tank_left");
      this.tank.body.setVelocityX(-this.speedTank);
      this.lastDirection = "left";
    } else if (dir === "right") {
      if (this.tank.texture.key !== "tank_right") this.tank.setTexture("tank_right");
      this.tank.body.setVelocityX(this.speedTank);
      this.lastDirection = "right";
    } 

    if (dir === "up") {
      if (this.tank.texture.key !== "tank_up") this.tank.setTexture("tank_up");
      this.tank.body.setVelocityY(-this.speedTank);
      this.lastDirection = "up";
    } else if (dir === "down") {
      if (this.tank.texture.key !== "tank_down") this.tank.setTexture("tank_down");
      this.tank.body.setVelocityY(this.speedTank);
      this.lastDirection = "down";
    }

    // Disparo teclado (único pulso)
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) this.shoot();

    // Disparo táctil (si el usuario mantiene pulsado el botón shoot)
    if (this.isShooting && !this.isQuestionActive) {
      if (!this.shootCooldown || this.time.now > this.shootCooldown) {
        this.shoot();
        this.shootCooldown = this.time.now + 300; // 300ms entre disparos
      }
    }

    // Actualizar bola
    this.ballController.update();
  }

  // helper para el botón de disparo (si necesitas call desde HTML)
  handleShoot() {
    if (!this.isQuestionActive) {
      this.shoot();
    }
  }

  shoot() {
    const bullet = this.bulletGroup.create(this.tank.x, this.tank.y, "bullet");
    bullet.setScale(0.8);
    bullet.body.setSize(8, 8, true);

    // calcular dirección: primero por velocidad, si 0 usar lastDirection
    let direction = new Phaser.Math.Vector2(0, -1);
    if (this.tank.body.velocity.lengthSq() > 0) {
      direction.set(this.tank.body.velocity.x, this.tank.body.velocity.y).normalize();
    } else {
      if (this.lastDirection === "left") direction.set(-1, 0);
      else if (this.lastDirection === "right") direction.set(1, 0);
      else if (this.lastDirection === "down") direction.set(0, 1);
      else direction.set(0, -1); // up por defecto
    }

    bullet.body.setVelocity(direction.x * this.bulletSpeed, direction.y * this.bulletSpeed);

    // animación / limpieza (opcional)
    this.tweens.add({
      targets: bullet,
      scale: 1.2,
      alpha: 0.5,
      duration: 200,
      yoyo: true,
      ease: "Power1"
    });

    // destruir tras tiempo si quieres
    this.time.delayedCall(2500, () => {
      if (bullet && bullet.body) bullet.destroy();
    });
  }

  onBallHitWall() {
    this.ball.body.setVelocity(0, 0);
    const tile = this.getTile(this.ball.x, this.ball.y);
    this.ball.setPosition(this.centerX(tile.c), this.centerY(tile.r));
    this.updateFleePath(true);
  }

  onBulletHitsBall(bullet, ball) {
    if (this.isQuestionActive) return;
    bullet.destroy();
    this.showQuestion();
  }

  updateFleePath(force = false) {
    if (!force) return;
    const ballTile = this.getTile(this.ball.x, this.ball.y);
    const playerTile = this.getTile(this.tank.x, this.tank.y);
    this.pathfindingController.requestPath(ballTile, playerTile);
  }

  onPathFound(path) {
    if (path && path.length > 1) this.ballController.setPath(path);
  }

  // ---------- QUIZ ----------
  showQuestion() {
    this.isQuestionActive = true;
    this.physics.world.pause();

    const oldOverlay = document.getElementById("question-overlay");
    if (oldOverlay) oldOverlay.remove();

    let available = questions.filter((_, i) => !this.questionsAsked.has(i));
    if (available.length === 0) {
      alert("🎉 ¡Ya respondiste todas las preguntas!");
      this.isQuestionActive = false;
      this.physics.world.resume();
      return;
    }

    let index = Phaser.Math.Between(0, available.length - 1);
    let q = available[index];
    this.questionsAsked.add(questions.indexOf(q));

    const overlay = document.createElement("div");
    overlay.id = "question-overlay";
    overlay.style = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      background:rgba(0,0,0,0.8);color:#fff;display:flex;
      flex-direction:column;justify-content:center;align-items:center;
      z-index:9999;
    `;
    const questionText = document.createElement("h2");
    questionText.innerText = q.q;
    overlay.appendChild(questionText);

    q.options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.innerText = opt;
      btn.style.margin = "6px";
      btn.onclick = () => {
        let feedback = document.createElement("p");
        if (i === q.correct) {
          this.score++;
          this.scoreText.setText("Puntos: " + this.score);
          feedback.innerText = "✅ Correcto!";
        } else {
          this.lives--;
          this.livesText.setText("Vidas: " + this.lives);
          feedback.innerText = `❌ Incorrecto! Respuesta: ${q.options[q.correct]}`;
        }
        overlay.appendChild(feedback);
        setTimeout(() => this.closeQuestion(), 2000);
      };
      overlay.appendChild(btn);
    });

    document.body.appendChild(overlay);
  }

  closeQuestion() {
    const overlay = document.getElementById("question-overlay");
    if (overlay) overlay.remove();

    this.isQuestionActive = false;
    this.physics.world.resume();

    if (this.lives <= 0) {
      this.endGame();
    } else {
      this.reviveBallRandom();
    }
  }

  reviveBallRandom() {
    const playerTile = this.getTile(this.tank.x, this.tank.y);
    let c, r;
    do {
      r = Phaser.Math.Between(0, maze.length - 1);
      c = Phaser.Math.Between(0, maze[0].length - 1);
    } while (
      !this.isWalkable(c, r) ||
      Phaser.Math.Distance.Between(c, r, playerTile.c, playerTile.r) < 5
    );

    this.bulletGroup.clear(true, true);

    if (this.ball) this.ball.destroy();

    this.ball = this.physics.add.image(this.centerX(c), this.centerY(r), "ball")
      .setScale(0).setCollideWorldBounds(true);
    this.ball.body.setSize(28, 28, true);

    this.tweens.add({
      targets: this.ball,
      scale: 0.36,
      duration: 300,
      ease: "Back.Out"
    });

    this.physics.add.collider(this.ball, this.walls, this.onBallHitWall, null, this);
    this.physics.add.collider(this.bulletGroup, this.ball, this.onBulletHitsBall, null, this);

    this.ballController = new BallController(this, this.ball, this.speedBall);
    this.updateFleePath(true);
  }

  endGame() {
    this.scene.pause();

    const menu = document.getElementById("game-over-menu");
    const scoreText = document.getElementById("final-score");
    scoreText.innerText = `Tu puntuación final fue: ${this.score}`;
    menu.style.display = "flex";

    document.getElementById("restart-button").onclick = () => {
      menu.style.display = "none";
      globalScore = 0;
      this.scene.restart();
    };
  }
}

const config = {
  type: Phaser.AUTO,
  backgroundColor: "#000033",
  physics: {
    default: "arcade",
    arcade: { debug: false, fps: 60 }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
    width: 840,
    height: 600
  },
  scene: MyGame,
};

const game = new Phaser.Game(config);
