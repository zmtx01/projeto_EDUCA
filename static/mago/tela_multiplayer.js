// =================================================================
// TELA_MULTIPLAYER.JS (Gerenciamento, Conexão e Interpolação de Rede)
// =================================================================

window.otherPlayers = {};

// Listas de projéteis locais de monstros no modo multiplayer
const mpMonstroProjectiles = [];
const mpMonstroProjectilePool = [];

// EXPOSIÇÃO GLOBAL: Permite que a rotina de reset de tela limpe os projéteis no início da rodada
window.mpMonstroProjectiles = mpMonstroProjectiles;

if (typeof window.ataquesParaEnviar === 'undefined') {
    window.ataquesParaEnviar = [];
}

const p2Image = new Image();
p2Image.src = 'p2a.png';
const p2StaffImage = new Image();
p2StaffImage.src = 'cajado2.png';

const p2StaffScale = 0.06;
let p2StaffWidth = 0, p2StaffHeight = 0;
p2StaffImage.onload = () => {
  p2StaffWidth = p2StaffImage.width * p2StaffScale;
  p2StaffHeight = p2StaffImage.height * p2StaffScale;
};

const SERVER_URL = `ws://${window.location.hostname}:3000`;
window.socket = null;

window.multiplayer = {
    state: 'disconnected',
    playerNumber: null,
    p1Connected: false,
    p2Connected: false,
    errorMessage: '',
    p1TakeoverReady: false,
    p2TakeoverReady: false,
};

window.waitingForOtherPlayer = false;

// Controle de Jogo Ativo para gerenciar a exibição do botão Start
window.gameActive = false;

const mpUI = document.getElementById('multiplayer-ui');

function updateMultiplayerUI() {
    if (!mpUI) return;
    let content = '';
    const hasToken = !!localStorage.getItem('wizz_mp_token');

    switch(window.multiplayer.state) {
        case 'disconnected':
            if (window.multiplayer.errorMessage) {
                if (window.multiplayer.errorMessage === 'Servidor cheio.') {
                    content += `<span class="mp-status-text">Lobby Cheio | </span>`;
                    if (window.multiplayer.p1TakeoverReady) {
                        content += '<button id="mp-takeover-1" class="mp-btn">Assumir Mago 1</button>';
                    }
                    if (window.multiplayer.p2TakeoverReady) {
                        content += '<button id="mp-takeover-2" class="mp-btn">Assumir Mago 2</button>';
                    }
                    if (!window.multiplayer.p1TakeoverReady && !window.multiplayer.p2TakeoverReady) {
                        content += `<span class="mp-status-text">Partida em andamento. Aguarde...</span>`;
                    }
                } else {
                    content += `<span class="mp-status-text">Erro: ${window.multiplayer.errorMessage}</span>`;
                }
            } else if (hasToken) {
                content += '<button id="mp-connect-button" class="mp-btn">Reconectar</button>';
                content += '<button id="mp-new-game-button" class="mp-btn">Novo Jogo</button>';
            } else {
                content += '<button id="mp-connect-button" class="mp-btn">Conectar..</button>';
            }
            break;
            
        case 'connecting':
            content = '<span class="mp-btn connecting-state">Conectando...</span>';
            break;
            
        case 'online':
            // Se o jogo já estiver ativo, esconde o botão "Start"
            if (window.gameActive) {
                content = `<span class="mp-status-text">P1 Conectado | P2 Conectado</span>`;
            } else {
                if (window.multiplayer.p1Connected && window.multiplayer.p2Connected) {
                    content = `<button id="mp-start-button" class="mp-btn">Start</button><span class="mp-status-text">| P1 Conectado | P2 Conectado</span>`;
                } else {
                    let statusText = window.multiplayer.p1Connected ? 'P1 Conectado' : 'P2 Conectado';
                    content = `<span class="mp-status-text">${statusText} | Aguardando...</span>`;
                }
            }
            break;
    }
    mpUI.innerHTML = content;
}
window.updateMultiplayerUI = updateMultiplayerUI;

function sendMessage(type, payload = {}) {
    if (window.socket && window.socket.readyState === WebSocket.OPEN) {
        window.socket.send(JSON.stringify({ type, payload }));
    }
}
window.sendMessage = sendMessage;

