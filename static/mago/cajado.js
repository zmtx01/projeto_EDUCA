window.baseRaioDamage = 500;
window.raioCooldown = 2000;
window.lastRaioTime = 0;

// >>> NOVO: A fila de saída para ataques <<<
window.ataquesParaEnviar = [];

window.getRaioDamage = function() {
  return (window.baseRaioDamage || 500) + (window.player?.attack || 0);
}

window.canUseRaio = function() {
  const now = Date.now();
  const baseCooldown = window.raioCooldown || 2000;
  const reduction = window.player?.raioCooldownReduction || 0;
  const finalCooldown = baseCooldown * (1 - Math.min(reduction, 0.8));
  return (now - (window.lastRaioTime || 0)) >= finalCooldown;
}

window.projetilCor = 'cyan';

const mouse = { x: 0, y: 0, pressed: false, middle: false };
const canvas = window.canvas || document.getElementById('gameCanvas');

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
});

canvas.addEventListener('mousedown', e => {
    if (window.isPaused || window.isLevelUpPause) return;

    if (e.button === 0) {
        const mouseCenario = telaParaCenario(mouse.x, mouse.y);
        spawnRaioNoMouse(mouseCenario.x, mouseCenario.y);
    }
    if (e.button === 2) {
        // >>> LOG 1 ADICIONADO AQUI <<<
        if (isMultiplayer) console.log(`[CLIENTE P${window.multiplayer.playerNumber}] Evento de clique (botão direito) detectado.`);
        
        e.preventDefault();
        mouse.pressed = true;
    }
    if (e.button === 1) {
        e.preventDefault();
        mouse.middle = true;
    }
});
canvas.addEventListener('mouseup', e => {
    if (e.button === 2) mouse.pressed = false;
    if (e.button === 1) mouse.middle = false;
});

canvas.addEventListener('wheel', e => { if (mouse.middle) e.preventDefault(); });

let autoFire = false;
const gameCursorHTML = document.getElementById('game-cursor');

window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'q') {
        autoFire = !autoFire;
        mouse.pressed = autoFire;
        if (gameCursorHTML) {
            if (autoFire) {
                gameCursorHTML.classList.add('auto-mode');
            } else {
                gameCursorHTML.classList.remove('auto-mode');
            }
        }
    }
});

const staffImage = new Image();
staffImage.src = 'CAJADO.png';
const staffScaleBase = 0.06;
let staffWidth = 0, staffHeight = 0;
staffImage.onload = () => {
  staffWidth = staffImage.width * staffScaleBase;
  staffHeight = staffImage.height * staffScaleBase;
};

const _projectiles = [];
window.projectiles = window.projectiles || _projectiles;
window.impactos = [];
const projectilePool = [];
const impactoPool = [];

function telaParaCenario(xTela, yTela) {
  return { x: xTela / window.scale + window.offsetX, y: yTela / window.scale + window.offsetY };
}
function cenarioParaTela(xCenario, yCenario) {
  return { x: (xCenario - window.offsetX) * window.scale, y: (yCenario - window.offsetY) * window.scale };
}

function lineRectIntersection(x1, y1, x2, y2, rx, ry, rw, rh) {
    const left =   lineLineIntersection(x1, y1, x2, y2, rx, ry, rx, ry + rh);
    const right =  lineLineIntersection(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh);
    const top =    lineLineIntersection(x1, y1, x2, y2, rx, ry, rx + rw, ry);
    const bottom = lineLineIntersection(x1, y1, x2, y2, rx, ry + rh, rx + rw, ry + rh);
    return left || right || top || bottom;
}

function lineLineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (den === 0) return false;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
    return t > 0 && t < 1 && u > 0 && u < 1;
}

function getProjectile() { return projectilePool.length > 0 ? projectilePool.pop() : {}; }
function getImpacto() { return impactoPool.length > 0 ? impactoPool.pop() : {}; }
function recycleProjectile(p) { if(p) projectilePool.push(p); }
function recycleImpacto(i) { if(i) impactoPool.push(i); }

