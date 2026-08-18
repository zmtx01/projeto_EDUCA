// =======================
// GRAMA.JS
// =======================

window.areaGramaRoxa = { xInicial: 0, largura: 0, yInicial: 0, alturaY: 0 };
window.areaGramaAmarela = { xInicial: 0, largura: 0, yInicial: 0, alturaY: 0 };
window.totalGrama = 80;
window.gramaRoxa = [];
window.gramaAmarela = [];

// --- NOVO: GERADOR DE NÚMEROS PSEUDOALEATÓRIOS (PRNG) ---
let seed = 0;
function seededRandom() {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}
window.setGrassSeed = function(newSeed) {
    seed = newSeed;
    console.log(`Semente da grama definida como: ${seed}`);
}
// -----------------------------------------------------------

function obterCorFio(corBase) {
    if (corBase === 'yellow') return 'rgba(255, 255, 0, 1)';
    if (corBase === 'purple') return 'rgba(128, 0, 128, 1)';
    return corBase;
}

function criarTufos(corBase, xInicial, largura, yInicial, alturaY) {
    const tufos = [];
    const total = window.totalGrama || 100;

    for (let i = 0; i < total; i++) {
        // >>> MUDANÇA: Usando seededRandom() em vez de Math.random() <<<
        const x = xInicial + seededRandom() * largura;
        const y = yInicial + seededRandom() * alturaY;
        const alturaBase = 25 + seededRandom() * 20;
        const numFios = Math.floor(seededRandom() * 3) + 1;
        const fios = [];

        for (let j = 0; j < numFios; j++) {
            const offset = (seededRandom() - 0.5) * 8;
            const alturaFio = alturaBase + seededRandom() * 15;
            const angulo = (seededRandom() - 0.5) * (Math.PI / 6);
            fios.push({ offset, altura: alturaFio, angulo, cor: obterCorFio(corBase) });
        }

        tufos.push({
            x, y, fios, corBase,
            balanceOffset: 1,
            targetBalance: 1,
            ventoPhase: seededRandom() * 1000
        });
    }
    return tufos;
}

function recriarGrama() {
    if (!window.canvas) return;

    // Agora a grama pode ser recriada, limpando a anterior
    window.gramaRoxa = [];
    window.gramaAmarela = [];

    const margemInferior = 72;
    const cenarioOriginalWidth = 2176;
    const cenarioOriginalHeight = 1057;
    const centroX = cenarioOriginalWidth / 2;
    const deslocamentoDireita = 250;
    const larguraComum = (cenarioOriginalWidth * 0.4) - 120;
    const xInicialComum = (centroX - larguraComum / 2) + deslocamentoDireita;
    const yInicialRoxa = cenarioOriginalHeight - 5 - margemInferior;
    const alturaYRoxa = 5;
    const yInicialAmarela = cenarioOriginalHeight - 5 - margemInferior;
    const alturaYAmarela = 5;
    window.areaGramaRoxa = { xInicial: xInicialComum, largura: larguraComum, yInicial: yInicialRoxa, alturaY: alturaYRoxa };
    window.areaGramaAmarela = { xInicial: xInicialComum, largura: larguraComum, yInicial: yInicialAmarela, alturaY: alturaYAmarela };
    window.gramaRoxa = criarTufos('purple', xInicialComum, larguraComum, yInicialRoxa, alturaYRoxa);
    window.gramaAmarela = criarTufos('yellow', xInicialComum, larguraComum, yInicialAmarela, alturaYAmarela);
}

function updateGramaBalance(tufos, deltaTime) {
    const players = [window.player];
    if (window.otherPlayers) {
        Object.values(window.otherPlayers).forEach(p => players.push(p));
    }

    for (const t of tufos) {
        t.targetBalance = 0;
    }

    for (const player of players) {
        if (!player) continue;
        
        // Para a lógica de aterrissagem, continuamos a usar a detecção de 'jumping'
        if (typeof player.wasJumping === "undefined") player.wasJumping = player.jumping;
        if (!player.jumping && player.wasJumping) {
            for (const t of tufos) {
                const distanciaX = Math.abs(player.x + (player.width / 2 || 0) - t.x);
                const alcance = 50;
                if (distanciaX < alcance) {
                    t.balanceOffset += 15 * (1 - distanciaX / alcance);
                }
            }
        }
        
        // ++ A CORREÇÃO PRINCIPAL ESTÁ AQUI ++
        // Verificamos o estado de movimento real, em vez de adivinhar pela velocidade.
        const isActuallyMoving = player === window.player ? player.velocityX !== 0 : player.isMoving;

        // A grama só se move se o jogador estiver realmente se movendo
        if (isActuallyMoving) {
            for (const t of tufos) {
                const distanciaX = Math.abs(player.x + (player.width / 2 || 0) - t.x);
                const alcance = 30;
                if (distanciaX < alcance && !player.jumping) {
                    // Usamos a 'velocityX' calculada pela interpolação apenas para saber a direção
                    const direcao = player.velocityX !== 0 ? -Math.sign(player.velocityX) : 0;
                    t.targetBalance += direcao * (5 + Math.random() * 3);
                }
            }
        }

        player.wasJumping = player.jumping;
    }

    for (const t of tufos) {
        let diff = t.targetBalance - t.balanceOffset;
        t.balanceOffset += diff * 0.15;
        const ventoOscilacao = Math.sin(Date.now() * 0.002 + t.ventoPhase) * 2;

        if (t.targetBalance === 0) {
            t.balanceOffset += (ventoOscilacao - t.balanceOffset) * 0.05;
        } else {
            t.balanceOffset += ventoOscilacao * 0.2;
        }
    }
}

function drawGrama(tufos) {
    if (!window.ctx || typeof window.scale !== 'number' || typeof window.offsetX !== 'number' || typeof window.offsetY !== 'number') return;
    const ctx = window.ctx;
    for (const g of tufos) {
        for (const fio of g.fios) {
            ctx.beginPath();
            const xStart = (g.x + fio.offset + g.balanceOffset - window.offsetX) * window.scale;
            const yStart = (g.y - window.offsetY) * window.scale;
            ctx.shadowColor = 'rgba(0,0,0,0.3)';
            ctx.shadowBlur = 2;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            const xEnd = xStart + Math.sin(fio.angulo) * fio.altura * window.scale;
            const yEnd = yStart - Math.cos(fio.angulo) * fio.altura * window.scale;
            ctx.moveTo(xStart, yStart);
            ctx.lineTo(xEnd, yEnd);
            ctx.strokeStyle = fio.cor;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.shadowColor = 'transparent';
        }
    }
}

window.criarTufos = criarTufos;
window.recriarGrama = recriarGrama;
window.updateGramaBalance = updateGramaBalance;
window.drawGrama = drawGrama;