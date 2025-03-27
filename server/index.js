import { randomUUID } from 'crypto';
import parser from 'socket.io-msgpack-parser';
import { Server } from 'socket.io';
import fs from 'fs';
const sheet = JSON.parse(fs.readFileSync("../assets/sheet.json"));

const io = new Server({ cors: { origin: '*' }, parser });

const PORT = process.env.PORT || 3000;

const tanks = [
  sheet.tankBeige,
  sheet.tankBlack,
  sheet.tankBlue,
  sheet.tankGreen,
  sheet.tankRed,
  sheet.tankBeige_outline,
  sheet.tankBlack_outline,
  sheet.tankBlue_outline,
  sheet.tankGreen_outline,
  sheet.tankRed_outline
];

const barrels = [
  sheet.barrelBeige,
  sheet.barrelBlack,
  sheet.barrelBlue,
  sheet.barrelGreen,
  sheet.barrelRed,
  sheet.barrelBeige_outline,
  sheet.barrelBlack_outline,
  sheet.barrelBlue_outline,
  sheet.barrelGreen_outline,
  sheet.barrelRed_outline
];

const bullet = sheet.bulletBeigeSilver_outline;
const objects = [sheet.treeSmall, sheet.treeLarge, sheet.barrelGreen_up, sheet.barrelGrey_up, sheet.barrelRed_up];
const scale = 0.5;

const { cos, sin, PI, random, floor, abs, hypot } = Math;

class WorldObject {
  constructor(x, y, index) {
    this.x = x;
    this.y = y;
    this.angle = random() * PI * 2;
    this.w = objects[index].width * scale;
    this.h = objects[index].height * scale;
    this.index = index;
  }
}

class Smoke {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.angle = random() * PI * 2;
    this.sizes = [
      sheet.smokeGrey3,
      sheet.smokeGrey2,
      sheet.smokeGrey1
    ].map(e => ({ ...e, width: e.width * scale, height: e.height * scale }))
  }
}

class Bullet {
  constructor(x, y, angle, owner) {
    this.x = x;
    this.y = y;
    this.w = bullet.width * scale;
    this.h = bullet.height * scale;
    this.angle = angle;
    this.speed = 15;
    this.owner = owner;
    this.disable = false;
  }
  update() {
    this.x += sin(this.angle) * this.speed;
    this.y -= cos(this.angle) * this.speed;
    let m = abs(hypot(320 - this.x, 240 - this.y));
    if (m > 1000) {
      this.disable = true;
    }
  }
}

class Player {
  constructor(id) {
    let index = floor(random() * tanks.length);
    this.id = id;
    this.x = floor(random() * (640 - tanks[index].width));
    this.y = floor(random() * (480 - tanks[index].height));
    this.w = tanks[index].width * scale;
    this.h = tanks[index].height * scale;
    this.angle = random() * PI * 2;

    this.sprite = index;
    this.kills = 0;
    this.destroyed = false;
    this.speed = 5;
    this.rotatespeed = 5;
    this.shotDelay = 750;
    this.life = 1;
    this.keys = [];
    this.shotLastTime = 0;
    this.barrel = { sprite: index, w: barrels[index].width * scale, h: barrels[index].height * scale, angle: 0 };
    this.deadTime = 0;
  }
  respawn() {
    this.x = floor(random() * (640 - this.w));
    this.y = floor(random() * (480 - this.h));
    this.angle = Math.random() * PI * 2;
    this.destroyed = false;
    this.life = 1;
  }
}