function shoot() {
  if (!window.player || !mouse.pressed) return;

  if (!window.player.lastShotTime) window.player.lastShotTime = 0;
  const now = Date.now();
  const baseCooldown = window.player.attackCooldown || 200;
  const atkSpeedBonus = Math.min(0.9, window.player.atkSpeed || 0);
  const cooldown = baseCooldown * (1 - atkSpeedBonus);
  
  if (now - window.player.lastShotTime < cooldown) return;
  window.player.lastShotTime = now;

  const centerX = window.player.x + window.player.width / 2 + 20;
  const centerY = window.player.y + window.player.height / 2;
  const mouseCenario = telaParaCenario(mouse.x, mouse.y);
  const mainAngle = Math.atan2(mouseCenario.y - centerY, mouseCenario.x - centerX);

  const offsetXStaff = staffHeight / 2 + 10;
  const offsetYStaff = 0;
  
  const baseSpeed = 0.48;
  const speed = baseSpeed * (1 + (window.player.projSpeed || 0));

  const projectileCount = Math.floor(window.player.projectileCount || 1);
  const totalSpread = projectileCount > 1 ? Math.PI / 12 : 0;
  const startAngle = mainAngle - totalSpread / 2;
  const angleStep = projectileCount > 1 ? totalSpread / (projectileCount - 1) : 0;

  for (let i = 0; i < projectileCount; i++) {
    const angle = (projectileCount === 1) ? mainAngle : startAngle + (i * angleStep);

    const rotX = offsetXStaff * Math.cos(angle) - offsetYStaff * Math.sin(angle);
    const rotY = offsetXStaff * Math.sin(angle) + offsetYStaff * Math.cos(angle);
    const originX = centerX + rotX;
    const originY = centerY + rotY;
    
    const projData = {
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 5,
        life: 2000,
        isGhost: false,
    };

    const p = getProjectile();
    Object.assign(p, projData, {
        prevX: originX,
        prevY: originY,
        color: window.projetilCor,
        damage: window.player.attack || 10,
        penetration: window.player.projectilePenetration || 1,
    });
    window.projectiles.push(p);
    
    // >>> AVISO LOCAL DESACOPLADO <<<
    if (typeof window.onProjectileFired === 'function') {
        window.onProjectileFired(projData);
    }
  }
}

function spawnRaioNoMouse(x, y) {
  if (!window.canUseRaio()) return;
  window.lastRaioTime = Date.now();

  const segmentos = [];
  let atualX = x;
  let atualY = window.offsetY;
  const passos = 14;
  const ch = window.canvas.height / window.scale;

  for (let i = 0; i < passos; i++) {
    const proxX = atualX + (Math.random() - 0.5) * 40;
    const proxY = window.offsetY + ((i + 1) * (ch / passos));
    segmentos.push({ x1: atualX, y1: atualY, x2: proxX, y2: proxY });
    atualX = proxX;
    atualY = proxY;
  }
  
  const raioData = {
    segmentos,
    timer: 500,
    damage: window.getRaioDamage(),
    penetration: 10,
    radius: 40
  };

  window.raiosDoMago.push(raioData);

  // >>> AVISO LOCAL DESACOPLADO <<<
  if (typeof window.onStaffLightningUsed === 'function') {
      window.onStaffLightningUsed(raioData);
  }
}

function criarImpacto(x, y, cor, escala = 1) {
  const MAX_IMPACTOS = 50;
  if (window.impactos.length >= MAX_IMPACTOS) recycleImpacto(window.impactos.shift());

  const critChance = window.player?.critChance || 0.05;
  const critMultiplier = window.player?.critMultiplier || 1.5;
  const isCritico = Math.random() < critChance;

  let raioInicial = (8 + Math.random() * 8) * escala;
  if (isCritico) raioInicial *= critMultiplier;

  const corImpacto = isCritico ? 'white' : cor;

  const imp = getImpacto();
  imp.x = x; imp.y = y; imp.raio = raioInicial; imp.alpha = 1; imp.decay = 0.05; imp.color = corImpacto;
  window.impactos.push(imp);

  return isCritico;
}

function updateProjectiles(deltaTime) {
  if (!deltaTime) deltaTime = 16.67;
  for (let i = window.projectiles.length - 1; i >= 0; i--) {
    const p = window.projectiles[i];
    p.prevX = p.x;
    p.prevY = p.y;
    
    p.x += p.vx * deltaTime;
    p.y += p.vy * deltaTime;

    let collided = false;
    for (const b of (window.blocos || [])) {
      if (lineRectIntersection(p.prevX, p.prevY, p.x, p.y,
                               b.x - p.radius, b.y - p.radius,
                               b.width + p.radius * 2, b.height + p.radius * 2)) {
        collided = true;
        criarImpacto(p.x, p.y, p.color);
        break;
      }
    }

    if (collided || p.x < 0 || p.x > (window.cenarioOriginalWidth || 99999) || p.y < 0 || p.y > (window.cenarioOriginalHeight || 99999)) {
      window.projectiles.splice(i,1);
      recycleProjectile(p);
    }
  }
}