function showMultiplayerLobbyScreen() {
    const menu = document.getElementById('menu');
    if (menu) menu.style.display = 'none';
    
    // CORREÇÃO: Garante que os quadrados de salvamento fiquem ocultos ao carregar a tela de Lobby
    const saveContainer = document.getElementById('save-slots-container');
    if (saveContainer) saveContainer.style.display = 'none';
    
    const flashlightCursor = document.querySelector('.flashlight-cursor');
    if (flashlightCursor) flashlightCursor.style.display = 'none';
    const cursorLight = document.querySelector('.cursor-light');
    if (cursorLight) cursorLight.style.display = 'none';
    
    const lobbyScreen = document.getElementById('multiplayer-lobby-screen');
    if (lobbyScreen) {
        lobbyScreen.style.display = 'block';
    }
    const gameCursor = document.getElementById('game-cursor');
    if (gameCursor) {
        gameCursor.style.display = 'block';
    }
    document.body.style.cursor = 'none';
}

window.onProjectileFired = (projData) => {
    if (!window.isMultiplayer) return;
    sendMessage('projectile-fired', projData);
};

window.onStaffLightningUsed = (raioData) => {
    if (!window.isMultiplayer) return;
    sendMessage('staff-lightning-used', raioData);
};

window.onRuneChosen = (runeData) => {
    if (!window.isMultiplayer) return;
    sendMessage('rune-chosen', runeData);
    window.waitingForOtherPlayer = true;
};

// Mapeamento numérico inverso dos sprites de monstros no cliente
function getSpriteFilename(code) {
    if (code === 1) return '1a.png';
    if (code === 2) return '1b.png';
    if (code === 3) return '2a.png';
    if (code === 4) return '2b.png';
    return '1a.png';
}

