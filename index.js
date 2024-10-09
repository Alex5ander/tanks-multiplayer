import { randomUUID } from 'crypto';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import sheet from './sheet.json' assert {type: 'json'};

const tank = sheet.tankBeige;
const bullet = sheet.bulletBeigeSilver_outline;
const barrel = sheet.barrelBeige;
const treeSmall = sheet.treeSmall;
const treeLarge = sheet.treeLarge;
const trees = [treeSmall, treeLarge];

const app = express();
app.use(express.static('public'));
const server = http.createServer(app);
const io = new Server(server);
const { cos, sin, PI, random, floor } = Math;

class Tree {
  constructor(x, y, index) {
    this.x = x;
    this.y = y;
    this.w = trees[index].width;
    this.h = trees[index].height;
    this.index = index;
  }
}

class Smoke {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
}

class Bullet {
  constructor(x, y, angle, owner) {
    this.x = x;
    this.y = y;
    this.w = bullet.width;
    this.h = bullet.height;
    this.angle = angle;
    this.speed = 15;
    this.owner = owner;
    this.disable = false;
  }
  update() {
    this.x += sin(this.angle) * this.speed;
    this.y -= cos(this.angle) * this.speed;
  }
}

class Player {
  constructor(id) {
    this.id = id;
    this.x = floor(random() * 640);
    this.y = floor(random() * 480);
    this.w = tank.width;
    this.h = tank.height;
    this.angle = 0;

    this.speed = 5;
    this.rotatespeed = 5;
    this.shotDelay = 750;
    this.life = 255;
    this.keys = [];
    this.shotLastTime = 0;
    this.barrel = { width: barrel.width, height: barrel.height, angle: 0 };
  }
}

class Room {
  constructor() {
    this.id = randomUUID();
    /** @type {Player[]} */
    this.players = [];
    /** @type {Bullet[]} */
    this.shots = [];
    /** @type {Smoke} */
    this.smokes = [];
    /** @type {Tree} */
    this.trees = [];
    for (let i = 0; i < 5; i++) {
      this.trees.push(new Tree(random() * 640, random() * 480, floor(random() * 2)))
    }
  }
  getPlayers() {
    return this.players.map(({ id, ...rest }) => ({ ...rest }))
  }
  update() {
    let actions = {
      KeyW: (player) => {
        player.x += sin(player.angle) * player.speed;
        player.y -= cos(player.angle) * player.speed;
      },
      KeyS: (player) => {
        player.x -= sin(player.angle) * player.speed;
        player.y += cos(player.angle) * player.speed;
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
          let bullet = new Bullet();
          bullet.x = (player.x + player.w / 2) - bullet.w / 2 + sin(player.barrel.angle + player.angle) * player.barrel.height;
          bullet.y = (player.y + player.h / 2) - bullet.h / 2 - cos(player.barrel.angle + player.angle) * player.barrel.height;
          bullet.angle = player.barrel.angle + player.angle;
          bullet.owner = player;
          this.shots.push(bullet);
          this.smokes.push(new Smoke(bullet.x + bullet.w / 2, bullet.y + bullet.h / 2));
          player.shotLastTime = Date.now();
        }
      }
    }
    this.players.forEach(player => {
      player.keys.forEach(key => { actions[key]?.(player) })
      player.keys = [];
    })

    this.shots = this.shots.filter(shot => !shot.disable);

    this.shots.forEach(shot => {
      shot.update();

      this.players.forEach(player => {
        if (!shot.disable && shot.owner != player && player.x + player.w > shot.x && player.x < shot.x + shot.w && player.y + player.h > shot.y && player.y < shot.y + shot.h) {
          player.life -= 10;
          shot.disable = true;

          this.smokes.push(new Smoke(shot.x - shot.w / 2, shot.y - shot.h / 2));
        }
      })
    });

    io.to(this.id).emit('update', {
      players: this.getPlayers(),
      shots: this.shots,
      smokes: this.smokes,
      trees: this.trees
    });

    this.smokes = [];
  }
}

/** @type {Room[]} */
let rooms = [];
let l = 0;

const gameLoop = () => {
  let end = Date.now();
  rooms.forEach(room => room.update());
  let d = end - l;
  l = end;
  setTimeout(gameLoop, 1000 / 30 - d);
}

gameLoop();

io.on('connection', socket => {
  let room = rooms.find(e => e.players.length < 4);

  if (!room) {
    room = new Room();
    rooms.push(room);
  }

  let player = new Player(socket.id);
  room.players.push(player);
  socket.join(room.id);

  let players = room.getPlayers();
  const { shots, smokes, trees } = room;
  io.to(room.id).emit('update', {
    players,
    shots,
    smokes,
    trees
  });

  socket.on('move', (data) => { player.keys = data.keys })

  socket.on('disconnect', () => {
    room.players = room.players.filter(player => player.id != socket.id);
    if (room.players.length == 0) {
      rooms = rooms.filter(r => r.id != room.id);
    }
    let players = room.getPlayers();
    const { shots, smokes, trees } = room;
    socket.to(room.id).emit('update', {
      players,
      shots,
      smokes,
      trees
    });
  })
});

server.listen(3000);