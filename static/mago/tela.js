// =================================================================
// TELA.JS (Visualização Base e Fluxo Single-Player)
// =================================================================

window.canvas = document.getElementById('gameCanvas');
window.ctx = window.canvas.getContext('2d');

// O controle de monstros local para o modo offline
window.monstros = [];
window.raiosDoMago = []; 
window.raioTimer = 0; 
window.raioInterval = 2000; 
window.raioDuracao = 100;

// Estado padrão ao carregar
window.isMultiplayer = false;

window.playerLastLevel = window.player ? window.player.level : 1;
const cenarioOriginalWidth = 2176;
const cenarioOriginalHeight = 1057;
const cenarioImg = new Image();
cenarioImg.src = 'cenario.png';
window.scale = 1;
window.offsetX = 0;
window.offsetY = 0;
const minViewWidth = 800;
const minViewHeight = 600;

// Variáveis para flash de dano
window.damageFlash = { active: false, duration: 50, timer: 0 };
const damageFlashCooldown = 400;
let lastDamageFlashTime = 0;

function triggerDamageFlash() {
    const now = Date.now();
    if (now - lastDamageFlashTime > damageFlashCooldown) {
        window.damageFlash.active = true;
        window.damageFlash.timer = window.damageFlash.duration;
        lastDamageFlashTime = now;
    }
}
window.triggerDamageFlash = triggerDamageFlash;

window.isPaused = false;
function togglePause(force = false) {
    const menuPrincipal = document.getElementById('menu');
    if (menuPrincipal && menuPrincipal.style.display !== 'none') {
        return;
    }
    if (window.isMultiplayer && !force) {
        if (typeof window.requestMultiplayerPause === 'function') {
            window.requestMultiplayerPause();
        }
    } else {
        window.isPaused = !window.isPaused;
        updatePauseUI(window.isPaused);
    }
}
window.togglePause = togglePause;

function updatePauseUI(pausedState) {
    const runaOverlay = document.getElementById('runa-overlay');
    if (runaOverlay) {
        if (pausedState) {
            if (!window.isLevelUpPause) {
                runaOverlay.style.display = 'none';
            }
        } else {
            if (window.isLevelUpPause) {
                runaOverlay.style.display = 'flex';
            }
        }
    }
    
    const saveContainer = document.getElementById('save-slots-container');
    const multiplayerContainer = document.getElementById('multiplayer-ui');

    if (pausedState) {
        if (multiplayerContainer) multiplayerContainer.style.display = 'flex';
        if (typeof window.updateMultiplayerUI === 'function') {
            window.updateMultiplayerUI();
        }
        
        // CORREÇÃO: Nunca exibe o menu de salvamento no multiplayer. Fica exclusivo do Singleplayer offline.
        if (window.isMultiplayer) {
            if (saveContainer) saveContainer.style.display = 'none';
        } else {
            if (saveContainer) saveContainer.style.display = 'flex';
        }
        
        if (typeof updateSaveSlotsUI === 'function') {
            updateSaveSlotsUI();
        }
    } else {
        if (saveContainer) saveContainer.style.display = 'none';
        if (multiplayerContainer) multiplayerContainer.style.display = 'none';
        if (typeof toggleDeleteMode === 'function') {
            toggleDeleteMode(false);
        }
    }
}

// Bloqueia o ESC se o jogo estiver pausado no Level Up OU esperando o outro jogador escolher
document.addEventListener('keydown', e => { 
    if (e.code === 'Escape') {
        if (window.isLevelUpPause || window.waitingForOtherPlayer) return;
        togglePause(); 
    }
});

function isGamePaused() {
    return window.isPaused || window.isLevelUpPause;
}

window.showBars = true;
document.addEventListener('keydown', e => {
    if (e.ctrlKey) window.showBars = !window.showBars;
});

// Funções Auxiliares de HUD e Barras
function drawBar(x, y, width, height, percent, bgColor, fillColor, borderColor = 'rgba(0,0,0,0.5)') {
    const ctx = window.ctx;
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, width * Math.max(0, percent), height);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 12 * window.scale;
    ctx.strokeRect(x, y, width, height);
}