function connectToServer() {
    if (typeof window.resetRunas === 'function') {
        window.resetRunas();
    }

    if (window.socket && (window.socket.readyState === WebSocket.OPEN || window.socket.readyState === WebSocket.CONNECTING)) {
        return;
    }
    
    window.isMultiplayer = true;
    
    // CORREÇÃO CRUCIAL: Esconde em definitivo os quadrados de salvamento 
    // no exato microssegundo em que o clique de conexão de rede é iniciado
    const saveContainer = document.getElementById('save-slots-container');
    if (saveContainer) saveContainer.style.display = 'none';
    
    window.multiplayer.state = 'connecting';
    window.multiplayer.errorMessage = '';
    updateMultiplayerUI();

    window.socket = new WebSocket(SERVER_URL);

    window.socket.onopen = () => {
        console.log('Conexão WebSocket aberta. Enviando Handshake...');
        sendMessage('client-handshake', { token: localStorage.getItem('wizz_mp_token') });
    };

    window.socket.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            switch (message.type) {
                case 'player-assigned':
                    window.multiplayer.playerNumber = message.payload.playerNumber;
                    window.multiplayer.state = 'online';
                    
                    if (message.payload.token) {
                        localStorage.setItem('wizz_mp_token', message.payload.token);
                    }
                    
                    // CORREÇÃO: Limpa em definitivo todo o lixo e projéteis offline anteriores antes de desenhar a reconexão
                    if (typeof window.resetPlayerStats === 'function') {
                        window.resetPlayerStats();
                    }
                    
                    updateMultiplayerUI();
                    break;
                case 'update-player-status':
                    window.multiplayer.p1Connected = message.payload.p1Connected;
                    window.multiplayer.p2Connected = message.payload.p2Connected;
                    window.multiplayer.p1TakeoverReady = message.payload ? message.payload.p1TakeoverReady : false;
                    window.multiplayer.p2TakeoverReady = message.payload ? message.payload.p2TakeoverReady : false;
                    if (window.multiplayer.state === 'online') {
                        updateMultiplayerUI();
                    }
                    break;
                case 'game-full':
                    window.multiplayer.errorMessage = 'Servidor cheio.';
                    window.multiplayer.state = 'disconnected';
                    window.multiplayer.p1TakeoverReady = message.payload ? message.payload.p1TakeoverReady : false;
                    window.multiplayer.p2TakeoverReady = message.payload ? message.payload.p2TakeoverReady : false;
                    updateMultiplayerUI();
                    // CORREÇÃO: Não fecha mais o socket na máquina do visitante para permitir que ele assuma o mago por inatividade
                    break;
                case 'server-full':
                    window.multiplayer.errorMessage = 'Servidor cheio.';
                    window.multiplayer.state = 'disconnected';
                    window.multiplayer.p1TakeoverReady = message.payload.p1TakeoverReady;
                    window.multiplayer.p2TakeoverReady = message.payload.p2TakeoverReady;
                    updateMultiplayerUI();
                    // CORREÇÃO: Mantém o socket do visitante aberto para permitir cliques em "Assumir Mago"
                    break;
                case 'prepare-to-start':
                    window.isReadyToStart = true;
                    showMultiplayerLobbyScreen();
                    if (window.isPaused) {
                        togglePause(true);
                    }
                    break;
                case 'start-game':
                    console.log("Recebida ordem do servidor para iniciar o jogo.");
                    window.isReadyToStart = false; 
                    window.waitingForOtherPlayer = false;
                    
                    window.gameActive = true; 
                    
                    const grassSeed = message.payload.grassSeed;
                    if (typeof window.setGrassSeed === 'function') {
                        window.setGrassSeed(grassSeed);
                    }
                    const lobby = document.getElementById('multiplayer-lobby-screen');
                    if (lobby) lobby.style.display = 'none';
                    
                    if (window.hordeTimeoutId) {
                        clearTimeout(window.hordeTimeoutId);
                        window.hordeTimeoutId = null;
                    }

                    if (typeof window.resetPlayerStats === 'function') {
                        window.resetPlayerStats();
                    }

                    window.monstros = [];
                    mpMonstroProjectiles.length = 0;
                    window.gameLoop();
                    break;
                
                case 'player-update':
                    const data = message.payload;
                    if (data.playerNumber !== window.multiplayer.playerNumber) {
                        const now = Date.now();
                        if (!window.otherPlayers[data.playerNumber]) {
                            window.otherPlayers[data.playerNumber] = {
                                x: data.x, y: data.y, angle: data.angle,
                                fromX: data.x, fromY: data.y, fromAngle: data.angle,
                                toX: data.x, toY: data.y, toAngle: data.angle,
                                lastUpdateTime: now, lerpStartTime: now,
                                step: 0, lastX: data.x, lastY: data.y,
                                velocityX: 0, wasJumping: false, jumping: false,
                                isMoving: data.isMoving
                            };
                        } else {
                            const p = window.otherPlayers[data.playerNumber];
                            p.fromX = p.x; p.fromY = p.y; p.fromAngle = p.angle;
                            p.toX = data.x; p.toY = data.y; p.toAngle = data.angle;
                            p.lastUpdateTime = now; p.lerpStartTime = now;
                            p.isMoving = data.isMoving;
                        }
                    }
                    break;

                case 'monster-spawned':
                    const newMonsterData = message.payload;
                    const monsterConfig = newMonsterData.config;
                    const newMonster = new window.Monstro(monsterConfig.spriteNormal, {
                        ...monsterConfig,
                        id: newMonsterData.id,
                        x: newMonsterData.x,
                        y: newMonsterData.y
                    });
                    newMonster.fromX = newMonster.x; newMonster.fromY = newMonster.y; newMonster.fromAngle = newMonster.angle;
                    newMonster.toX = newMonster.x; newMonster.toY = newMonster.y; newMonster.toAngle = newMonster.angle;
                    newMonster.lerpStartTime = Date.now();
                    window.monstros.push(newMonster);
                    break;

                case 'monsters-update':
                    const monstersData = message.payload;
                    const serverIds = new Set(monstersData.map(d => d[0]));
                    
                    for (let i = window.monstros.length - 1; i >= 0; i--) {
                        if (!serverIds.has(window.monstros[i].id)) {
                            window.monstros.splice(i, 1);
                        }
                    }

                    monstersData.forEach(data => {
                        const [id, x, y, angle, vida, spriteCode] = data;
                        let monster = window.monstros.find(m => m.id === id);
                        const spriteName = getSpriteFilename(spriteCode);
                        
                        if (!monster) {
                            const tipo = spriteName.includes('2') ? 'Monstro2' : 'Monstro1';
                            const config = window.Monstro ? window.Monstro.configPadrao(tipo) : { width: 100, height: 100, speed: 2.5, velY: 2 };
                            
                            monster = new window.Monstro(spriteName, {
                                ...config,
                                id: id,
                                x: x,
                                y: y
                            });
                            monster.fromX = x; monster.fromY = y; monster.fromAngle = angle;
                            monster.toX = x; monster.toY = y; monster.toAngle = angle;
                            monster.lerpStartTime = Date.now();
                            window.monstros.push(monster);
                        } else {
                            monster.fromX = monster.x;
                            monster.fromY = monster.y;
                            monster.fromAngle = monster.angle;
                            monster.toX = x;
                            monster.toY = y;
                            monster.toAngle = angle;
                            monster.vida = vida;
                            monster.currentSprite = spriteName;
                            monster.lerpStartTime = Date.now();
                        }
                    });
                    break;

                case 'player-disconnected':
                    delete window.otherPlayers[message.payload.playerNumber];
                    break;
                case 'pause-state-change':
                    window.isPaused = message.payload.isPaused;
                    if (!window.isPaused) {
                        window.waitingForOtherPlayer = false;
                    }
                    if (typeof window.updatePauseUI === 'function') {
                        window.updatePauseUI(window.isPaused);
                    }
                    break;
                case 'level-up':
                    if (typeof abrirEscolhaDeRuna === 'function') {
                        abrirEscolhaDeRuna(message.payload.levelsGained);
                    }
                    break;
                case 'game-state-sync':
                    // CORREÇÃO CRUCIAL: Se recebemos a sincronia de estado periódica, o jogo está ativo e rodando!
                    const wasActive = window.gameActive;
                    window.gameActive = true;

                    if (window.player) {
                        window.player.level = message.payload.level; window.player.xp = message.payload.xp;
                        window.player.xpMax = message.payload.xpMax; window.player.vida = message.payload.sharedLife;
                        window.player.vidaMax = message.payload.sharedLifeMax;
                        
                        window.ordaAtual = message.payload.currentHorde;
                        window.mpMonsterStockLength = message.payload.monsterStockLength;

                        // Sincroniza a pausa universal vinda do servidor na sua aba que acabou de voltar
                        window.isPaused = message.payload.isPaused;
                        if (typeof window.updatePauseUI === 'function') {
                            window.updatePauseUI(window.isPaused);
                        }
                    }

                    // CORREÇÃO VISUAL: Sincroniza o painel de lobby de rede dinamicamente
                    updateMultiplayerUI();

                    // CORREÇÃO VISUAL DE RECONEXÃO: Se a página foi atualizada, esconde os menus antigos de lobby de forma imediata e inicia a renderização ativa!
                    if (!wasActive) {
                        const menu = document.getElementById('menu');
                        if (menu) menu.style.display = 'none';
                        const lobby = document.getElementById('multiplayer-lobby-screen');
                        if (lobby) lobby.style.display = 'none';
                        const gameCursor = document.getElementById('game-cursor');
                        if (gameCursor) gameCursor.style.display = 'block';
                        document.body.style.cursor = 'none';

                        window.gameLoop();
                    }
                    break;
                case 'other-player-fired':
                    const projData = message.payload;
                    if (typeof getProjectile === 'function') {
                        const p = getProjectile();
                        Object.assign(p, projData, {
                            prevX: projData.x, prevY: projData.y, color: window.projetilCor || 'cyan',
                            damage: 0, penetration: 1000, isGhost: true
                        });
                        window.projectiles.push(p);
                    }
                    break;
                case 'other-player-staff-lightning':
                    window.raiosDoMago.push(message.payload);
                    break;
                case 'other-player-scenario-lightning':
                     window.raiosDoMago.push(message.payload);
                    break;
                case 'apply-rune-effect':
                    const otherPlayerNum = message.payload.playerNumber;
                    if (window.otherPlayers[otherPlayerNum]) {
                        const otherPlayerObj = window.otherPlayers[otherPlayerNum];
                        for (let key in message.payload.efeito) {
                            if (otherPlayerObj[key] !== undefined) {
                                otherPlayerObj[key] += message.payload.efeito[key];
                            } else {
                                otherPlayerObj[key] = message.payload.efeito[key];
                            }
                        }
                        if (message.payload.efeito.vida) {
                            otherPlayerObj.vidaMax = (otherPlayerObj.vidaMax || 0) + message.payload.efeito.vida;
                        }
                    }
                    break;

                // ESCUTADORES DA FRENTE 2 (Upgrades Especiais):

                // Sangramento (Gera as partículas de sangue escorrendo no cliente)
                case 'spawn-blood-particles':
                    if (window.particles) {
                        const px = message.payload.x;
                        const py = message.payload.y;
                        for (let i = 0; i < 4; i++) {
                            window.particles.push({
                                x: px + (Math.random() - 0.4) * 10,
                                y: py,
                                velX: (Math.random() - 0.4) * 2,
                                velY: Math.random() * 0.4 + 1,
                                radius: Math.random() * 6 + 1,
                                color: 'rgba(255, 0, 0, 1)',
                                life: Math.random() * 20 + 20,
                            });
                        }
                    }
                    break;

                // Reflexão (Gera o efeito de fagulhas vermelhas ao colidir por toque)
                case 'spawn-impact':
                    if (typeof window.criarImpacto === 'function') {
                        window.criarImpacto(message.payload.x, message.payload.y, message.payload.color || 'red', 1.2);
                    }
                    break;

                // Fragmentação (Explode em pequenos espinhos roxos ao morrer no servidor)
                case 'spawn-fragment-projectiles':
                    const payload = message.payload;
                    if (window.hibridProjectiles) {
                        for (let f = 0; f < payload.count; f++) {
                            const angle = Math.random() * Math.PI * 2;
                            const speed = 8;
                            const fragProj = {
                                x: payload.x,
                                y: payload.y,
                                prevX: payload.x,
                                prevY: payload.y,
                                velX: Math.cos(angle) * speed,
                                velY: Math.sin(angle) * speed,
                                radius: 5,
                                color: 'rgba(160, 0, 255, 1)',
                                damage: payload.damage,
                                penetration: 1,
                                isCritico: false,
                                invincibilityTimer: 400
                            };
                            window.hibridProjectiles.push(fragProj);
                        }
                    }
                    break;

                // CORREÇÃO: Resgate de Atributos do mago reconectado vindos diretamente do banco de dados do servidor
                case 'player-stats-sync':
                    if (window.player && message.payload) {
                        Object.assign(window.player, message.payload);
                    }
                    break;
            }
        } catch (error) { console.error("Erro ao processar mensagem do servidor:", error); }
    };

    window.socket.onerror = (error) => {
        window.isMultiplayer = false; console.error('Erro de WebSocket:', error);
        window.multiplayer.errorMessage = 'Não foi possível conectar.';
        window.multiplayer.state = 'disconnected'; updateMultiplayerUI();
        window.socket = null;
    };

    window.socket.onclose = () => {
        window.isMultiplayer = false; console.log('Desconectado do servidor.');
        window.gameActive = false;
        if (window.multiplayer.state !== 'disconnected') {
            window.multiplayer.state = 'disconnected';
            window.multiplayer.errorMessage = 'Conexão perdida.';
            updateMultiplayerUI();
        }
        window.socket = null; window.otherPlayers = {};
    };
}

