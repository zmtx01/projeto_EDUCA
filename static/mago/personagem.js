const keys = {};
document.addEventListener('keydown', e => keys[e.code] = true);
document.addEventListener('keyup', e => keys[e.code] = false);

const imageCache = {};

window.player = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  speed: 5,
  velocityX: 0,
  velocityY: 0,
  gravity: 0.5,
  jumpPower: 12,
  jumping: false,
  hitboxOffsetX: 23,
  hitboxOffsetY: 50,
  hitboxWidth: 48,
  hitboxHeight: 60,
  landImpact: null,
  vidaMax: 1000,
  vida: 1000,
  lastAttackTime: 0,
  fragmentationImmunityTimer: 0,
  attack: 20,
  attackCooldown: 100,
  projectilePenetration: 10,
  critChance: 0.05,
  critMultiplier: 1.5,
  level: 1,
  xp: 0,
  xpMax: 100,
  projectileCount: 1,
  raioCooldownReduction: 0,
  xpGainMultiplier: 1.0,
  hpRegen: 0,
  luck: 0,
  maxLevelAuraTimer: 0,
  maxLevelAuraInterval: 100,
  reflectTouchDamageMultiplier: 0,
  reflectProjectileDamageMultiplier: 0
};

function checkPlayerCollisions() {
    // Esta função foi intencionalmente esvaziada.
    // Toda a lógica de colisão foi centralizada em `updateMonstros`.
}

function preloadImages(urls, callback) {
    let loadedCount = 0;
    const totalImages = urls.length;
    if (totalImages === 0) {
        callback();
        return;
    }
    urls.forEach(url => {
        if (imageCache[url]) {
            loadedCount++;
            if (loadedCount === totalImages) callback();
            return;
        }
        const img = new Image();
        img.src = url;
        img.onload = () => {
            imageCache[url] = img;
            loadedCount++;
            if (loadedCount === totalImages) callback();
        };
        img.onerror = () => {
            console.error(`Falha ao carregar a imagem: ${url}`);
            loadedCount++;
            if (loadedCount === totalImages) callback();
        };
    });
}

function levelUpPlayer() {
    if (!window.player) return;
    const player = window.player;
    player.level++;
    player.xp -= player.xpMax;
    
    // --- Nova Fórmula de XP (4 Rampas de Dificuldade) ---
    const N = player.level;
    if (N >= 1 && N <= 5) {
        player.xpMax = Math.floor(10 * (50 * N + 50));
    } else if (N >= 6 && N <= 15) {
        player.xpMax = Math.floor(10 * (100 * Math.pow(N, 1.2)));
    } else if (N >= 16 && N <= 30) {
        player.xpMax = Math.floor(10 * (200 * Math.pow(N, 1.3)));
    } else if (N >= 31) {
        player.xpMax = Math.floor(10 * (500 * Math.pow(N, 1.1)));
    }
    
    player.vidaMax += 10;
    player.vida = player.vidaMax;
    player.attack += 5;
    player.critChance += 0.005;
    const newLevel = player.level;
    let newImageSrc = null;
    if (newLevel >= 20) {
        newImageSrc = 'mago5.png';
    } else if (newLevel >= 15) {
        newImageSrc = 'mago4.png';
    } else if (newLevel >= 10) {
        newImageSrc = 'mago3.png';
    } else if (newLevel >= 5) {
        newImageSrc = 'mago2.png';
    } else {
        newImageSrc = 'MAGO.png';
    }
    if (newImageSrc) {
        const cachedImg = imageCache[newImageSrc];
        if (cachedImg && playerImage.src !== cachedImg.src) {
            playerImage.src = cachedImg.src;
        }
    }
    createLevelUpEffect(player.x + player.width / 2, player.y + 110, 20);
}

function addXP(amount) {
    if (!window.player) return;
    const finalAmount = amount * (window.player.xpGainMultiplier || 1.0);
    window.player.xp += finalAmount;
    while (window.player.xp >= window.player.xpMax) {
        levelUpPlayer();
    }
}