function drawVidaIcon() {
    if (!window.player || !window.ctx) return;
    if (!window.vidaImg) { window.vidaImg = new Image(); window.vidaImg.src = 'VIDA.png'; return; }
    if (!window.vidaImg.complete) return;
    const ctx = window.ctx;
    const x = 8 * window.scale;
    const y = window.canvas.height - 16 * window.scale - 10 * window.scale;
    const iconScale = 15;
    const iconW = 32 * iconScale * window.scale;
    const iconH = 32 * iconScale * window.scale;
    const iconX = x + 440 * window.scale / 2 - iconW / 2 - 90 * window.scale;
    const iconY = +y - 290 * window.scale;
    ctx.drawImage(window.vidaImg, iconX, iconY, iconW, iconH);
}

function drawPlayerHealthBar() {
    if (!window.player || !window.ctx || !window.showBars) return;
    const player = window.player;
    const barWidth = 320 * window.scale;
    const barHeight = 16 * window.scale;
    const x = 9 * window.scale;
    const y = window.canvas.height - barHeight - 10 * window.scale;
    const healthPercent = Math.max(0, player.vida / player.vidaMax);
    drawBar(x, y, barWidth, barHeight, healthPercent, 'red', 'purple');
}

function drawPowerBar() {
    if (!window.player || !window.ctx || !window.showBars) return;
    const ctx = window.ctx;
    const barWidth = 40 * window.scale;
    const barHeight = 8 * window.scale;
    const baseX = 9 * window.scale;
    const baseY = window.canvas.height - 16 * window.scale - 10 * window.scale;
    const x = baseX + 254 * window.scale;
    const y = baseY - 98 * window.scale;
    const now = Date.now();
    const baseCooldown = window.raioCooldown || 2000;
    const reduction = window.player?.raioCooldownReduction || 0;
    const finalCooldown = baseCooldown * (1 - Math.min(reduction, 0.8));
    const timeSinceLast = now - (window.lastRaioTime || 0);
    const powerPercent = Math.min(1, timeSinceLast / finalCooldown);
    drawBar(x, y, barWidth, barHeight, powerPercent, 'rgba(255,255,255,.5)', 'cyan');
}

function drawXPBar() {
    if (!window.player || !window.ctx || !window.showBars) return;
    const barWidth = 80 * window.scale;
    const barHeight = 8 * window.scale;
    const baseX = 9 * window.scale;
    const baseY = window.canvas.height - 16 * window.scale - 10 * window.scale;
    const x = baseX + 40 * window.scale;
    const y = baseY - 230 * window.scale;
    const xpPercent = (window.player.xp && window.player.xpMax) ? Math.max(0, window.player.xp / window.player.xpMax) : 0;
    drawBar(x, y, barWidth, barHeight, xpPercent, 'rgba(255,255,255,.5)', 'rgba(255,255,255,1)');
    const ctx = window.ctx;
    const level = window.player.level || 1;
    ctx.save();
    const levelTextOffsetX = -15;
    const levelTextOffsetY = 4;
    const fontSize = 16;
    const levelTextX = x + (levelTextOffsetX * window.scale);
    const levelTextY = y + (levelTextOffsetY * window.scale);
    ctx.shadowColor = 'white';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'black';
    ctx.font = `bold ${fontSize * window.scale}px Arial`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`lvl ${level}`, levelTextX, levelTextY);
    ctx.restore();
}

function drawHUD() {
    if (!window.showBars) return;
    drawVidaIcon();
    drawPlayerHealthBar();
    drawPowerBar();
    drawXPBar();
}

function resizeCanvas() {
    window.canvas.width = window.innerWidth;
    window.canvas.height = window.innerHeight;
    calcularCamera();
    if (typeof recriarGrama === 'function' && window.gramaRoxa && window.gramaRoxa.length === 0) {
        recriarGrama();
    }
}
window.addEventListener('resize', resizeCanvas);

function calcularCamera() {
    const cw = window.canvas.width;
    const ch = window.canvas.height;
    const scaleX = cw / cenarioOriginalWidth;
    const scaleY = ch / cenarioOriginalHeight;
    let newScale = Math.min(scaleX, scaleY);
    const minScaleX = minViewWidth / cenarioOriginalWidth;
    const minScaleY = minViewHeight / cenarioOriginalHeight;
    const minScale = Math.max(minScaleX, minScaleY);
    if (newScale < minScale) newScale = minScale;
    window.scale = newScale;
    const viewWidth = cw / window.scale;
    const viewHeight = ch / window.scale;
    if (window.player && window.player.width > 0) {
        window.offsetX = window.player.x + window.player.width / 2 - viewWidth / 2;
        window.offsetY = window.player.y + window.player.height / 2 - viewHeight / 2;
        window.offsetX = Math.max(0, Math.min(window.offsetX, cenarioOriginalWidth - viewWidth));
        window.offsetY = Math.max(0, Math.min(window.offsetY, cenarioOriginalHeight - viewHeight));
    } else {
        window.offsetX = (cenarioOriginalWidth - viewWidth) / 2;
        window.offsetY = (cenarioOriginalHeight - viewHeight) / 2;
    }
}

