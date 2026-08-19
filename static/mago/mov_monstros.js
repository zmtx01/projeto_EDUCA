// =================================================================
// mov_monstros.js (Versão restaurada para Single-Player)
// =================================================================

// Define ou reutiliza a lista global de monstros. Esta é a fonte da verdade para o cliente.
window.monstros = window.monstros || [];

const monstroProjectiles = [];
const monstroProjectilePool = [];


window.particles = window.particles || [];
window.hibridProjectiles = window.hibridProjectiles || [];
window.raiosDoMago = window.raiosDoMago || [];

const estoques = {};
let spawnInicial = false;

window.ordaAtual = window.ordaAtual || 0;

window.loadedImages = window.loadedImages || {};
['1a.png','1b.png','2a.png','2b.png'].forEach(src => {
  if (!window.loadedImages[src]) {
    const img = new Image();
    img.src = src;
    window.loadedImages[src] = img;
  }
});

window.HitSystem = window.HitSystem || {
  checkProjectileVsTarget: function(proj, target) {
    const baseDamage = proj.damage || 10;
    const critChance = proj.isCritico ? 1 : (window.player?.critChance || 0);
    const critMultiplier = window.player?.critMultiplier || 1.5;
    const isCritico = Math.random() < critChance;
    const damage = isCritico ? baseDamage * critMultiplier : baseDamage;
    const penetration = proj.penetration || 1;
    const resistance = target.resistance || 1;
    const applied = Math.min(penetration, resistance);
    target.vida -= damage * applied / resistance;
    if (target.isHit !== undefined) { target.isHit = true; target.lastHitTime = Date.now(); }
    if (proj.penetration !== undefined) { proj.penetration -= applied; return proj.penetration <= 0; }
    return false;
  }
};