function updatePlayerStatus(deltaTime) {
    if (!window.player || window.isPaused || window.player.vida <= 0) return;
    if (window.player.hpRegen > 0 && window.player.vida < window.player.vidaMax) {
        const healAmount = window.player.hpRegen * (deltaTime / 1000);
        window.player.vida = Math.min(window.player.vidaMax, window.player.vida + healAmount);
    }
    if (window.player.fragmentationImmunityTimer > 0) {
        window.player.fragmentationImmunityTimer -= deltaTime;
    }
    if (window.player.level >= 20) {
        player.maxLevelAuraTimer += deltaTime;
        if (player.maxLevelAuraTimer >= player.maxLevelAuraInterval) {
            player.maxLevelAuraTimer = 0;
            createMaxLevelAuraEffect();
        }
    }
}
const playerImage = new Image();
let isInitialLoad = true;
playerImage.onload = () => {
    const playerScaleFactor = 0.05;
    const oldWidth = window.player.width || 0;
    window.player.width = playerImage.width * playerScaleFactor;
    window.player.height = playerImage.height * playerScaleFactor;
    if (isInitialLoad) {
        window.player.x = (window.cenarioOriginalWidth || 1024) / 2 - window.player.width / 2;
        window.player.y = (window.cenarioOriginalHeight || 768) - window.player.height - 40;
        isInitialLoad = false;
    } else {
        const widthDifference = window.player.width - oldWidth;
        window.player.x -= widthDifference / 2;
    }
};
const allPlayerImages = ['MAGO.png', 'mago2.png', 'mago3.png', 'mago4.png', 'mago5.png'];
preloadImages(allPlayerImages, () => {
    const initialImage = imageCache['MAGO.png'];
    if (initialImage) {
        playerImage.src = initialImage.src;
    }
});
let step = 0;
let lastX = 0;

function movePlayer() {
    window.player.velocityX = 0;
    if (keys['KeyA'] || keys['ArrowLeft']) window.player.velocityX = -window.player.speed;
    if (keys['KeyD'] || keys['ArrowRight']) window.player.velocityX = window.player.speed;
    if ((keys['KeyW'] || keys['ArrowUp'] || keys['Space']) && !window.player.jumping) {
        window.player.velocityY = -window.player.jumpPower;
        window.player.jumping = true;
    }
    window.player.velocityY += window.player.gravity;
    window.player.x += window.player.velocityX;
    window.player.y += window.player.velocityY;
    if (window.player.x < 0) window.player.x = 0;
    if (window.player.x + window.player.width > window.cenarioOriginalWidth) {
        window.player.x = window.cenarioOriginalWidth - window.player.width;
    }
    if (window.player.y + window.player.height > window.cenarioOriginalHeight) {
        if (window.player.jumping) {
            window.player.landImpact = {
                active: true,
                x: window.player.x + window.player.width / 2,
                strength: Math.min(Math.abs(window.player.velocityY), 15)
            };
        }
        window.player.y = window.cenarioOriginalHeight - window.player.height;
        window.player.velocityY = 0;
        window.player.jumping = false;
    }
    if (window.player.y < 0) window.player.y = 0;
}

function drawPlayer() {
    const imageToDraw = playerImage;
    if (!imageToDraw || !imageToDraw.complete) return;
    let inclination = 0;
    let playerAnimationOffsetY = 0;
    const moving = window.player.x !== lastX;
    if (moving) {
        step += 0.2;
        inclination = Math.sin(step) * 0.05 + (Math.random() - 0.5) * 0.02;
        playerAnimationOffsetY = Math.sin(step * 2) * 3 + (Math.random() - 0.5) * 2;
    } else step = 0;
    window.ctx.save();
    const screenX = (window.player.x - window.offsetX) * window.scale;
    const screenY = (window.player.y - window.offsetY) * window.scale;
    window.ctx.translate(screenX + window.player.width * window.scale / 2, screenY + window.player.height * window.scale / 2 + playerAnimationOffsetY * window.scale);
    window.ctx.rotate(inclination);
    window.ctx.drawImage(imageToDraw, -window.player.width * window.scale / 2, -window.player.height * window.scale / 2, window.player.width * window.scale, window.player.height * window.scale);
    window.ctx.restore();
    lastX = window.player.x;
}