if (mpUI) { 
    mpUI.addEventListener('click', (event) => { 
        const target = event.target; 
        if (target.id === 'mp-connect-button') connectToServer(); 
        
        if (target.id === 'mp-new-game-button') {
            localStorage.removeItem('wizz_mp_token');
            connectToServer();
        }

        if (target.id === 'mp-start-button') {
            sendMessage('request-start-game');
        }

        if (target.id === 'mp-takeover-1') {
            sendMessage('request-takeover', { slot: 1 });
        }
        if (target.id === 'mp-takeover-2') {
            sendMessage('request-takeover', { slot: 2 });
        }
    }); 
}

function lerpAngle(a, b, t) {
    let diff = b - a;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    return a + diff * t;
}

function updateOtherPlayers(deltaTime) {
    const now = Date.now();
    const interpolationPeriod = (1000 / 30) * 1.5;

    for (const id in window.otherPlayers) {
        const p = window.otherPlayers[id];
        const timeSinceUpdate = now - p.lerpStartTime;
        let t = Math.min(1, timeSinceUpdate / interpolationPeriod);
        p.x = p.fromX + (p.toX - p.fromX) * t;
        p.y = p.fromY + (p.toY - p.fromY) * t;
        p.angle = lerpAngle(p.fromAngle, p.toAngle, t);
        p.velocityX = p.x - p.lastX;
        p.jumping = p.y < p.lastY;
        p.lastX = p.x;
        p.lastY = p.y;
    }
}
window.updateOtherPlayers = updateOtherPlayers;