function createBloodParticles(x, y, count = 1) { for (let i = 0; i < count; i++) { window.particles.push({ x: x + (Math.random() - 0.4) * 10, y: y, velX: (Math.random() - 0.4) * 2, velY: Math.random() * 0.4 + 1, radius: Math.random() * 6 + 1, color: 'rgba(255, 0, 0, 1)', life: Math.random() * 20 + 20, }); } }
function updateParticles() { for (let i = window.particles.length - 1; i >= 0; i--) { const p = window.particles[i]; p.life--; if (p.life <= 0) { window.particles.splice(i, 1); continue; } p.x += p.velX; p.y += p.velY; p.velY *= 0.98; } }
function drawParticles() { const ctx = window.ctx; for (const p of window.particles) { const screenX = (p.x - window.offsetX) * window.scale; const screenY = (p.y - window.offsetY) * window.scale; ctx.beginPath(); ctx.arc(screenX, screenY, p.radius * window.scale, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill(); } }
function updateHibridProjectiles(deltaTime) { if (!window.hibridProjectiles) return; for (let i = window.hibridProjectiles.length - 1; i >= 0; i--) { const p = window.hibridProjectiles[i]; if (p.invincibilityTimer > 0) p.invincibilityTimer -= deltaTime; p.prevX = p.x; p.prevY = p.y; p.x += p.velX; p.y += p.velY; let removed = false; for (let j = window.monstros.length - 1; j >= 0; j--) { const m = window.monstros[j]; if (lineCircleIntersection(p.prevX, p.prevY, p.x, p.y, m.x + m.hitboxOffsetX, m.y + m.hitboxOffsetY, m.hitboxRadius + p.radius)) { if (typeof window.criarImpacto === 'function') { window.criarImpacto(p.x, p.y, p.color); } if (window.player && window.player.bleedDamage > 0) { m.isBleeding = true; m.bleedDamagePerSecond = (m.bleedDamagePerSecond || 0) + window.player.bleedDamage; } if (window.HitSystem.checkProjectileVsTarget(p, m)) { window.hibridProjectiles.splice(i, 1); removed = true; break; } m.isHit = true; m.currentSprite = m.spriteHit; m.lastHitTime = Date.now(); } } if (removed) continue; if (window.player && (window.player.fragmentationImmunityTimer || 0) <= 0 && (p.invincibilityTimer || 0) <= 0) { if (circleRectCollision(p.x, p.y, p.radius, window.player.x + window.player.hitboxOffsetX, window.player.y + window.player.hitboxOffsetY, window.player.hitboxWidth, window.player.hitboxHeight)) { if (typeof window.criarImpacto === 'function') window.criarImpacto(p.x, p.y, p.color); if (window.HitSystem.checkProjectileVsTarget(p, window.player)) { window.hibridProjectiles.splice(i, 1); removed = true; } window.player.fragmentationImmunityTimer = 200; if (typeof window.triggerDamageFlash === 'function') window.triggerDamageFlash(); } } if (removed) continue; let hitBlock = false; for (const bloco of (window.blocos || [])) { if (circleRectCollision(p.x, p.y, p.radius, bloco.x, bloco.y, bloco.width, bloco.height)) { if (typeof window.criarImpacto === 'function') window.criarImpacto(p.x, p.y, p.color); hitBlock = true; break; } } if (hitBlock) { window.hibridProjectiles.splice(i, 1); continue; } if (p.x < 0 || p.x > window.cenarioOriginalWidth || p.y < 0 || p.y > window.cenarioOriginalHeight) { window.hibridProjectiles.splice(i, 1); } } }
function drawHibridProjectiles() { if (!window.hibridProjectiles) return; const ctx = window.ctx; for (const p of window.hibridProjectiles) { const screenX = (p.x - window.offsetX) * window.scale; const screenY = (p.y - window.offsetY) * window.scale; ctx.beginPath(); ctx.arc(screenX, screenY, p.radius * window.scale, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill(); } }
function totalEstoqueRestante() { return Object.values(estoques).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0); }
function criarMonstros(lista) { lista.forEach(item => { const tipo = item.tipo; const quantidade = item.quantidade ?? 1; const configBase = window.Monstro.configPadrao(tipo); const config = { ...configBase, ...(item.config || {}) }; if (!estoques[tipo]) estoques[tipo] = []; estoques[tipo].spawnedCount = 0; estoques[tipo].onScreenCount = 0; for (let i = 0; i < quantidade; i++) { estoques[tipo].push({ ...config }); } }); if (!spawnInicial) iniciarLeva(); }
function iniciarLeva() { spawnInicial = true; for (let tipo in estoques) { if (!Array.isArray(estoques[tipo])) continue; let qtd = Math.min(10, estoques[tipo].length); for (let i = 0; i < qtd; i++) { const cfg = estoques[tipo].shift(); spawnMonstro(tipo, cfg); } } }
function spawnMonstro(tipo, config = {}, overrideX = null, overrideY = null) { if (!config) return; const alturaTela = window.cenarioOriginalHeight; const cenarioWidth = window.cenarioOriginalWidth; const spawnMinX = 200; const spawnMaxX = cenarioWidth - 200; const x = overrideX !== null ? overrideX : Math.random() * (spawnMaxX - spawnMinX) + spawnMinX; const y = overrideY !== null ? overrideY : - (config.height || 64) - Math.random() * 100; const minY = config.minY ?? alturaTela * 0.2; const maxY = config.maxY ?? alturaTela * 0.9; const targetY = Math.random() * (maxY - minY) + minY; const m = new window.Monstro(config.spriteNormal, { ...config, x, y, targetY, hasLanded: false, }); m.tipo = tipo; m.velY = config.velY; m.hasLanded = !m.velY; if(!m.hasLanded) m.y = y; else m.y = targetY; if (window.player) { const playerCX = window.player.x + window.player.width / 2; const playerCY = window.player.y + window.player.height / 2; m.angle = Math.atan2(playerCY - (m.y + m.hitboxOffsetY), playerCX - (m.x + m.hitboxOffsetX)); } else m.angle = Math.PI / 2; window.monstros.push(m); return m; }
function gerenciarSpawnDeMonstros() { if (!spawnInicial) return; for (const tipo in estoques) { if (Array.isArray(estoques[tipo])) { estoques[tipo].onScreenCount = 0; } } for (const m of window.monstros) { if (estoques[m.tipo]) { estoques[m.tipo].onScreenCount++; } } const TARGET_COUNT = 12; const MAX_COUNT = window.MAX_ON_SCREEN_MONSTERS || 18;; for (const tipo in estoques) { const estoque = estoques[tipo]; if (!Array.isArray(estoque) || estoque.length === 0) continue; const onScreen = estoque.onScreenCount; if (onScreen >= MAX_COUNT) { continue; } let spawnChance = 0; if (onScreen < TARGET_COUNT) { spawnChance = 0.6; } else { spawnChance = 0.1; } let qtdParaRepor = 0; if (Math.random() < spawnChance) { qtdParaRepor = Math.random() < 0.7 ? 1 : 2; } qtdParaRepor = Math.min(qtdParaRepor, estoque.length); for (let k = 0; k < qtdParaRepor; k++) { const cfg = estoque.shift(); spawnMonstro(tipo, cfg); } } }
function updateMonstros(deltaTime) { const now = Date.now(); const player = window.player; const playerFloorY = (window.cenarioOriginalHeight || 768) - (player?.height || 0) - 40; for (let i = window.monstros.length - 1; i >= 0; i--) { const m = window.monstros[i]; if (m.isBleeding && m.bleedDamagePerSecond > 0) { m.bleedParticleTimer = (m.bleedParticleTimer || 0) + deltaTime; m.bleedParticleInterval = m.bleedParticleInterval || 500; if (m.bleedParticleTimer >= m.bleedParticleInterval) { createBloodParticles(m.x + m.hitboxOffsetX, m.y + m.hitboxOffsetY, 3); m.bleedParticleTimer = 0; } m.bleedTickTimer = (m.bleedTickTimer || 0) + deltaTime; if (m.bleedTickTimer >= 1000) { const ticks = Math.floor(m.bleedTickTimer / 1000); const damageToDeal = m.bleedDamagePerSecond * ticks; m.vida -= damageToDeal; m.bleedTickTimer %= 1000; m.isHit = true; m.currentSprite = m.spriteHit; m.lastHitTime = Date.now(); } } if (player) { const playerCY = player.y + player.height / 2; const monstroCY = m.y + m.hitboxOffsetY; const playerCX = player.x + player.width / 2; const monstroCX = m.x + m.hitboxOffsetX; m.angle = Math.atan2(playerCY - monstroCY, playerCX - monstroCX); } if (m.hasLanded && now - (m.lastShotTime || 0) > (m.projectileCooldown || 5000)) { shootMonstro(m, player); m.lastShotTime = now; } if (!m.hasLanded) {
    // Lê a velocidade compartilhada do monstro.js (com fallback de 3 caso ocorra lag de carregamento)
    const multiplier = window.MONSTER_FALL_MULTIPLIER || 3;
    m.y += (m.velY * multiplier) * (deltaTime / 16.67);
     if (m.y >= m.targetY) { m.y = m.targetY; m.hasLanded = true; } } else { if (m.isReturning) { const dx = m.returnTargetX - (m.x + m.hitboxOffsetX); const dy = m.returnTargetY - (m.y + m.hitboxOffsetY); const distance = Math.hypot(dx, dy); if (distance < m.speed * 2) { m.isReturning = false; m.returnTargetX = null; m.returnTargetY = null; } else { const returnSpeed = m.speed * 1.5; m.x += (dx / distance) * returnSpeed; m.y += (dy / distance) * returnSpeed; } } else { const safeZoneY = 100; if (m.y < safeZoneY) { m.y += m.velY * 0.5; } m.x += (Math.random() - 0.5) * 2; m.y += (Math.random() - 0.5) * 1; if (player) { const playerCX = player.x + player.width / 2; const monstroCX = m.x + m.hitboxOffsetX; const dx = playerCX - monstroCX; m.velX = Math.sign(dx) * m.speed * (0.3 + Math.random() * 0.7); m.x += m.velX; } const needsToReturn = m.x < 0 || m.x > window.cenarioOriginalWidth || (playerFloorY > 0 && m.y > playerFloorY); if (needsToReturn) { m.isReturning = true; const safeZonePaddingX = 200; const safeZoneWidth = window.cenarioOriginalWidth - (safeZonePaddingX * 2); m.returnTargetX = safeZonePaddingX + Math.random() * safeZoneWidth; const safeZonePaddingY = 150; const safeZoneHeight = Math.max(100, playerFloorY - safeZonePaddingY * 2); m.returnTargetY = safeZonePaddingY + Math.random() * safeZoneHeight; } } for (let j = i - 1; j >= 0; j--) { const outro = window.monstros[j]; if (outro.hasLanded) { const dx = (m.x + m.hitboxOffsetX) - (outro.x + outro.hitboxOffsetX); const dy = (m.y + m.hitboxOffsetY) - (outro.y + outro.hitboxOffsetY); const dist = Math.hypot(dx, dy); const minDist = m.hitboxRadius + outro.hitboxRadius; if (dist < minDist) { const overlap = minDist - dist; const angle = Math.atan2(dy, dx); const moveX = (overlap / 2) * Math.cos(angle); const moveY = (overlap / 2) * Math.sin(angle); m.x += moveX; m.y += moveY; outro.x -= moveX; outro.y -= moveY; } } } } if (player && player.vida > 0) { const monstroCX = m.x + m.hitboxOffsetX; const monstroCY = m.y + m.hitboxOffsetY; const auraPadding = 10; const auraX = player.x + player.hitboxOffsetX - auraPadding; const auraY = player.y + player.hitboxOffsetY - auraPadding; const auraW = player.hitboxWidth + (auraPadding * 2); const auraH = player.hitboxHeight + (auraPadding * 2); if (circleRectCollision(monstroCX, monstroCY, m.hitboxRadius, auraX, auraY, auraW, auraH)) { if (player.reflectTouchDamageMultiplier > 0 && now - (m.lastReflectHitTime || 0) > 100) { m.lastReflectHitTime = now; const reflectDamageValue = player.attack * player.reflectTouchDamageMultiplier; const reflectAttackObject = { damage: reflectDamageValue }; window.HitSystem.checkProjectileVsTarget(reflectAttackObject, m); const contactX = Math.max(auraX, Math.min(monstroCX, auraX + auraW)); const contactY = Math.max(auraY, Math.min(monstroCY, auraY + auraH)); if (typeof window.criarImpacto === 'function') { criarImpacto(contactX, contactY, 'red', 1); } if (player.bleedDamage > 0) { m.isBleeding = true; m.bleedDamagePerSecond = (m.bleedDamagePerSecond || 0) + player.bleedDamage; } } } const playerHBX = player.x + player.hitboxOffsetX; const playerHBY = player.y + player.hitboxOffsetY; const playerHBW = player.hitboxWidth; const playerHBH = player.hitboxHeight; if (circleRectCollision(monstroCX, monstroCY, m.hitboxRadius, playerHBX, playerHBY, playerHBW, playerHBH)) { const monsterAttackObject = { damage: m.damage || 20 }; window.HitSystem.checkProjectileVsTarget(monsterAttackObject, player); if (typeof window.triggerDamageFlash === 'function') window.triggerDamageFlash(); const closestX = Math.max(playerHBX, Math.min(monstroCX, playerHBX + playerHBW)); const closestY = Math.max(playerHBY, Math.min(monstroCY, playerHBY + playerHBH)); const dist = Math.hypot(monstroCX - closestX, monstroCY - closestY); if (dist < m.hitboxRadius) { const overlap = m.hitboxRadius - dist; const angle = Math.atan2(monstroCY - closestY, monstroCX - closestX); m.x += overlap * Math.cos(angle); m.y += overlap * Math.sin(angle); } } } if (m.vida <= 0) { if (player && m.xpValue) window.addXP(m.xpValue); if (player && player.fragmentationProjectiles > 0) { const numFragmentos = Math.floor(player.fragmentationProjectiles); for (let f = 0; f < numFragmentos; f++) { const angle = Math.random() * Math.PI * 2; const speed = (player.projSpeed || 1) * 8; const fragProj = { x: m.x + m.hitboxOffsetX, y: m.y + m.hitboxOffsetY, prevX: m.x + m.hitboxOffsetX, prevY: m.y + m.hitboxOffsetY, velX: Math.cos(angle) * speed, velY: Math.sin(angle) * speed, radius: 5, color: 'rgba(160, 0, 255, 1)', damage: (player.attack || 10) * 0.10, penetration: 1, isCritico: false, invincibilityTimer: 400 }; window.hibridProjectiles.push(fragProj); } } window.monstros.splice(i, 1); continue; } } gerenciarSpawnDeMonstros(); updateMonstroProjectiles(deltaTime); checkColisoesComProjetilDoMago(); updateParticles(); if (spawnInicial && totalEstoqueRestante() === 0 && window.monstros.length === 0) { console.log(`[ORDA] Orda ${window.ordaAtual} completa antes do tempo! Iniciando a próxima imediatamente.`); spawnInicial = false; const proximaOrda = window.ordaAtual + 1; if (typeof window.iniciarOrda === 'function') { window.iniciarOrda(proximaOrda); } } }
function updateMonstroProjectiles(deltaTime) { for (let i = monstroProjectiles.length - 1; i >= 0; i--) { const p = monstroProjectiles[i]; p.x += p.velX; p.y += p.velY; if (window.player && circleRectCollision(p.x, p.y, p.radius, window.player.x + window.player.hitboxOffsetX, window.player.y + window.player.hitboxOffsetY, window.player.hitboxWidth, window.player.hitboxHeight)) { if (window.HitSystem.checkProjectileVsTarget(p, window.player)) { monstroProjectiles.splice(i, 1); } if (typeof window.criarImpacto === 'function') window.criarImpacto(p.x, p.y, p.color); if (typeof window.triggerDamageFlash === 'function') window.triggerDamageFlash(); if (window.player.reflectProjectileDamageMultiplier > 0 && window.monstros.length > 0) { const targetMonster = window.monstros[Math.floor(Math.random() * window.monstros.length)]; const reflectDamageValue = window.player.attack * window.player.reflectProjectileDamageMultiplier; const targetCX = targetMonster.x + targetMonster.hitboxOffsetX; const targetCY = targetMonster.y + targetMonster.hitboxOffsetY; if (typeof window.criarImpacto === 'function') { criarImpacto(targetCX, targetCY, 'red', 1); } const reflectAttackObject = { damage: reflectDamageValue }; window.HitSystem.checkProjectileVsTarget(reflectAttackObject, targetMonster); if (window.player.bleedDamage > 0) { targetMonster.isBleeding = true; targetMonster.bleedDamagePerSecond = (targetMonster.bleedDamagePerSecond || 0) + window.player.bleedDamage; } } continue; } let hitBlock = false; for (const bloco of (window.blocos || [])) { if (circleRectCollision(p.x, p.y, p.radius, bloco.x, bloco.y, bloco.width, bloco.height)) { if (typeof window.criarImpacto === 'function') window.criarImpacto(p.x, p.y, p.color); hitBlock = true; break; } } if (hitBlock) { monstroProjectiles.splice(i, 1); continue; } if (p.y > (window.cenarioOriginalHeight || 768) || p.x < 0 || p.x > (window.cenarioOriginalWidth || 1024)) { monstroProjectiles.splice(i, 1); } } }
function checkColisoesComProjetilDoMago() { const projMagos = window.projectiles||[]; if (projMagos.length) { for (let i=projMagos.length-1;i>=0;i--) { const p=projMagos[i]; let removeProj=false; for (let j=window.monstros.length-1;j>=0;j--) { const m=window.monstros[j]; if (!m) continue; const hitboxCX=m.x+m.hitboxOffsetX; const hitboxCY=m.y+m.hitboxOffsetY; if (lineCircleIntersection(p.prevX, p.prevY, p.x, p.y, hitboxCX, hitboxCY, m.hitboxRadius + p.radius)) { const isCritico=typeof window.criarImpacto==='function'?window.criarImpacto(p.x,p.y,p.color):false; p.isCritico=isCritico; if (window.HitSystem.checkProjectileVsTarget(p,m)) removeProj=true; if (window.player && window.player.bleedDamage > 0) { m.isBleeding = true; m.bleedDamagePerSecond = (m.bleedDamagePerSecond || 0) + window.player.bleedDamage; } m.isHit=true; m.currentSprite=m.spriteHit; m.lastHitTime=Date.now(); if (m.vida<=0 && typeof window.criarImpacto==='function') window.criarImpacto(hitboxCX,hitboxCY,'cyan',1.8); if (removeProj) break; } } if (removeProj) { projMagos.splice(i,1); continue; } for (let k=monstroProjectiles.length-1;k>=0;k--) { const pm=monstroProjectiles[k]; if (lineCircleIntersection(p.prevX, p.prevY, p.x, p.y, pm.x, pm.y, pm.radius + p.radius)) { if (typeof window.criarImpacto==='function') window.criarImpacto((p.x+pm.x)/2,(p.y+pm.y)/2,p.color||'cyan'); const resistencia = pm.hitsToDestroy || 3; monstroProjectiles.splice(k, 1); p.penetration = (p.penetration || 1) - resistencia; if (p.penetration <= 0) removeProj=true; break; } } if (removeProj) { projMagos.splice(i,1); continue; } for (let k = window.hibridProjectiles.length - 1; k >= 0; k--) { const ph = window.hibridProjectiles[k]; if ((ph.invincibilityTimer || 0) <= 0 && lineCircleIntersection(p.prevX, p.prevY, p.x, p.y, ph.x, ph.y, ph.radius + p.radius)) { if (typeof window.criarImpacto === 'function') window.criarImpacto((p.x + ph.x) / 2, (p.y + ph.y) / 2, 'white'); window.hibridProjectiles.splice(k, 1); p.penetration = 0; removeProj = true; break; } } if (removeProj) projMagos.splice(i,1); } } if (window.raiosDoMago.length) { for (let i = window.raiosDoMago.length - 1; i >= 0; i--) { const r = window.raiosDoMago[i]; let raioPenetration = r.penetration || 1; const monstrosAtingidosPorEsteRaio = new Set(); for (let j = window.monstros.length - 1; j >= 0; j--) { if (raioPenetration <= 0) break; const m = window.monstros[j]; if (!m || monstrosAtingidosPorEsteRaio.has(m)) continue; const monstroCX = m.x + m.hitboxOffsetX; const monstroCY = m.y + m.hitboxOffsetY; let hitThisMonster = false; for (const seg of r.segmentos) { const dx = seg.x2 - seg.x1; const dy = seg.y2 - seg.y1; const t = ((monstroCX - seg.x1) * dx + (monstroCY - seg.y1) * dy) / (dx*dx + dy*dy); const closestT = Math.max(0, Math.min(1, t)); const closestX = seg.x1 + closestT * dx; const closestY = seg.y1 + closestT * dy; const dist = Math.hypot(monstroCX - closestX, monstroCY - closestY); if (dist < (r.radius + m.hitboxRadius)) { const projTemp = { damage: r.damage, penetration: 1 }; window.HitSystem.checkProjectileVsTarget(projTemp, m); if (window.player && window.player.bleedDamage > 0) { m.isBleeding = true; m.bleedDamagePerSecond = (m.bleedDamagePerSecond || 0) + window.player.bleedDamage; } hitThisMonster = true; monstrosAtingidosPorEsteRaio.add(m); m.isHit = true; m.currentSprite = m.spriteHit; m.lastHitTime = Date.now(); if (m.vida <= 0 && typeof window.criarImpacto === 'function') window.criarImpacto(monstroCX, monstroCY,'cyan',1.8); break; } } if (hitThisMonster) raioPenetration--; } for (let k = monstroProjectiles.length - 1; k >= 0; k--) { if (raioPenetration <= 0) break; const pm = monstroProjectiles[k]; for (const seg of r.segmentos) { if (lineCircleIntersection(seg.x1, seg.y1, seg.x2, seg.y2, pm.x, pm.y, pm.radius + (r.radius/2))) { const penCost = pm.hitsToDestroy || 1; raioPenetration -= penCost; if (typeof window.criarImpacto === 'function') window.criarImpacto(pm.x, pm.y, 'white', 1.2); monstroProjectiles.splice(k, 1); break; } } } r.penetration = raioPenetration; if (r.penetration <= 0) window.raiosDoMago.splice(i,1); } } }
function circleRectCollision(cx,cy,r,rx,ry,rw,rh){const closestX=Math.max(rx,Math.min(cx,rx+rw));const closestY=Math.max(ry,Math.min(cy,ry+rh));const dx=cx-closestX;const dy=cy-closestY;return (dx*dx+dy*dy)<(r*r);}
function lineCircleIntersection(x1, y1, x2, y2, cx, cy, cr) { const dx = x2 - x1; const dy = y2 - y1; const a = dx * dx + dy * dy; const b = 2 * (dx * (x1 - cx) + dy * (y1 - cy)); const c = (x1 - cx) * (x1 - cx) + (y1 - cy) * (y1 - cy) - cr * cr; if (a === 0) return false; const discriminant = b * b - 4 * a * c; if (discriminant < 0) return false; const t1 = (-b + Math.sqrt(discriminant)) / (2 * a); const t2 = (-b - Math.sqrt(discriminant)) / (2 * a); if ((t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1)) return true; if (t1 < 0 && t2 > 1 || t2 < 0 && t1 > 1) return true; return false; }

function drawMonstros() { 
    // KILL SWITCH: Se o multiplayer foi ativado, esvazia e bloqueia os tiros offline pela raiz
    if (window.isMultiplayer) {
        if (monstroProjectiles.length > 0) {
            monstroProjectiles.length = 0;
        }
    } else {
        // Só desenha os tiros offline se estiver jogando o Singleplayer
        for (const p of monstroProjectiles) { 
            const screenX = (p.x - window.offsetX) * window.scale; 
            const screenY = (p.y - window.offsetY) * window.scale; 
            window.ctx.beginPath(); 
            window.ctx.arc(screenX, screenY, p.radius * window.scale, 0, Math.PI * 2); 
            window.ctx.fillStyle = p.color; 
            window.ctx.fill(); 
        } 
    }
    
    // Desenha os monstros (que já são gerenciados de forma correta pelo servidor/cliente)
    for (const m of window.monstros) {
        drawMonstro(m); 
    }
}


function drawMonstro(m){ if(!m.img || !m.img.complete) return; const imgToDraw=window.loadedImages[m.currentSprite]||m.img; const screenX=(m.x-window.offsetX)*window.scale; const screenY=(m.y-window.offsetY)*window.scale; const centerX=screenX+m.hitboxOffsetX*window.scale; const centerY=screenY+m.hitboxOffsetY*window.scale; window.ctx.save(); window.ctx.translate(centerX,centerY); window.ctx.rotate(m.angle||0); window.ctx.globalAlpha=m.opacity; window.ctx.drawImage(imgToDraw,-m.width/2+(m.spriteOffsetX||0),-m.height/2+(m.spriteOffsetY||0),m.width,m.height); window.ctx.globalAlpha=1; window.ctx.restore(); window.ctx.beginPath(); window.ctx.arc(centerX, centerY, m.hitboxRadius * window.scale, 0, Math.PI * 2); window.ctx.strokeStyle = 'yellow'; window.ctx.stroke(); }
function shootMonstro(m, targetPlayer){ const p = monstroProjectilePool.length > 0 ? monstroProjectilePool.pop() : {}; p.x = m.x + m.hitboxOffsetX; p.y = m.y + m.hitboxOffsetY; const angle = targetPlayer ? Math.atan2((targetPlayer.y + targetPlayer.height / 2) - p.y, (targetPlayer.x + targetPlayer.width / 2) - p.x) : Math.PI / 2; p.velX = Math.cos(angle) * m.projectileSpeed; p.velY = Math.sin(angle) * m.projectileSpeed; p.radius = m.projectileSize; p.color = m.projectileColor || 'rgba(160,0,255,1)'; p.hitsToDestroy = m.projectileHits || 3; p.damage = m.projectileDamage || 10; p.penetration = m.projectilePenetration || 1; monstroProjectiles.push(p); }
function drawMonstroCounter() { const ctx = window.ctx; ctx.save(); ctx.font = "18px Arial"; ctx.fillStyle = "white"; ctx.textAlign = "right"; ctx.textBaseline = "top"; const padding = 20; const x = (window.canvas?.width || 1024) - padding; const y = padding; const telaAtivos = window.monstros.length; const totalRestante = totalEstoqueRestante(); const ordaAtual = window.ordaAtual; ctx.fillText(`Orda: ${ordaAtual}`, x, y); ctx.fillText(`Tela: ${telaAtivos}`, x, y + 22); ctx.fillText(`Total: ${totalRestante}`, x, y + 44); let offset = 66; for (let tipo in estoques) { if (Array.isArray(estoques[tipo])) { const onScreenCount = window.monstros.filter(m => m.tipo === tipo).length; ctx.fillText(`Tela ${tipo}: ${onScreenCount}`, x, y + offset); offset += 22; } } ctx.restore(); }


// Novo Contador Limpo no formato Wave: X
function drawWaveCounter() {
    // 1. Bloqueia o desenho se o menu principal ainda estiver aberto
    const menu = document.getElementById('menu');
    if (menu && menu.style.display !== 'none') {
        return;
    }

    // 2. Bloqueia o desenho se estiver no lobby de conexão do multiplayer esperando o Start
    if (window.isMultiplayer && !window.gameActive) {
        return;
    }

    const ctx = window.ctx;
    ctx.save();
    ctx.font = "bold 26px 'Courier New', monospace"; // Fonte pixelada limpa
    ctx.fillStyle = "white";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    
    // Efeito de sombra leve para garantir legibilidade no cenário
    ctx.shadowBlur = 6;
    ctx.shadowColor = "black";
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    const padding = 25;
    const x = (window.canvas?.width || 1024) - padding;
    const y = padding;
    
    const ordaAtual = window.ordaAtual || 1;
    ctx.fillText(`Wave: ${ordaAtual}`, x, y);
    ctx.restore();
}

// Expõe a nova função para o escopo global
window.drawWaveCounter = drawWaveCounter;


window.criarMonstros = criarMonstros;
window.updateMonstros = updateMonstros;
window.drawMonstros = drawMonstros;
window.drawMonstroCounter = drawMonstroCounter;
window.drawParticles = drawParticles;
window.updateHibridProjectiles = updateHibridProjectiles;
window.drawHibridProjectiles = drawHibridProjectiles;
window.monstroProjectiles = monstroProjectiles;
window.clearMonstroProjectiles = function() {
    monstroProjectiles.length = 0;
};