function drawCenario() {
    if (!cenarioImg.complete) return;
    const cw = window.canvas.width;
    const ch = window.canvas.height;
    const viewWidth = cw / window.scale;
    const viewHeight = ch / window.scale;
    window.ctx.clearRect(0, 0, cw, ch);
    window.ctx.drawImage(cenarioImg, window.offsetX, window.offsetY, viewWidth, viewHeight, 0, 0, cw, ch);
}

// Raios Ambientais
function spawnRaio() {
    const cw = window.canvas.width; const ch = window.canvas.height;
    const xTela = Math.random() * cw; const x = xTela / window.scale + window.offsetX;
    const segmentos = []; let atualX = x; let atualY = window.offsetY; const passos = 14;
    for (let i = 0; i < passos; i++) {
        const proxX = atualX + (Math.random() - 0.5) * 40;
        const proxY = window.offsetY + ((i + 1) * (ch / passos)) / window.scale;
        segmentos.push({ x1: atualX, y1: atualY, x2: proxX, y2: proxY });
        atualX = proxX; atualY = proxY;
    }
    const novoRaio = { segmentos, timer: window.raioDuracao, damage: (window.baseRaioDamage || 500) + (window.player.attack || 0), penetration: 10, radius: 2 };

    window.raiosDoMago.push(novoRaio);
    
    if (window.isMultiplayer && typeof window.broadcastScenarioLightning === 'function') {
        window.broadcastScenarioLightning(novoRaio);
    }
}

function updateRaios(deltaTime) {
    if (!deltaTime) return;
    if (!window.isMultiplayer || (window.isMultiplayer && window.multiplayer.playerNumber === 1)) {
        window.raioTimer += deltaTime;
        const baseInterval = window.raioInterval || 2000;
        const reduction = window.player?.raioCenarioIntervalReduction || 0;
        const finalInterval = baseInterval * (1 - Math.min(reduction, 0.8));
        if (!isGamePaused() && window.raioTimer >= finalInterval) {
            window.raioTimer = 0;
            spawnRaio();
        }
    }

    for (let i = window.raiosDoMago.length - 1; i >= 0; i--) {
        const r = window.raiosDoMago[i];
        r.timer -= deltaTime;
        if (r.timer <= 0) {
            window.raiosDoMago.splice(i, 1);
        }
    }
}

function drawRaios() {
    if (!window.raiosDoMago) return;
    const ctx = window.ctx; ctx.save();
    ctx.lineWidth = 2 * window.scale; ctx.shadowBlur = 20; ctx.shadowColor = 'white'; ctx.strokeStyle = 'rgba(255, 255, 200, 0.9)';
    for (const raio of window.raiosDoMago) {
        ctx.beginPath();
        for (const seg of raio.segmentos) {
            const x1 = (seg.x1 - window.offsetX) * window.scale; const y1 = (seg.y1 - window.offsetY) * window.scale;
            const x2 = (seg.x2 - window.offsetX) * window.scale; const y2 = (seg.y2 - window.offsetY) * window.scale;
            ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        }
        ctx.stroke();
    }
    ctx.restore();
}

