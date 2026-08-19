// =================================================================
// MONSTRO.JS (Atributos Base e Diretor de Hordas Unificado)
// =================================================================

const isBrowser = typeof window !== 'undefined';

// =================================================================
// [G] ============ CONFIGURAÇÕES DE REDE GLOBAIS ===================
// =================================================================
// Modifique aqui o limite de monstros permitidos ativos na tela.
// Afeta o Singleplayer e o Multiplayer simultaneamente!
// =================================================================
const MAX_ON_SCREEN_MONSTERS = 18; // Limite centralizado de monstros na tela
const MONSTER_FALL_MULTIPLIER = 3; // Altere este número para mudar a velocidade nos dois modos de uma só vez!

// =================================================================
// [1] =================== ATRIBUTOS BASE ===========================
// =================================================================
// Modifique aqui para alterar os status de FÁBRICA de cada monstro.
// Estes valores servem como ponto de partida (default).
// =================================================================

function configPadrao(tipo) {
  const config = {
    vida: 400,                   
    width: 100,
    height: 100,
    speed: 2.5,
    velY: 2,
    hitboxRadius: 35,
    hitboxOffsetX: 1,
    hitboxOffsetY: 1,
    spriteOffsetX: -20,
    spriteOffsetY: -10,
    minY: 0,
    maxY: (isBrowser ? window.cenarioOriginalHeight || 1057 : 1057) * 0.35,
    spriteNormal: '1a.png',
    spriteHit: '1b.png',
    damage: 1,
    projectileDamage: 15,
    projectileSpeed: 2,
    projectileCooldown: 4000,
    projectileSize: 10,
    projectileColor: 'rgba(160,0,255,1)',
    xpValue: 10,
  };

  if (tipo === 'Monstro2') {
    config.spriteNormal = '2a.png';
    config.spriteHit = '2b.png';
    config.projectileSize = 15;
    config.projectileColor = 'rgba(100, 255, 0, 1)';
    config.xpValue = 10;
    config.vida = 600;           
    config.damage = 1;
    config.projectileDamage = 25;
  }

  return config;
}


// =================================================================
// [2] ============= TABELA DE HORDAS E PROGRESSÃO =================
// =================================================================
// Altere aqui para definir quais monstros surgem, quantos surgem,
// e quais atributos (vida/ataque) serão modificados por rodada.
// Funciona tanto para o Singleplayer quanto para o Multiplayer!
// =================================================================

function getHordeConfig(numeroOrda) {
  if (numeroOrda === 1) {
    return [
      { 
        tipo: 'Monstro1', 
        quantidade: 20, 
        config: { 
          vida: 200,       
          attack: 20       
        } 
      },
      { 
        tipo: 'Monstro2', 
        quantidade: 20, 
        config: { 
          vida: 600, 
          attack: 20 
        } 
      }
    ];
  } 
  
  if (numeroOrda === 2) {
    return [
      { 
        tipo: 'Monstro1', 
        quantidade: 50, 
        config: { 
          vida: 450,       
          attack: 25 
        } 
      },
      { 
        tipo: 'Monstro2', 
        quantidade: 50, 
        config: { 
          vida: 600, 
          attack: 25 
        } 
      }
    ];
  }

  const quantidadeBase = 2 + (numeroOrda * 2);
  const ataqueEscalado = 20 + numeroOrda;
  const vidaEscalada = 200 + (numeroOrda * 10);

  return [
    { 
      tipo: 'Monstro1', 
      quantidade: quantidadeBase, 
      config: { 
        vida: vidaEscalada, 
        attack: ataqueEscalado 
      } 
    },
    { 
      tipo: 'Monstro2', 
      quantidade: quantidadeBase, 
      config: { 
        vida: 600, 
        attack: 20 
      } 
    }
  ];
}


// =================================================================
// [3] ================= CLASSE DO MONSTRO =========================
// =================================================================

class Monstro {
  constructor(imgSrc, config = {}) {
    if (isBrowser) {
        this.img = new Image();
        this.img.src = imgSrc || '1a.png';
    } else {
        this.img = null; 
    }
    
    this.maxVida = config.vida || 50;
    this.vida = this.maxVida;
    this.width = config.width || 100;
    this.height = config.height || 100;
    this.speed = config.speed || 1.5;
    this.velX = 0;
    this.velY = config.velY || 2;
    
    this.damage = config.damage || 1;
    this.projectileDamage = config.projectileDamage || 10;

    this.projectileSpeed = config.projectileSpeed || 2;
    this.projectileSize = config.projectileSize || 20;
    this.projectileCooldown = config.projectileCooldown || 5000;
    this.projectileColor = config.projectileColor || 'rgba(160,0,255,1)';
    this.xpValue = config.xpValue || 0;

    this.hitboxRadius = config.hitboxRadius || Math.min(this.width, this.height) / 2.5;
    this.hitboxOffsetX = config.hitboxOffsetX || this.width / 2;
    this.hitboxOffsetY = config.hitboxOffsetY || this.height / 2;
    
    this.spriteOffsetX = config.spriteOffsetX || 0;
    this.spriteOffsetY = config.spriteOffsetY || 0;
    this.x = config.x !== undefined ? config.x : 0;
    this.y = config.y !== undefined ? config.y : 0;
    this.minY = config.minY !== undefined ? config.minY : 0;
    this.maxY = config.maxY !== undefined ? config.maxY : (isBrowser ? window.cenarioOriginalHeight || 768 : 768) * 0.25 - this.height;
    this.hasLanded = config.hasLanded || false;
    this.targetY = config.targetY !== undefined ? config.targetY : this.y;
    this.spriteNormal = config.spriteNormal || imgSrc || '1a.png';
    this.spriteHit = config.spriteHit || '1b.png';
    this.currentSprite = config.currentSprite || this.spriteNormal;
    this.isHit = config.isHit || false;
    this.hitTimer = config.hitTimer || 250;
    this.lastHitTime = config.lastHitTime || null;
    this.opacity = config.opacity || 1;
    this.lastShotTime = 0;
    this.angle = config.angle || 0;
    this.resistance = config.resistance || 1;
    
    this.id = config.id || `m_${Date.now()}_${Math.random()}`;
  }
}

// Exportação Dupla (Navegador e Servidor Node.js)
if (isBrowser) {
    window.Monstro = Monstro;
    window.Monstro.configPadrao = configPadrao;
    window.getHordeConfig = getHordeConfig;
    window.MAX_ON_SCREEN_MONSTERS = MAX_ON_SCREEN_MONSTERS;
    window.MONSTER_FALL_MULTIPLIER = MONSTER_FALL_MULTIPLIER; // <--- ADICIONE ESTA LINHA
} else {
    module.exports = {
        Monstro,
        configPadrao,
        getHordeConfig,
        MAX_ON_SCREEN_MONSTERS,
        MONSTER_FALL_MULTIPLIER // <--- ADICIONE ESTA LINHA
    };
}