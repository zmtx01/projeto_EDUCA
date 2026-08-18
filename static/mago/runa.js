// ==========================================================
// RUNA.JS (Lista de Runas e Seletor de Upgrades Blindado)
// ==========================================================

// === Lista de Runas (com valores base) ===
const RUNAS = [ 
  { symbol: "ᛃᛊ", nome: "Ataque", efeito: { attack: 10 } }, 
  { symbol: "ᚨᛏ", nome: "Velocidade de Ataque", efeito: { atkSpeed: 0.10 } }, 
  { symbol: "ᛏ", nome: "Velocidade de Projétil", efeito: { projSpeed: 0.15 } }, 
  { symbol: "ᛇ", nome: "Chance de Crítico", efeito: { critChance: 0.05 } }, 
  { symbol: "ᛜ", nome: "Dano Crítico", efeito: { critMultiplier: 0.25 } }, 
  { symbol: "ᚹᛒ", nome: "Perfuração", efeito: { projectilePenetration: 1 } }, 
  { symbol: "ᛞ", nome: "Vida Máxima", efeito: { vida: 20 } }, 
  { symbol: "ᛋ", nome: "Raio Cenário", efeito: { raioCenarioIntervalReduction: 0.10 } }, 
  { symbol: "ᛊᚢ", nome: "Projétil Extra", efeito: { projectileCount: 1 } }, 
  { symbol: "ᚱ", nome: "Recarga do Raio", efeito: { raioCooldownReduction: 0.10 } }, 
  { symbol: "ᚸ", nome: "Coleta de XP", efeito: { xpGainMultiplier: 0.15 } }, 
  { symbol: "ᛚ", nome: "Sorte", efeito: { luck: 0.10 } }, 
  { symbol: "៟", nome: "Regeneração de Vida", efeito: { hpRegen: 1 } }, 
  { symbol: "ᛉ", nome: "Fragmentação", efeito: { fragmentationProjectiles: 1 } }, 
  { symbol: "ᚲ", nome: "Sangramento", efeito: { bleedDamage: 5 } }, 
  { 
    symbol: "ᚦ", 
    nome: "Refletir", 
    efeito: { 
      reflectProjectileDamageMultiplier: 0.10, 
      reflectTouchDamageMultiplier: 0.50 
    } 
  },
];

const RARIDADES = [ 
  { nome: "comum", cor: "cyan", chance: 70, glow: "0 0 10px cyan, 0 0 20px cyan, 0 0 40px cyan", multiplicador: 1.0 }, 
  { nome: "rara", cor: "purple", chance: 25, glow: "0 0 10px purple, 0 0 20px purple, 0 0 40px magenta", multiplicador: 2.0 }, 
  { nome: "lendaria", cor: "gold", chance: 5, glow: "0 0 15px gold, 0 0 30px orange, 0 0 60px yellow", multiplicador: 3.0 } 
];

let niveisPendentes = 0; 
let escolhendoRuna = false; 
window.isLevelUpPause = false; 

function sortearRaridade() { 
  const luck = window.player?.luck || 0; 
  let chancesAjustadas = JSON.parse(JSON.stringify(RARIDADES)); 
  const chanceTransferida = (luck / 0.10) * 5; 
  if (chanceTransferida > 0 && chancesAjustadas[0].chance > chanceTransferida) { 
    chancesAjustadas[0].chance -= chanceTransferida; 
    chancesAjustadas[1].chance += chanceTransferida * 0.8; 
    chancesAjustadas[2].chance += chanceTransferida * 0.2; 
  }
  const rand = Math.random() * 100; 
  let soma = 0; 
  for (let r of chancesAjustadas) { 
    soma += r.chance; 
    if (rand <= soma) { 
      return RARIDADES.find(original => original.nome === r.nome); 
    }
  }
  return RARIDADES[0]; 
}

function sortearRuna() { 
  let runaBase = RUNAS[Math.floor(Math.random() * RUNAS.length)]; 
  const raridade = sortearRaridade(); 
  let efeitoFinal = JSON.parse(JSON.stringify(runaBase.efeito)); 
  let nomeFinal = runaBase.nome; 
  let valorExibido = ""; 

  for (let key in efeitoFinal) { 
    const valorBase = efeitoFinal[key]; 
    let valorFinal = valorBase; 

    const fixedAttributes = ['projectilePenetration', 'projectileCount', 'fragmentationProjectiles']; 
    if (!fixedAttributes.includes(key) && key !== 'vida') { 
      valorFinal = valorBase * raridade.multiplicador; 
    }
    efeitoFinal[key] = parseFloat(valorFinal.toFixed(4)); 
    
    const percentAttributes = [ 
        'atkSpeed', 'projSpeed', 'critChance', 'critMultiplier', 
        'raioCooldownReduction', 'xpGainMultiplier', 'luck', 
        'raioCenarioIntervalReduction', 'reflectTouchDamageMultiplier', 
        'reflectProjectileDamageMultiplier'
    ];
    
    if (percentAttributes.includes(key)) { 
      valorExibido = `+${Math.round(valorFinal * 100)}%`; 
    } else if (key === 'hpRegen' || key === 'bleedDamage') { 
      valorExibido = `+${valorFinal.toFixed(1)}/s`; 
    } else if (key === 'projectileCount' || key === 'fragmentationProjectiles') { 
      valorExibido = `+${Math.round(valorFinal)}`; 
    } else { 
      valorExibido = `+${Math.round(valorFinal)}`; 
    }
  }

  if (runaBase.symbol === "ᚦ") { 
      const touchDmg = Math.round((efeitoFinal.reflectTouchDamageMultiplier || 0) * 100); 
      const projDmg = Math.round((efeitoFinal.reflectProjectileDamageMultiplier || 0) * 100); 
      nomeFinal = `${runaBase.nome} Projétil+${projDmg}% Toque+${touchDmg}%`; 
  } else if (runaBase.nome.includes("+")) { 
      nomeFinal = runaBase.nome.replace('+', valorExibido); 
  } else { 
      nomeFinal = `${runaBase.nome} ${valorExibido}`; 
  }
  
  return { 
    ...runaBase, 
    nome: nomeFinal, 
    efeito: efeitoFinal, 
    raridade: raridade.nome, 
    cor: raridade.cor, 
    glow: raridade.glow 
  };
}