// Interfaces de Pausa e Debug
function drawPauseOverlay() { const ctx = window.ctx; const cw = window.canvas.width; const ch = window.canvas.height; ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0, 0, cw, ch); ctx.save(); ctx.font = `${50 * window.scale}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'white'; ctx.fillText('PAUSE', cw / 2, ch / 2); ctx.restore(); if (window.player) { drawPauseInfoPanel(); } }
function roundRect(ctx, x, y, width, height, radius, fill, stroke) { if (typeof stroke === 'undefined') stroke = true; if (typeof radius === 'undefined') radius = 5; if (typeof radius === 'number') { radius = {tl: radius, tr: radius, br: radius, bl: radius}; } else { var defaultRadius = {tl: 0, tr: 0, br: 0, bl: 0}; for (var side in defaultRadius) { radius[side] = radius[side] || defaultRadius[side]; } } ctx.beginPath(); ctx.moveTo(x + radius.tl, y); ctx.lineTo(x + width - radius.tr, y); ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr); ctx.lineTo(x + width, y + height - radius.br); ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height); ctx.lineTo(x + radius.bl, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl); ctx.lineTo(x, y + radius.tl); ctx.quadraticCurveTo(x, y, x + radius.tl, y); ctx.closePath(); if (fill) ctx.fill(); if (stroke) ctx.stroke(); }
function drawPauseInfoPanel() { const ctx = window.ctx; const cw = window.canvas.width; const player = window.player; const panelWidth = cw * 0.9; const panelHeight = 60 * window.scale; const x = (cw - panelWidth) / 2; const y = 80 * window.scale; const attackSpeedPercent = Math.round((player.atkSpeed || 0) * 100); const baseShotCooldown = player.attackCooldown || 200; const finalShotCooldown = baseShotCooldown * (1 - Math.min(0.9, (player.atkSpeed || 0))); const tirosPorSegundo = (1000 / finalShotCooldown).toFixed(1); const projSpeedPercent = Math.round((player.projSpeed || 0) * 100); const critChancePercent = Math.round((player.critChance || 0) * 100); const projCount = Math.floor(player.projectileCount || 1); const regenVal = (player.hpRegen || 0).toFixed(1); const xpMultPct = Math.round(((player.xpGainMultiplier || 1.0) - 1) * 100); const luckVal = Math.round((player.luck || 0) * 100); const baseRaioCd = window.raioCooldown || 2000; const finalRaioCdMs = baseRaioCd * (1 - Math.min(0.8, (player.raioCooldownReduction || 0))); const baseCenarioInterval = window.raioInterval || 2000; const cenarioReduction = player.raioCenarioIntervalReduction || 0; const finalCenarioInterval = baseCenarioInterval * (1 - Math.min(cenarioReduction, 0.8)); const bleedDmg = (player.bleedDamage || 0).toFixed(1); const fragCount = Math.floor(player.fragmentationProjectiles || 0); const reflectTouchPct = Math.round((player.reflectTouchDamageMultiplier || 0) * 100); const reflectProjPct = Math.round((player.reflectProjectileDamageMultiplier || 0) * 100); const attrs = [ `Level: ${player.level || 1}`, `Sorte: +${luckVal}%`, `HP: ${Math.round(player.vida)}/${player.vidaMax}`, `Regen HP: +${regenVal}/s`, `Bônus XP: +${xpMultPct}%`, `Ataque: ${player.attack || 0}`, `Projéteis: ${projCount}`, `Vel. Ataque: +${attackSpeedPercent}% (${tirosPorSegundo}/s)`, `Crítico: Chance ${critChancePercent}% Dano x${player.critMultiplier || 1.5}`, `Perfuração: ${player.projectilePenetration || 0}`, `Vel. Projétil: +${projSpeedPercent}%`, `Recarga Raio (Cajado): ${(finalRaioCdMs / 1000).toFixed(1)}s`, `Dano Raio (Cenário): ${(window.baseRaioDamage || 500) + (player.attack || 0)}`, `Intervalo Raio (Cenário): ${(finalCenarioInterval / 1000).toFixed(1)}s`, `Sangramento: ${bleedDmg}/s`, `Fragmentos: ${fragCount}`, `Reflect Toque: +${reflectTouchPct}%`, `Reflect Projétil: +${reflectProjPct}%` ]; const maxPerLine = 5; const lineHeight = panelHeight + 10 * window.scale; for (let lineIndex = 0; lineIndex < Math.ceil(attrs.length / maxPerLine); lineIndex++) { const lineY = y + lineIndex * lineHeight; ctx.save(); ctx.fillStyle = '#111'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 10; roundRect(ctx, x, lineY, panelWidth, panelHeight, 12 * window.scale, true, false); ctx.restore(); ctx.save(); ctx.fillStyle = '#0f0'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6; const barWidth = 12 * window.scale; const radius = 6 * window.scale; ctx.beginPath(); ctx.moveTo(x + barWidth, lineY); ctx.lineTo(x + barWidth, lineY + panelHeight); ctx.lineTo(x + radius, lineY + panelHeight); ctx.quadraticCurveTo(x, lineY + panelHeight, x, y + panelHeight - radius); ctx.lineTo(x, lineY + radius); ctx.quadraticCurveTo(x, lineY, x + radius, lineY); ctx.closePath(); ctx.fill(); ctx.restore(); } ctx.save(); ctx.font = `${18 * window.scale}px 'Courier New', monospace`; ctx.fillStyle = 'white'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; const leftOffset = 30 * window.scale; const usableWidth = panelWidth - leftOffset - (10 * window.scale); const columnWidth = usableWidth / maxPerLine; for (let i = 0; i < attrs.length; i++) { const lineIndex = Math.floor(i / maxPerLine); const colIndex = i % maxPerLine; const textX = x + leftOffset + (colIndex * columnWidth); const textY = y + panelHeight / 2 + lineIndex * lineHeight; ctx.fillText(attrs[i], textX, textY); } ctx.restore(); }

function checkLevelUp() {
    if (!window.player || window.isMultiplayer) return;
    const currentLevel = window.player.level;
    const levelsGained = currentLevel - window.playerLastLevel;
    if (levelsGained > 0) {
        window.abrirEscolhaDeRuna(levelsGained);
        window.playerLastLevel = currentLevel;
    }
}

// LOOP PRINCIPAL DO JOGO
let lastTime = 0;
let animationFrameId = null; // Guard de renderização global contra frames duplicados

function gameLoop(time = 0) {
    const deltaTime = time - lastTime;
    lastTime = time;

    // Sincronia de comunicação de rede no multiplayer
    if (window.isMultiplayer && typeof window.updateMultiplayerNetwork === 'function') {
        window.updateMultiplayerNetwork(deltaTime);
    }

    window.ctx.clearRect(0, 0, window.canvas.width, window.canvas.height);

    if (isGamePaused()) {
        drawCenario();
        if (typeof drawGrama === 'function') { if (window.gramaAmarela) drawGrama(window.gramaAmarela); if (window.gramaRoxa) drawGrama(window.gramaRoxa); }
        if (typeof drawPlayer === 'function') drawPlayer();
        
        if (window.isMultiplayer && typeof window.drawOtherPlayers === 'function') {
            window.drawOtherPlayers();
        }
        
        if (typeof drawMonstros === 'function') drawMonstros();
        if (typeof drawParticles === 'function') drawParticles();
        if (typeof drawHibridProjectiles === 'function') drawHibridProjectiles();
        if (typeof drawImpactos === 'function') drawImpactos(deltaTime);
        if(typeof drawLevelUpEffects === 'function') drawLevelUpEffects();
        if(typeof drawMaxLevelAuraEffects === 'function') drawMaxLevelAuraEffects();
        drawHUD();
        drawRaios();
        if (window.isLevelUpPause && typeof window.drawRunasOverlay === 'function') { window.drawRunasOverlay(); }
        
        // CORREÇÃO DE PRIORIDADE: Apenas desenha o painel de pausa tradicional (do ESC) se NÃO estiver no Level-Up (escolha de runas)
        if (window.isPaused && !window.isLevelUpPause) { drawPauseOverlay(); }
        
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(gameLoop);
        return;
    }

    // Fluxo de atualização exclusivo do Multiplayer
    if (window.isMultiplayer) {
        if (typeof window.updateOtherPlayers === 'function') window.updateOtherPlayers(deltaTime);
        if (typeof window.updateClientMonsters === 'function') window.updateClientMonsters(deltaTime);
        if (typeof checkColisoesComProjetilDoMago === 'function') checkColisoesComProjetilDoMago();
        if (typeof updateParticles === 'function') updateParticles();
        if (typeof updateHibridProjectiles === 'function') updateHibridProjectiles(deltaTime);
    }

    if (typeof updatePlayerStatus === 'function') updatePlayerStatus(deltaTime);
    if (window.player && typeof movePlayer === 'function') movePlayer();
    if (typeof verificarColisoes === 'function') verificarColisoes();
    
    // Fluxo de atualização exclusivo do Singleplayer
    if (!window.isMultiplayer) {
        if (typeof updateMonstros === 'function') updateMonstros(deltaTime);
        if (typeof updateHibridProjectiles === 'function') updateHibridProjectiles(deltaTime);
        checkLevelUp();
    }
    
    if (typeof updateImpactos === 'function') updateImpactos(deltaTime);
    if(typeof updateLevelUpEffects === 'function') updateLevelUpEffects(deltaTime);
    if(typeof updateMaxLevelAuraEffects === 'function') updateMaxLevelAuraEffects(deltaTime);
    if (typeof updateGramaBalance === 'function') { if (window.gramaAmarela) updateGramaBalance(window.gramaAmarela, deltaTime); if (window.gramaRoxa) updateGramaBalance(window.gramaRoxa, deltaTime); }
    if (typeof shoot === 'function') { shoot(); if (typeof updateProjectiles === 'function') updateProjectiles(deltaTime); }
    updateRaios(deltaTime);

    calcularCamera();
    drawCenario();
    
    if (typeof drawGrama === 'function' && window.gramaAmarela) drawGrama(window.gramaAmarela);
    if (window.player && typeof drawPlayer === 'function') drawPlayer();
    
    if (window.isMultiplayer && typeof window.drawOtherPlayers === 'function') {
        window.drawOtherPlayers();
    }
    
    if (typeof drawGrama === 'function' && window.gramaRoxa) drawGrama(window.gramaRoxa);
    if (window.player && typeof drawStaff === 'function') drawStaff();
    
    if (typeof drawProjectiles === 'function') drawProjectiles();
    if (typeof drawHibridProjectiles === 'function') drawHibridProjectiles();
    if (typeof drawMonstros === 'function') drawMonstros(); 
    if (typeof drawImpactos === 'function') drawImpactos(deltaTime);
    if (typeof drawParticles === 'function') drawParticles();
    //if (typeof drawMonstroCounter === 'function') drawMonstroCounter();
    // exibição do contador de monstros restantes na tela
    drawHUD();
    drawRaios();

    if (window.damageFlash.active) {
        window.damageFlash.timer -= deltaTime;
        if (window.damageFlash.timer <= 0) window.damageFlash.active = false;
        const alpha = (window.damageFlash.timer / window.damageFlash.duration) * 1;
        window.ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        window.ctx.fillRect(0, 0, window.canvas.width, window.canvas.height);
    }
    
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(gameLoop);
}

window.resizeCanvas = resizeCanvas;
window.gameLoop = gameLoop;
window.cenarioOriginalWidth = cenarioOriginalWidth;
window.cenarioOriginalHeight = cenarioOriginalHeight;

// Reseta todos os atributos locais do jogador de volta ao Nível 1 base
window.resetPlayerStats = function() {
    if (!window.player) return;
    const player = window.player;
    
    player.level = 1;
    player.xp = 0;
    player.xpMax = 100;
    player.vidaMax = 1000;
    player.vida = 1000;
    player.attack = 20;
    player.attackCooldown = 100;
    player.projectilePenetration = 10;
    player.critChance = 0.05;
    player.critMultiplier = 1.5;
    player.projectileCount = 1;
    player.raioCooldownReduction = 0;
    player.xpGainMultiplier = 1.0;
    player.hpRegen = 0;
    player.luck = 0;
    player.reflectTouchDamageMultiplier = 0;
    player.reflectProjectileDamageMultiplier = 0;
    player.fragmentationProjectiles = 0;
    player.bleedDamage = 0;
    
    // Limpa projéteis locais esvaziando o comprimento (length = 0), mantendo a referência correta na memória dos outros arquivos
    if (window.projectiles) window.projectiles.length = 0;
    if (window.hibridProjectiles) window.hibridProjectiles.length = 0;
    if (window.monstros) window.monstros.length = 0;
    if (window.raiosDoMago) window.raiosDoMago.length = 0;
    if (window.impactos) window.impactos.length = 0;
    if (window.particles) window.particles.length = 0;
    
    // Limpa em definitivo os projéteis locais dos monstros de ambas as telas (offline e online)
    if (window.monstroProjectiles) window.monstroProjectiles.length = 0;
    if (window.mpMonstroProjectiles) window.mpMonstroProjectiles.length = 0;
    
    // Reseta variáveis globais de controle de interface e hordas
    window.ordaAtual = 1;
    window.playerLastLevel = 1;
    window.isLevelUpPause = false;
    window.isPaused = false;
    window.waitingForOtherPlayer = false;
    window.gameActive = false;
    
    if (typeof window.resetRunas === 'function') {
        window.resetRunas();
    }
};

function setupMenuAndInput() {
    const menu = document.getElementById('menu');
    const wizzText = document.querySelector('.wizz-text');
    const flashlightCursor = document.querySelector('.flashlight-cursor');
    const cursorLight = document.querySelector('.cursor-light');
    const gameCursor = document.getElementById('game-cursor');
    const iCircles = [ { el: document.getElementById('iCircle1'), timeout:null }, { el: document.getElementById('iCircle2'), timeout:null }, { el: document.getElementById('iCircle3'), timeout:null }, { el: document.getElementById('iCircle4'), timeout:null } ];
    
    function updateICircleGradient(index, x, y){ if(wizzText) { wizzText.style.setProperty(`--icircle${index}-x`, `${x}%`); wizzText.style.setProperty(`--icircle${index}-y`, `${y}%`); } }
    
    document.addEventListener("mousemove", (e)=>{
        if (gameCursor) { gameCursor.style.left = e.clientX + 'px'; gameCursor.style.top = e.clientY + 'px'; }
        if(menu && menu.style.display !== "none"){
            const rect = menu.getBoundingClientRect();
            const x = e.clientX - rect.left; const y = e.clientY - rect.top;
            const percentX = (x / rect.width) * 100; const percentY = (y / rect.height) * 100;
            if(wizzText) { wizzText.style.setProperty("--mouse-x", `${percentX}%`); wizzText.style.setProperty("--mouse-y", `${percentY}%`); }
            if(flashlightCursor) { flashlightCursor.style.left = e.clientX + "px"; flashlightCursor.style.top = e.clientY + "px"; }
            if(cursorLight) { cursorLight.style.left = e.clientX + "px"; cursorLight.style.top = e.clientY + "px"; cursorLight.classList.add("active"); }
            iCircles.forEach((c, idx)=>{
                if (!c.el) return;
                const rectC = c.el.getBoundingClientRect();
                if(e.clientX >= rectC.left && e.clientX <= rectC.right && e.clientY >= rectC.top && e.clientY <= rectC.bottom){
                    c.el.classList.add("lit");
                    const icPercentX = ((rectC.left + rectC.width/2)-rect.left)/rect.width*100;
                    const icPercentY = ((rectC.top + rectC.height/2)-rect.top)/rect.height*100;
                    updateICircleGradient(idx+1, icPercentX, icPercentY);
                    if(c.timeout) clearTimeout(c.timeout);
                    c.timeout = setTimeout(()=>{ c.el.classList.remove("lit"); updateICircleGradient(idx+1, -2000, -2000); },5000);
                }
            });
        }
    });

    function handleInitialClick() {
        if (window.isReadyToStart && typeof window.sendFinalClick === 'function') {
            window.sendFinalClick();
            window.isReadyToStart = false; 
            return;
        }

        if(menu && menu.style.display !== "none"){
            if (window.isMultiplayer) { return; }
            
            menu.style.display = "none";
            if(flashlightCursor) flashlightCursor.style.display = "none";
            if(cursorLight) cursorLight.style.display = "none";
            if (gameCursor) gameCursor.style.display = 'block';
            
            resizeCanvas();
            initGameLogic();
            gameLoop();
        } 
    }
    document.addEventListener("click", handleInitialClick);
}

// Sistema de Hordas do Singleplayer
window.hordeTimeoutId = null;
const DURACAO_ORDA_EM_SEGUNDOS = 10;
function iniciarOrda(numeroOrda) {
    if (window.hordeTimeoutId) { clearTimeout(window.hordeTimeoutId); }
    console.log(`Iniciando orda ${numeroOrda}.`);
    window.ordaAtual = numeroOrda;
    if (typeof criarMonstros !== 'function') return;
    
    const listObj = window.getHordeConfig(numeroOrda);
    criarMonstros(listObj);
    
    window.hordeTimeoutId = setTimeout(() => {
        iniciarOrda(numeroOrda + 1);
    }, DURACAO_ORDA_EM_SEGUNDOS * 1000);
}
window.iniciarOrda = iniciarOrda;

function initGameLogic() {
    let gameWasLoaded = false;
    
    if (typeof window.resetPlayerStats === 'function') {
        window.resetPlayerStats();
    }

    if (typeof window.applyLoadedData === 'function') { gameWasLoaded = window.applyLoadedData(); }
    
    if (window.monstros) {
        window.monstros.length = 0;
    }
    
    if (!window.isMultiplayer) {
      if (gameWasLoaded) {
          iniciarOrda(window.ordaAtual);
      } else {
          iniciarOrda(1);
      }
    }
    window.showHealthBar = true;
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.setupSaveSystem === 'function') {
        window.setupSaveSystem();
    }
    setupMenuAndInput();
});