function drawPlayerHitbox() {
    if (!window.player) return;
    window.ctx.strokeStyle = 'blue';
    window.ctx.lineWidth = 2;
    const hbX = (window.player.x + window.player.hitboxOffsetX - window.offsetX) * window.scale;
    const hbY = (window.player.y + window.player.hitboxOffsetY - window.offsetY) * window.scale;
    const hbW = window.player.hitboxWidth * window.scale;
    const hbH = window.player.hitboxHeight * window.scale;
    window.ctx.strokeRect(hbX, hbY, hbW, hbH);
}
window.showHealthBar = false;
document.addEventListener('keydown', e => {
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
        window.showHealthBar = !window.showHealthBar;
    }
});
let levelUpParticles = [];

function createLevelUpEffect(playerX, playerY, count = 0) {
    const player = window.player;
    const widthSpread = player.width * 0.4;
    for (let i = 0; i < count; i++) {
        levelUpParticles.push({
            x: player.x + player.width / 2 + offsetX,
            y: player.y + 110,
            vx: (Math.random() - 0.5) * 0.5,
            vy: -1 - Math.random() * 1.5,
            size: 2,
            opacity: 1,
            life: 40 + Math.random() * 40,
            color: 'white'
        });
    }
}

function updateLevelUpEffects(deltaTime) {
    if (!deltaTime) deltaTime = 16;
    for (let p of levelUpParticles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        p.opacity = p.life / 60;
    }
    levelUpParticles = levelUpParticles.filter(p => p.life > 0);
}

function drawLevelUpEffects() {
    if (!window.ctx) return;
    for (let p of levelUpParticles) {
        window.ctx.save();
        window.ctx.globalAlpha = p.opacity;
        window.ctx.fillStyle = p.color;
        window.ctx.beginPath();
        window.ctx.arc((p.x - window.offsetX) * window.scale, (p.y - window.offsetY) * window.scale, p.size * window.scale, 0, Math.PI * 2);
        window.ctx.fill();
        window.ctx.restore();
    }
}
let maxLevelAuraParticles = [];

function createMaxLevelAuraEffect() {
    const player = window.player;
    if (!player) return;
    for (let i = 0; i < 2; i++) {
        const widthSpread = player.width * 0.6;
        const offsetX = (Math.random() - 0.5) * widthSpread;
        maxLevelAuraParticles.push({
            x: player.x + player.width / 2 + offsetX,
            y: player.y + player.height - 40,
            vx: (Math.random() - 0.5) * 0.2,
            vy: -0.4 - Math.random() * 0.6,
            size: 1 + Math.random() * 1.5,
            opacity: 1,
            life: 50 + Math.random() * 40,
            color: Math.random() > 0.5 ? 'yellow' : 'yellow'
        });
    }
}

function updateMaxLevelAuraEffects(deltaTime) {
    if (!deltaTime) deltaTime = 16;
    for (let p of maxLevelAuraParticles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        p.opacity = (p.life / 80) * 0.8;
    }
    maxLevelAuraParticles = maxLevelAuraParticles.filter(p => p.life > 0);
}

function drawMaxLevelAuraEffects() {
    if (!window.ctx) return;
    for (let p of maxLevelAuraParticles) {
        window.ctx.save();
        window.ctx.globalAlpha = p.opacity;
        window.ctx.fillStyle = p.color;
        window.ctx.shadowBlur = 5;
        window.ctx.shadowColor = p.color;
        window.ctx.beginPath();
        window.ctx.arc((p.x - window.offsetX) * window.scale, (p.y - window.offsetY) * window.scale, p.size * window.scale, 0, Math.PI * 2);
        window.ctx.fill();
        window.ctx.restore();
    }
}
window.movePlayer = movePlayer;
window.drawPlayer = drawPlayer;
window.drawPlayerHitbox = drawPlayerHitbox;
window.addXP = addXP;
window.levelUpPlayer = levelUpPlayer;
window.updatePlayerStatus = updatePlayerStatus;
window.checkPlayerCollisions = checkPlayerCollisions;
window.updateLevelUpEffects = updateLevelUpEffects;
window.drawLevelUpEffects = drawLevelUpEffects;
window.updateMaxLevelAuraEffects = updateMaxLevelAuraEffects;
window.drawMaxLevelAuraEffects = drawMaxLevelAuraEffects;