function updateClientMonsters(deltaTime) {
    const now = Date.now();
    const interpolationPeriod = (1000 / 30) * 1.5;

    for(let i = window.monstros.length - 1; i >= 0; i--) {
        const m = window.monstros[i];
        
        if (m.vida <= 0) {
            window.monstros.splice(i, 1);
            continue;
        }

        const timeSinceUpdate = now - m.lerpStartTime;
        let t = Math.min(1, timeSinceUpdate / interpolationPeriod);

        m.x = m.fromX + (m.toX - m.fromX) * t;
        m.y = m.fromY + (m.toY - m.fromY) * t;
        m.angle = lerpAngle(m.fromAngle, m.toAngle, t);
        
        if (m.isHit && now - m.lastHitTime > 250) {
            m.isHit = false;
            m.currentSprite = m.spriteNormal;
        }

        if (m.y > 100) {
            m.hasLanded = true;
        }

        if (m.hasLanded && now - (m.lastShotTime || 0) > (m.projectileCooldown || 5000)) {
            m.lastShotTime = now;
            
            let targetPlayer = window.player;
            let closestDist = Math.hypot(m.x - window.player.x, m.y - window.player.y);

            for (const id in window.otherPlayers) {
                const other = window.otherPlayers[id];
                const otherDist = Math.hypot(m.x - other.x, m.y - other.y);
                if (otherDist < closestDist) {
                    closestDist = otherDist;
                    targetPlayer = other;
                }
            }

            shootMonstroLocal(m, targetPlayer);
        }
    }

    updateMonstroProjectilesLocal(deltaTime);
    checkColisoesProjeteisMagoVsMonstroProjeteis();
}
window.updateClientMonsters = updateClientMonsters;

