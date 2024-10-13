/** @type {HTMLCanvasElement} */
const canvas = document.getElementById('canvas');
const WIDTH = 640;
const HEIGHT = 480;
const ASPECT_RATIO = WIDTH / HEIGHT;
canvas.width = WIDTH;
canvas.height = HEIGHT;
const ctx = canvas.getContext('2d');
let spriteSheet, tanks, barrels, bullet, smoke, terrain, objects_sprites;

let socket;

let players = [];
let shots = [];
let smokes = [];
let objects = [];

let { sin, cos, PI, floor, sqrt } = Math;

let keys = [];

const offcanvas = new OffscreenCanvas(canvas.width, canvas.height);
const offctx = offcanvas.getContext('2d');

const drawSprite = (sprite, rect) => {
  let mx = rect.x + rect.w / 2;
  let my = rect.y + rect.h / 2;
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(rect.angle);
  ctx.translate(-mx, -my);
  ctx.drawImage(spriteSheet, sprite.x, sprite.y, sprite.width, sprite.height, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

const drawTerrain = (index) => {
  for (let i = 0; i < canvas.width * canvas.height; i++) {
    let x = i % canvas.width;
    let y = floor(i / canvas.width) % canvas.height;
    offctx.drawImage(spriteSheet, terrain[index].x, terrain[index].y, terrain[index].width, terrain[index].height, x * 64, y * 64, 64, 64);
  }
}

const draw = () => {
  ctx.drawImage(offcanvas, 0, 0);

  objects.forEach(e => drawSprite(objects_sprites[e.index], e))

  players.forEach(e => {
    let pmx = e.x + e.w / 2;
    let pmy = e.y + e.h / 2;

    if (e.id == socket.id) {

      if (e.destroyed) {
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.font = '32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Renascer em ' + (3 - floor((Date.now() - e.deadTime) / 1000)), WIDTH / 2, HEIGHT / 2);
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.font = '16px Arial';
      ctx.textBaseline = 'top';
      ctx.fillText('Baixas: ' + e.kills, 8, 8);

      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Jogador', pmx, pmy - e.h);
      ctx.restore();
    }

    if (!e.destroyed) {
      ctx.fillStyle = e.life > 0.5 ? '#00ff0088' : '#ff000088';
      ctx.fillRect(pmx - e.life * e.w / 2, pmy - e.h, e.life * e.w, 10);
      drawSprite(tanks[e.sprite], e);

      ctx.save();
      ctx.translate(pmx, pmy);
      ctx.rotate(e.angle + e.barrel.angle - PI);
      ctx.translate(-pmx, -pmy);
      drawSprite(barrels[e.barrel.sprite], { ...e.barrel, x: pmx - e.barrel.w / 2, y: pmy, angle: 0 });
      ctx.restore();
    }
  });

  shots.forEach(e => drawSprite(bullet, e));

  smokes = smokes.filter(e => Date.now() - e.time < 300);

  smokes.forEach(e => {
    let index = floor((2 / 250) * (Date.now() - e.time));
    drawSprite(smoke[index], {
      x: e.x - e.sizes[index].width / 2,
      y: e.y - e.sizes[index].height / 2,
      w: e.sizes[index].width,
      h: e.sizes[index].height
    });
  });
}

const loop = () => {
  if (keys.length) {
    socket.volatile.emit('move', { keys });
  }
  draw();
  requestAnimationFrame(loop);
}

const resize = () => {
  let asp = window.innerWidth / window.innerHeight;
  let v = asp > ASPECT_RATIO;
  canvas.style.width = v ? 'auto' : '100%';
  canvas.style.height = v ? '100%' : 'auto';
}

(async () => {
  const sheet = await (await fetch('sheet.json')).json();

  tanks = [
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
  barrels = [
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
  bullet = sheet.bulletBeigeSilver_outline;

  terrain = [sheet.sand, sheet.grass, sheet.dirt];

  objects_sprites = [sheet.treeSmall, sheet.treeLarge, sheet.barrelGreen_up, sheet.barrelGrey_up, sheet.barrelRed_up];

  smoke = [sheet.smokeGrey3, sheet.smokeGrey2, sheet.smokeGrey1];

  spriteSheet = new Image();
  spriteSheet.src = "./sheet_tanks.png";
  spriteSheet.onload = () => {

    socket = io();

    socket.on('join', e => {
      players = e.players;
      shots = e.shots;
      objects = e.objects;
      drawTerrain(e.terrain);
    })

    socket.on('update', e => {
      players = e.players;
      shots = e.shots;
      objects = e.objects;
      e.smokes.forEach(s => smokes.push({ ...s, time: Date.now() }));
    });

    socket.on('disconnect', () => {
      players = [];
      shots = [];
      objects = [];
      smokes = [];
    })
    resize();
    loop();
  };
})()

window.addEventListener('resize', resize);

window.addEventListener('keydown', e => {
  if (!keys.includes(e.code)) {
    keys.push(e.code);
  }
});

window.addEventListener('keyup', e => {
  keys = keys.filter(key => key != e.code);
});