class Room {
  constructor() {
    this.id = randomUUID();
    /** @type {Player[]} */
    this.players = [];
    /** @type {Bullet[]} */
    this.shots = [];
    /** @type {Smoke[]} */
    this.smokes = [];
    /** @type {Tree[]} */
    this.objects = [];
    this.terrain = floor(random() * 3);
    for (let i = 0; i < 12; i++) {
      this.objects.push(new WorldObject(random() * 640, random() * 480, floor(random() * objects.length)))
    }
  }
  /** @param {Player} player  */
  checkBounds(player) {
    if (player.x + player.h > 640) {
      player.x = 640 - player.h;
    }
    if (player.x < 0) {
      player.x = 0;
    } if (player.y + player.h > 480) {
      player.y = 480 - player.h;
    } if (player.y < 0) {
      player.y = 0;
    }
  }
  isOverlap(a, b) {
    return hypot((a.x + a.h / 2) - (b.x + b.h / 2), a.y + a.h / 2 - (b.y + b.h / 2)) < (a.h + b.h) / 2;
  }
  checkCollisions(player) {
    return this.objects.some(t => this.isOverlap(player, t) || this.players.filter(t => t != player).some(t => this.isOverlap(player, t)));
  }
  update() {
    let actions = {
      KeyW: (player) => {
        player.x += sin(player.angle) * player.speed;
        player.y -= cos(player.angle) * player.speed;
        this.checkBounds(player);
        if (this.checkCollisions(player)) {
          player.x -= sin(player.angle) * player.speed;
          player.y += cos(player.angle) * player.speed;
        }
      },
      KeyS: (player) => {
        player.x -= sin(player.angle) * player.speed;
        player.y += cos(player.angle) * player.speed;
        this.checkBounds(player);
        if (this.checkCollisions(player)) {
          player.x += sin(player.angle) * player.speed;
          player.y -= cos(player.angle) * player.speed;
        }
      },
      KeyA: (player) => {
        player.angle -= player.rotatespeed * PI / 180;
      },
      KeyD: (player) => {
        player.angle += player.rotatespeed * PI / 180;
      },
      KeyZ: (player) => {
        player.barrel.angle -= player.rotatespeed * PI / 180;
      },
      KeyX: (player) => {
        player.barrel.angle += player.rotatespeed * PI / 180;
      },
      Space: (player) => {
        if (Date.now() - player.shotLastTime > player.shotDelay) {
          let bangle = player.barrel.angle + player.angle;
          let bullet = new Bullet();
          bullet.x = (player.x + player.w / 2) - bullet.w / 2 + sin(bangle) * player.barrel.h;
          bullet.y = (player.y + player.h / 2) - bullet.h / 2 - cos(bangle) * player.barrel.h;
          bullet.angle = bangle;
          bullet.owner = player;
          this.shots.push(bullet);
          this.smokes.push(new Smoke(bullet.x + bullet.w / 2, bullet.y + bullet.h / 2));
          player.shotLastTime = Date.now();
        }
      }
    }

    this.players.forEach(player => {
      if (!player.destroyed) {
        player.keys.forEach(key => { actions[key]?.(player) })
      }
      player.keys = [];
    });

    this.shots.forEach(shot => {
      shot.update();

      if (!shot.disable) {
        this.players.find(player => {
          if (shot.owner != player && !player.destroyed && player.x + player.w > shot.x && player.x < shot.x + shot.w && player.y + player.h > shot.y && player.y < shot.y + shot.h) {
            player.life -= 0.25;
            if (player.life <= 0) {
              shot.owner.kills += 1;
              player.life = 0;
              player.destroyed = true;
              player.deadTime = Date.now();
              let randomSize = 5 + floor(random() * 10);
              for (let i = 0; i < randomSize; i++) {
                let x = (player.x + player.w / 2) + floor(10 - random() * 10);
                let y = (player.y + player.h / 2) + floor(10 - random() * 10);
                this.smokes.push(new Smoke(x, y));
              }
            }
            shot.disable = true;
            this.smokes.push(new Smoke(shot.x - shot.w / 2, shot.y - shot.h / 2));
          }
        });

        this.objects.forEach(o => {
          if (o.x + o.w > shot.x && o.x < shot.x + shot.w && o.y + o.h > shot.y && o.y < shot.y + shot.h) {
            shot.disable = true;
            this.smokes.push(new Smoke(shot.x - shot.w / 2, shot.y - shot.h / 2));
          }
        })
      }
    });

    this.shots = this.shots.filter(shot => !shot.disable);

    if (this.players.some(e => e.destroyed)) {
      this.players.filter(e => e.destroyed && Date.now() - e.deadTime >= 3000).forEach(e => {

        e.respawn();
        while (this.checkCollisions(e)) {
          e.respawn();
        }
      })
    }

    io.to(this.id).emit('update', {
      players: this.players,
      shots: this.shots,
      smokes: this.smokes,
      objects: this.objects
    });

    this.smokes = [];
  }
}

/** @type {Room[]} */
let rooms = [];

const gameLoop = () => {
  rooms.forEach(room => room.update());
  setTimeout(gameLoop, 1000 / 30);
}

gameLoop();

io.on('connection', socket => {
  let room = rooms.find(e => e.players.length < 4);

  if (!room) {
    room = new Room();
    rooms.push(room);
  }

  let player = new Player(socket.id);
  while (room.checkCollisions(player)) {
    player.respawn();
  }
  room.players.push(player);
  socket.join(room.id);

  let players = room.players;
  const { shots, smokes, objects } = room;
  io.to(room.id).emit('join', {
    terrain: room.terrain,
    players,
    shots,
    smokes,
    objects
  });

  socket.on('move', (data) => { player.keys = data.keys })

  socket.on('disconnect', () => {
    room.players = room.players.filter(player => player.id != socket.id);
    if (room.players.length == 0) {
      rooms = rooms.filter(r => r.id != room.id);
    }
    let players = room.players;
    const { shots, smokes, objects } = room;
    socket.to(room.id).emit('update', {
      players,
      shots,
      smokes,
      objects
    });
  })
});

io.listen(PORT);