function shootMonstroLocal(m, targetPlayer) {
    const p = mpMonstroProjectilePool.length > 0 ? mpMonstroProjectilePool.pop() : {};
    p.x = m.x + m.hitboxOffsetX;
    p.y = m.y + m.hitboxOffsetY;

    const targetCX = targetPlayer.x + (targetPlayer.width || 48) / 2;
    const targetCY = targetPlayer.y + (targetPlayer.height || 60) / 2;

    const angle = Math.atan2(targetCY - p.y, targetCX - p.x);
    p.velX = Math.cos(angle) * m.projectileSpeed;
    p.velY = Math.sin(angle) * m.projectileSpeed;
    p.radius = m.projectileSize;
    p.color = m.projectileColor || 'rgba(160,0,255,1)';
    p.hitsToDestroy = m.projectileHits || 3;
    p.damage = m.projectileDamage || 10;
    p.penetration = m.projectilePenetration || 1;
    
    mpMonstroProjectiles.push(p);
}

function updateMonstroProjectilesLocal(deltaTime) {
    for (let i = mpMonstroProjectiles.length - 1; i >= 0; i--) {
        const p = mpMonstroProjectiles[i];
        p.x += p.velX;
        p.y += p.velY;

        if (window.player && circleRectCollision(p.x, p.y, p.radius, window.player.x + window.player.hitboxOffsetX, window.player.y + window.player.hitboxOffsetY, window.player.hitboxWidth, window.player.hitboxHeight)) {
            
            sendMessage('event-take-damage', { amount: p.damage || 10 });
            
            const reflectProjMult = window.player.reflectProjectileDamageMultiplier || 0;
            if (reflectProjMult > 0 && window.monstros.length > 0) {
                const targetMonster = window.monstros[Math.floor(Math.random() * window.monstros.length)];
                if (targetMonster) {
                    const reflectDamage = (window.player.attack || 20) * reflectProjMult;
                    sendMessage('monster-damaged', { id: targetMonster.id, damage: reflectDamage });
                    
                    if (typeof window.criarImpacto === 'function') {
                        window.criarImpacto(targetMonster.x + targetMonster.hitboxOffsetX, targetMonster.y + targetMonster.hitboxOffsetY, 'red', 1.2);
                    }
                }
            }
            
            mpMonstroProjectiles.splice(i, 1);
            if (typeof window.criarImpacto === 'function') window.criarImpacto(p.x, p.y, p.color);
            if (typeof window.triggerDamageFlash === 'function') window.triggerDamageFlash();
            continue;
        }

        let hitBlock = false;
        for (const bloco of (window.blocos || [])) {
            if (circleRectCollision(p.x, p.y, p.radius, bloco.x, bloco.y, bloco.width, bloco.height)) {
                if (typeof window.criarImpacto === 'function') window.criarImpacto(p.x, p.y, p.color);
                hitBlock = true;
                break;
            }
        }

        if (hitBlock) {
            mpMonstroProjectiles.splice(i, 1);
            continue;
        }

        if (p.y > (window.cenarioOriginalHeight || 1057) || p.x < 0 || p.x > (window.cenarioOriginalWidth || 2176)) {
            mpMonstroProjectiles.splice(i, 1);
        }
    }
}

