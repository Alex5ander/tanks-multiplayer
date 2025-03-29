import { randomUUID } from 'crypto';
import parser from 'socket.io-msgpack-parser';
import { Server } from 'socket.io';
import fs from 'fs';
const sheet = JSON.parse(fs.readFileSync("./sheet.json"));

const io = new Server({ cors: { origin: '*' }, parser });

const PORT = process.env.PORT || 3000;

/** @type { {[key:string]: Room}} */
let rooms = {};

const isOverlap = (a, b) => {
  return hypot((a.x + a.h / 2) - (b.x + b.h / 2), a.y + a.h / 2 - (b.y + b.h / 2)) < (a.h + b.h) / 2;
}

/** @param {Player} player  */
const checkBounds = (player) => {
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

// class Smoke {
//   constructor(x, y) {
//     this.x = x;
//     this.y = y;
//     this.angle = random() * PI * 2;
//     this.sizes = [
//       sheet.smokeGrey3,
//       sheet.smokeGrey2,
//       sheet.smokeGrey1
//     ].map(e => ({ ...e, width: e.width * scale, height: e.height * scale }))
//   }
// }

class Bullet {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.w = bullet.width * scale;
    this.h = bullet.height * scale;
    this.angle = 0;
    this.speed = 15;
    this.id = randomUUID();
    this.ownerId = '';
    this.roomId = '';
    this.disable = false;
  }
  update() {
    this.x += sin(this.angle) * this.speed;
    this.y -= cos(this.angle) * this.speed;
    let m = abs(hypot(320 - this.x, 240 - this.y));
    if (m > 1000) {
      this.disable = true;
      delete rooms[this.roomId].shots[this.id];
      io.to(this.roomId).emit('removeBullet', this.id);
    }
  }
}

class Player {
  /** 
   * @param {string} id  
   * @param {string} room
  */
  constructor(id, roomId) {
    this.id = id;
    this.roomId = roomId;
    let index = floor(random() * tanks.length);
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
    this.life = 100;
    this.shotLastTime = 0;
    this.barrel = { sprite: index, w: barrels[index].width * scale, h: barrels[index].height * scale, angle: 0 };
    this.deadTime = 0;
  }
  checkCollisions() {
    return rooms[this.roomId].objects.some(t => isOverlap(this, t) || Object.values(rooms[this.roomId].players).filter(t => t != this).some(t => isOverlap(this, t)));
  }
  move(keys) {
    let actions = {
      KeyW: () => {
        this.x += sin(this.angle) * this.speed;
        this.y -= cos(this.angle) * this.speed;
        const result = checkBounds(this) || this.checkCollisions();
        if (result) {
          this.x -= sin(this.angle) * this.speed;
          this.y += cos(this.angle) * this.speed;
        }
      },
      KeyS: () => {
        this.x -= sin(this.angle) * this.speed;
        this.y += cos(this.angle) * this.speed;
        const result = checkBounds(this) || this.checkCollisions();
        if (result) {
          this.x += sin(this.angle) * this.speed;
          this.y -= cos(this.angle) * this.speed;
        }
      },
      KeyA: () => {
        this.angle -= this.rotatespeed * PI / 180;
      },
      KeyD: () => {
        this.angle += this.rotatespeed * PI / 180;
      },
      KeyZ: () => {
        this.barrel.angle -= this.rotatespeed * PI / 180;
      },
      KeyX: () => {
        this.barrel.angle += this.rotatespeed * PI / 180;
      },
      Space: () => {
        if (Date.now() - this.shotLastTime > this.shotDelay) {
          let bangle = this.barrel.angle + this.angle;
          let bullet = new Bullet();
          bullet.x = (this.x + this.w / 2) - bullet.w / 2 + sin(bangle) * this.barrel.h;
          bullet.y = (this.y + this.h / 2) - bullet.h / 2 - cos(bangle) * this.barrel.h;
          bullet.angle = bangle;
          bullet.ownerId = this.id;
          bullet.roomId = this.roomId;
          rooms[this.roomId].shots[bullet.id] = bullet;
          this.shotLastTime = Date.now();
          io.to(this.roomId).emit('createBullet', bullet);
        }
      }
    }
    for (const key of keys) {
      if (actions[key]) {
        actions[key]();
        io.to(this.roomId).emit('playerMoved', this);
      }
    }
  }
  respawn() {
    this.x = floor(random() * (640 - this.w));
    this.y = floor(random() * (480 - this.h));
    this.angle = Math.random() * PI * 2;
    this.barrel.angle = 0;
    while (this.checkCollisions()) {
      this.respawn();
    }
    this.life = 100;
    io.to(this.roomId).emit('respawn', this);
  }
}

class Room {
  constructor() {
    this.id = randomUUID();
    /** @type {{[key:string]:Player}} */
    this.players = {};
    /** @type {{[key:string]:Bullet}} */
    this.shots = {};
    /** @type {Tree[]} */
    this.objects = [];
    this.terrain = floor(random() * 3);
    for (let i = 0; i < 12; i++) {
      this.objects.push(new WorldObject(random() * 640, random() * 480, floor(random() * objects.length)))
    }
  }
  update() {
    for (const id in this.players) {
      const player = this.players[id];
      if (Date.now() - player.deadTime > 3000 && player.life <= 0) {
        player.respawn();
      }
    }

    for (const shotId in this.shots) {
      const shot = this.shots[shotId];
      shot.update();
      if (this.objects.some(o => isOverlap(shot, o))) {
        delete this.shots[shot.id];
        io.to(this.id).emit('removeBullet', shot.id);
      }
      if (shot) {
        for (const id in this.players) {
          const player = this.players[id];
          if (player.life > 0 && player.id != shot.ownerId) {
            if (isOverlap(shot, player)) {
              delete this.shots[shot.id];
              player.life -= 10;
              if (player.life <= 0) {
                player.deadTime = Date.now();
                this.players[shot.ownerId].kills += 1;
              }
              io.to(this.id).emit('updatePlayerLife', [player.id, player.life]);
              io.to(this.id).emit('removeBullet', shot.id);
            }
          }
        }
      }
    }
  }
}

const gameLoop = () => {
  for (const id in rooms) {
    rooms[id].update();
  }
  setTimeout(gameLoop, 1000 / 60);
}

gameLoop();

io.on('connection', socket => {
  /** @type {Room} */
  let room;

  for (const id in rooms) {
    if (Object.keys(rooms[id].players).length < 4) {
      room = rooms[id];
    }
  }

  if (!room) {
    room = new Room();
    rooms[room.id] = room;
  }

  let player = new Player(socket.id, room.id);
  player.respawn();
  room.players[socket.id] = player;

  const { players, objects } = room;
  socket.join(room.id);

  socket.emit('join', {
    terrain: room.terrain,
    players,
    shots: room.shots,
    objects
  });

  socket.broadcast.to(room.id).emit('newPlayer', player);
  socket.on('move', (keys) => { player.move(keys) })

  socket.on('disconnect', () => {
    delete room.players[socket.id];
    if (Object.keys(room.players).length == 0) {
      delete rooms[room.id];
    } else {
      socket.broadcast.to(room.id).emit('playerDisconnected', player.id);
    }
  })
});

io.listen(PORT);