function abrirEscolhaDeRuna(niveis = 1) { niveisPendentes += niveis; if (!escolhendoRuna) { escolhendoRuna = true; window.isLevelUpPause = true; mostrarRunaSequencial(); } } 

function mostrarRunaSequencial() {
    if (niveisPendentes <= 0) {
        escolhendoRuna = false;
        window.isLevelUpPause = false;
        return;
    }

    const existente = document.getElementById("runa-overlay");
    if (existente) existente.remove();

    const opcoes = [];
    while (opcoes.length < 3) {
        const r = sortearRuna();
        if (r.efeito && !opcoes.some(opt => opt.symbol === r.symbol)) {
            opcoes.push(r);
        }
    }

    const overlay = document.createElement("div");
    overlay.id = "runa-overlay";
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:flex-start; z-index:9; flex-direction:row; gap:4vw; padding-top:36vh; opacity:0; transition:opacity 180ms ease; cursor:none;";

    // Atributo de dados para impedir cliques múltiplos/rápidos na mesma transição
    overlay.dataset.clicked = "false";

    const titulo = document.createElement("div");
    titulo.id = "runa-titulo";
    titulo.textContent = "CHOOSE YOUR DESTINY";
    titulo.style.cssText = "position:absolute; left:50%; transform:translateX(-50%); color:white; font-family:Arial, sans-serif; font-weight:normal; text-shadow:none; z-index:10; opacity:0; transition:opacity 240ms ease;";
    overlay.appendChild(titulo);

    function atualizarTitulo() {
        titulo.style.top = `${window.innerHeight * 0.12}px`;
        titulo.style.fontSize = `${Math.max(24, window.innerWidth * 0.03)}px`;
    }
    atualizarTitulo();
    window.addEventListener("resize", atualizarTitulo);

    opcoes.forEach((r, index) => {
        const card = document.createElement("div");
        card.className = "runa-card";
        card.style.cssText = "flex:0 0 auto; width:20vw; max-width:150px; min-width:100px; text-align:center; cursor:none; padding:1vw; transition:transform 0.2s;";
        
        if (index === 1) {
            card.dataset.baseTransform = "translateY(-8%)";
            card.style.transform = "translateY(-8%)";
        } else {
            card.dataset.baseTransform = "scale(1)";
            card.style.transform = "scale(1)";
        }

        const symbolContainer = document.createElement("div");
        symbolContainer.style.cssText = "height:6vw; display:flex; align-items:center; justify-content:center;";

        const symbol = document.createElement("div");
        symbol.textContent = r.symbol;
        symbol.style.cssText = `font-size:5vw; color:${r.cor}; text-shadow:${r.glow}; line-height:1;`;
        symbolContainer.appendChild(symbol);

        const name = document.createElement("div");
        name.textContent = r.nome;
        name.style.cssText = "margin-top:0.5vw; color:#ccc; font-size:1vw;";
        
        card.appendChild(symbolContainer);
        card.appendChild(name);
        overlay.appendChild(card);

        card.onmouseenter = () => {
            card.style.transform = card.dataset.baseTransform + " scale(1.15)";
        };
        card.onmouseleave = () => {
            card.style.transform = card.dataset.baseTransform;
        };
        card.onclick = () => { 
            // BLINDAGEM CONTRA CLIQUE DUPLO: Se já houve clique em qualquer card desta tela, bloqueia cliques futuros
            if (overlay.dataset.clicked === "true") return;
            overlay.dataset.clicked = "true";

            aplicarEfeito(r); 
            
            if (typeof window.onRuneChosen === 'function') {
                window.onRuneChosen(r);
            }
            
            overlay.style.opacity = "0"; 
            titulo.style.opacity = "0"; 
            setTimeout(() => { 
                if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); 
                niveisPendentes--; 
                mostrarRunaSequencial(); 
            }, 200); 
        };
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
        overlay.style.opacity = "1";
        titulo.style.opacity = "1";
    });
}

function aplicarEfeito(runa) { 
    if (window.player) { 
        for (let key in runa.efeito) { 
            if (window.player[key] !== undefined) { 
                window.player[key] += runa.efeito[key]; 
            } else { 
                window.player[key] = runa.efeito[key]; 
            } 
        } 
        if (runa.efeito.vida) { 
            window.player.vidaMax = (window.player.vidaMax || 0) + runa.efeito.vida; 
            if (!window.isMultiplayer) { 
                window.player.vida = Math.min(window.player.vida + runa.efeito.vida, window.player.vidaMax); 
            }
        } 
    } 
}
window.abrirEscolhaDeRuna = abrirEscolhaDeRuna; 
window.aplicarEfeito = aplicarEfeito; 
window.drawRunasOverlay = function() { }; 

function resetRunas() { 
    niveisPendentes = 0; 
    escolhendoRuna = false; 
    window.isLevelUpPause = false; 
    const overlay = document.getElementById("runa-overlay"); 
    if (overlay) { 
        overlay.remove(); 
    }
}
window.resetRunas = resetRunas;