function circleRectCollision(cx, cy, r, rx, ry, rw, rh) {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) < (r * r);
}

function drawOtherPlayers() {
    if (!window.otherPlayers || !window.player) return;
    const ctx = window.ctx;
    for (const id in window.otherPlayers) {
        const other = window.otherPlayers[id];
        const screenPos = cenarioParaTela(other.x, other.y);
        
        let inclination = 0;
        let playerAnimationOffsetY = 0;
        
        const moving = other.isMoving; 

        if (moving) {
            other.step = (other.step || 0) + 0.2;
            inclination = Math.sin(other.step) * 0.05 + (Math.random() - 0.5) * 0.02;
            playerAnimationOffsetY = Math.sin(other.step * 2) * 3 + (Math.random() - 0.5) * 2;
        } else {
            other.step = 0;
        }

        ctx.save();
        ctx.translate(
            screenPos.x + (window.player.width * window.scale / 2),
            screenPos.y + (window.player.height * window.scale / 2) + (playerAnimationOffsetY * window.scale)
        );
        ctx.rotate(inclination);

        if (p2Image.complete) {
            ctx.drawImage(p2Image, 
                -(window.player.width * window.scale / 2), 
                -(window.player.height * window.scale / 2), 
                window.player.width * window.scale, 
                window.player.height * window.scale
            );
        }
        ctx.restore();

        if (p2StaffImage.complete && p2StaffWidth > 0) {
            const centerX = other.x + window.player.width / 2 + 20;
            const centerY = other.y + window.player.height / 2;
            const centerTela = cenarioParaTela(centerX, centerY);
            
            ctx.save();
            ctx.translate(centerTela.x, centerTela.y);
            ctx.rotate(other.angle);
            ctx.drawImage(p2StaffImage, -p2StaffWidth * window.scale / 2, -p2StaffHeight * window.scale / 2, p2StaffWidth * window.scale, p2StaffHeight * window.scale);
            ctx.restore();
        }
    }

    // O BLOCO VISUAL DE ESPERA 'Waiting for other player...' FOI REMOVIDO COMPLETAMENTE A PEDIDO DO USUÁRIO
    // Nenhuma mensagem ou overlay escuro de espera será renderizado no meio da tela a partir de agora

    for (const p of mpMonstroProjectiles) {
        const screenX = (p.x - window.offsetX) * window.scale;
        const screenY = (p.y - window.offsetY) * window.scale;
        window.ctx.beginPath();
        window.ctx.arc(screenX, screenY, p.radius * window.scale, 0, Math.PI * 2);
        window.ctx.fillStyle = p.color;
        window.ctx.fill();
    }
}
window.drawOtherPlayers = drawOtherPlayers;

let networkUpdateTimer = 0;
const NETWORK_UPDATE_INTERVAL = 15;
let wasMoving = false;

function updateMultiplayerNetwork(deltaTime) {
    networkUpdateTimer += deltaTime;

    const isMoving = window.player && (window.player.velocityX !== 0 || window.player.velocityY !== 0);
    const justStopped = wasMoving && !isMoving;
    const justStartedMoving = !wasMoving && isMoving;

    if (networkUpdateTimer >= NETWORK_UPDATE_INTERVAL || justStopped || justStartedMoving || (window.ataquesParaEnviar && window.ataquesParaEnviar.length > 0) ) {
        networkUpdateTimer = 0;
        
        if (window.player) {
            sendMessage('player-move', {
                x: window.player.x,
                y: window.player.y,
                angle: window.player.staffAngle || 0,
                isMoving: isMoving
            });
        }

        if (window.ataquesParaEnviar && window.ataquesParaEnviar.length > 0) {
            window.ataquesParaEnviar.forEach(ataque => sendMessage(ataque.type, ataque.payload));
            window.ataquesParaEnviar = [];
        }
    }
    
    wasMoving = isMoving;
}
window.updateMultiplayerNetwork = updateMultiplayerNetwork;