function updateImpactos(deltaTime) {
  if (!deltaTime) deltaTime = 16.67;
  for (let i = window.impactos.length - 1; i >= 0; i--) {
    const imp = window.impactos[i];
    imp.alpha -= imp.decay;
    imp.raio += 0.5;
    if (imp.alpha <= 0) { window.impactos.splice(i,1); recycleImpacto(imp); }
  }
}

function getRGBAColor(color, alpha) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = color;
  const computed = ctx.fillStyle;
  if (computed.startsWith('rgb')) {
    return computed.replace(/rgba?\((\d+,\s*\d+,\s*\d+)(,\s*[\d.]+)?\)/, `rgba($1,${alpha})`);
  }
  return color;
}

function drawImpactos() {
  const grupos = new Map();
  for (const imp of window.impactos) {
    const posTela = cenarioParaTela(imp.x, imp.y);
    if(posTela.x+imp.raio*window.scale<0 || posTela.x-imp.raio*window.scale>window.canvas.width || posTela.y+imp.raio*window.scale<0 || posTela.y-imp.raio*window.scale>window.canvas.height) continue;

    const fillColor = getRGBAColor(imp.color, imp.alpha.toFixed(2));

    if (!grupos.has(fillColor)) grupos.set(fillColor, []);
    grupos.get(fillColor).push({x: posTela.x, y: posTela.y, r: imp.raio*window.scale});
  }

  for (const [cor, lista] of grupos) {
    window.ctx.beginPath();
    for (const {x,y,r} of lista) {
      window.ctx.moveTo(x+r, y);
      window.ctx.arc(x, y, r, 0, Math.PI*2);
    }
    window.ctx.fillStyle = cor;
    window.ctx.fill();
  }
}

function drawStaff() {
  if (!staffImage.complete || !window.player) return;
  const centerX = window.player.x + window.player.width/2 + 20;
  const centerY = window.player.y + window.player.height/2;
  const angle = Math.atan2(telaParaCenario(mouse.x, mouse.y).y - centerY, telaParaCenario(mouse.x, mouse.y).x - centerX);
  
  if(window.player) window.player.staffAngle = angle;

  const centerTela = cenarioParaTela(centerX, centerY);

  window.ctx.save();
  window.ctx.translate(centerTela.x, centerTela.y);
  window.ctx.rotate(angle);
  window.ctx.drawImage(staffImage, -staffWidth*window.scale/2, -staffHeight*window.scale/2, staffWidth*window.scale, staffHeight*window.scale);
  window.ctx.restore();
}

function drawCursor() {}

function drawProjectiles() {
  for (const p of window.projectiles) {
    const posTela = cenarioParaTela(p.x, p.y);
    window.ctx.beginPath();
    window.ctx.arc(posTela.x, posTela.y, p.radius*window.scale, 0, Math.PI*2);
    window.ctx.fillStyle = p.color;
    window.ctx.fill();
  }
}

function spawnRaioNoMouse(x, y) {
  if (!window.canUseRaio()) return;
  window.lastRaioTime = Date.now();

  const segmentos = [];
  let atualX = x;
  let atualY = window.offsetY;
  const passos = 14;
  const ch = window.canvas.height / window.scale;

  for (let i = 0; i < passos; i++) {
    const proxX = atualX + (Math.random() - 0.5) * 40;
    const proxY = window.offsetY + ((i + 1) * (ch / passos));
    segmentos.push({ x1: atualX, y1: atualY, x2: proxX, y2: proxY });
    atualX = proxX;
    atualY = proxY;
  }
  
  const raioData = {
    segmentos,
    timer: 500,
    damage: window.getRaioDamage(),
    penetration: 10,
    radius: 40
  };

  window.raiosDoMago.push(raioData);

  // >>> MUDANÇA CRUCIAL NA VERIFICAÇÃO <<<
  if (window.multiplayer && window.multiplayer.state === 'online') {
      if (typeof window.sendMessage === 'function') {
          console.log(`[CLIENTE P${window.multiplayer.playerNumber}] Tentando enviar mensagem 'staff-lightning-used'...`);
          window.sendMessage('staff-lightning-used', raioData);
      } else {
          console.error(`[CLIENTE P${window.multiplayer.playerNumber}] ERRO: a função sendMessage do raio não foi encontrada!`);
      }
  }
}

window.shoot = shoot;
window.updateProjectiles = updateProjectiles;
window.updateImpactos = updateImpactos;
window.drawImpactos = drawImpactos;
window.drawStaff = drawStaff;
window.drawProjectiles = drawProjectiles;
window.drawCursor = drawCursor;
window.telaParaCenario = telaParaCenario;
window.cenarioParaTela = cenarioParaTela;
window.criarImpacto = criarImpacto;
window.spawnRaioNoMouse = spawnRaioNoMouse;