window.sendFinalClick = function() {
    sendMessage('final-click');
};

window.requestMultiplayerPause = function() {
    sendMessage('request-toggle-pause');
};

window.broadcastScenarioLightning = function(novoRaio) {
    sendMessage('scenario-lightning-spawned', novoRaio);
};

// CORREÇÃO DE SEGURANÇA: Salva e preserva a função de contador offline original para usá-la quando não estiver no modo multiplayer
const originalDrawMonstroCounter = window.drawMonstroCounter;
window.drawMonstroCounter = function() {
    if (window.isMultiplayer) {
        const ctx = window.ctx;
        ctx.save();
        ctx.font = "18px Arial";
        ctx.fillStyle = "white";
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        const padding = 20;
        const x = (window.canvas?.width || 1024) - padding;
        const y = padding;
        
        const telaAtivos = window.monstros.length;
        const totalRestante = window.mpMonsterStockLength || 0;
        const ordaAtual = window.ordaAtual || 1;
        
        ctx.fillText(`Orda (NET): ${ordaAtual}`, x, y);
        ctx.fillText(`Tela (NET): ${telaAtivos}`, x, y + 22);
        ctx.fillText(`Restante: ${totalRestante}`, x, y + 44);
        ctx.restore();
    } else if (typeof originalDrawMonstroCounter === 'function') {
        originalDrawMonstroCounter();
    }
};

// Função matemática auxiliar de intersecção de trajeto para detectar projéteis destruídos
function lineCircleIntersectionLocal(x1, y1, x2, y2, cx, cy, cr) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const a = dx * dx + dy * dy;
    const b = 2 * (dx * (x1 - cx) + dy * (y1 - cy));
    const c = (x1 - cx) * (x1 - cx) + (y1 - cy) * (y1 - cy) - cr * cr;
    if (a === 0) return false;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return false;
    const t1 = (-b + Math.sqrt(discriminant)) / (2 * a);
    const t2 = (-b - Math.sqrt(discriminant)) / (2 * a);
    if ((t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1)) return true;
    if ((t1 < 0 && t2 > 1) || (t2 < 0 && t1 > 1)) return true;
    return false;
}

// Nova colisão de projéteis de mago versus projéteis locais de monstros ativos no multiplayer
function checkColisoesProjeteisMagoVsMonstroProjeteis() {
    const projMagos = window.projectiles || [];
    if (!projMagos.length || !mpMonstroProjectiles.length) return;

    for (let i = projMagos.length - 1; i >= 0; i--) {
        const p = projMagos[i];
        let removeProj = false;

        for (let k = mpMonstroProjectiles.length - 1; k >= 0; k--) {
            const pm = mpMonstroProjectiles[k];
            
            // Compara trajetória do tiro do mago com a esfera da bolinha do monstro
            if (lineCircleIntersectionLocal(p.prevX, p.prevY, p.x, p.y, pm.x, pm.y, pm.radius + p.radius)) {
                
                // Gera a fagulha visual local de colisão
                if (typeof window.criarImpacto === 'function') {
                    window.criarImpacto((p.x + pm.x) / 2, (p.y + pm.y) / 2, p.color || 'cyan', 1.0);
                }

                // Remove o tiro do monstro
                mpMonstroProjectiles.splice(k, 1);
                
                // Desconta poder de perfuração do projétil do mago
                const resistencia = pm.hitsToDestroy || 3;
                p.penetration = (p.penetration || 1) - resistencia;
                if (p.penetration <= 0) {
                    removeProj = true;
                    break;
                }
            }
        }

        if (removeProj) {
            projMagos.splice(i, 1);
        }
    }
}

const originalCheckProjectileVsTarget = window.HitSystem.checkProjectileVsTarget;
window.HitSystem.checkProjectileVsTarget = function(proj, target) {
    if (window.isMultiplayer && target && target.id && target.id.startsWith('m')) {
        const baseDamage = proj.damage || 10;
        
        const isCrit = proj.isCritico || false;
        const Math_critMult = window.player?.critMultiplier || 1.5;
        const calculatedDamage = isCrit ? baseDamage * Math_critMult : baseDamage;

        sendMessage('monster-damaged', { id: target.id, damage: calculatedDamage });
    }
    return originalCheckProjectileVsTarget(proj, target);
};