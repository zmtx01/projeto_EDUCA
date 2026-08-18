    // =======================
    // SAVE.JS
    // =======================

    const NUM_SLOTS = 3; // Define uma constante para o número de slots de salvamento disponíveis, que é 3.
    const SAVE_PREFIX = "wizzGame_saveSlot_"; // Define um prefixo padrão para as chaves de salvamento no localStorage, para evitar conflitos com outros dados no mesmo domínio.
    let isDeleteMode = false; // Declara uma flag (variável booleana) para controlar se o modo de exclusão de saves está ativo.
    let originalSlotTexts = {}; // Cria um objeto para armazenar o texto original de cada botão de slot (ex: "Lvl 5 | Orda 3"), para poder restaurá-lo após alguma ação.

    function setButtonContent(button, text) { // Função auxiliar para definir o conteúdo HTML de um botão de slot.
        button.innerHTML = `<span>${text}</span><div class="progress-bar"></div>`; // Define o HTML interno do botão para conter um `<span>` com o texto e um `<div>` que servirá como barra de progresso visual.
    }

    function showFeedbackOnButton(button, message, color, duration = 1500) { // Função para mostrar uma mensagem de feedback temporária em um botão (ex: "Salvando...", "Carregando...").
        if (button.classList.contains('delete-mode-active')) return; // Se o botão estiver no modo de exclusão, não mostra o feedback para evitar conflitos visuais.
        const originalText = button.querySelector('span').textContent; // Armazena o texto atual do botão.
        const originalColor = button.style.color; // Armazena a cor atual do texto do botão.
        button.querySelector('span').textContent = message; // Altera o texto do botão para a mensagem de feedback.
        button.style.color = color; // Altera a cor do texto para a cor de feedback.
        setTimeout(() => { // Define um temporizador para reverter as mudanças.
            button.querySelector('span').textContent = originalText; // Restaura o texto original do botão.
            button.style.color = originalColor; // Restaura a cor original.
            updateSaveSlotsUI(); // Chama a função para atualizar a UI dos slots, garantindo que tudo volte ao estado correto.
        }, duration); // A reversão acontece após a duração especificada (padrão de 1500ms).
    }

    // <<< FUNÇÃO MODIFICADA >>>
    function saveGame(slotIndex) { // Função para salvar o estado atual do jogo no slot especificado.
    if (!window.player) return; // Se o objeto do jogador não existir, interrompe a função.
    const button = document.getElementById(`save-slot-${slotIndex}`); // Pega a referência do botão do slot correspondente.
    showFeedbackOnButton(button, "Salvando...", "lime"); // Mostra a mensagem "Salvando..." no botão.
    
    // Adiciona as novas propriedades à lista de dados a serem salvos
    const playerDataToSave = { // Cria um objeto contendo apenas as propriedades do jogador que devem ser salvas.
        level: player.level, xp: player.xp, xpMax: player.xpMax, vidaMax: player.vidaMax,
        attack: player.attack, speed: player.speed, attackCooldown: player.attackCooldown,
        projectilePenetration: player.projectilePenetration, critChance: player.critChance,
        critMultiplier: player.critMultiplier, projectileCount: player.projectileCount,
        raioCooldownReduction: player.raioCooldownReduction, xpGainMultiplier: player.xpGainMultiplier,
        hpRegen: player.hpRegen, luck: player.luck, atkSpeed: player.atkSpeed || 0,
        projSpeed: player.projSpeed || 0, raioCenarioIntervalReduction: player.raioCenarioIntervalReduction || 0,
        
        // <<< CORREÇÃO: ADICIONA AS NOVAS PROPRIEDADES AQUI >>>
        bleedDamage: player.bleedDamage || 0, // Adiciona o dano de sangramento ao objeto de salvamento. Usa `|| 0` como fallback caso a propriedade não exista.
        fragmentationProjectiles: player.fragmentationProjectiles || 0, // Adiciona o número de projéteis de fragmentação ao objeto de salvamento.
    };

    const gameStateToSave = { ordaAtual: window.ordaAtual || 1 }; // Cria um objeto com o estado do jogo a ser salvo (neste caso, apenas a horda atual).
    const saveState = { // Cria o objeto final de salvamento, que agrupa os dados do jogador, do jogo e metadados.
        player: playerDataToSave,
        gameState: gameStateToSave,
        metadata: { saveDate: new Date().toLocaleString('pt-BR') } // Adiciona metadados, como a data e hora do salvamento.
    };
    try { // Usa um bloco try-catch para lidar com possíveis erros ao salvar no localStorage (ex: falta de espaço).
        localStorage.setItem(`${SAVE_PREFIX}${slotIndex}`, JSON.stringify(saveState)); // Converte o objeto `saveState` para uma string JSON e a armazena no localStorage com a chave correta.
        setTimeout(() => { updateSaveSlotsUI(); }, 100); // Aguarda um pequeno instante e depois atualiza a UI dos slots para refletir o novo save.
    } catch (error) { // Se ocorrer um erro.
        showFeedbackOnButton(button, "Erro ao Salvar!", "red"); // Mostra uma mensagem de erro no botão.
    }
    }

    function loadGame(slotIndex) { // Função para carregar um jogo a partir de um slot.
    const saveDataString = localStorage.getItem(`${SAVE_PREFIX}${slotIndex}`); // Tenta obter os dados salvos do localStorage usando a chave do slot.
    const button = document.getElementById(`save-slot-${slotIndex}`); // Pega o botão do slot.
    if (!saveDataString) { // Se não houver dados salvos nesse slot.
        showFeedbackOnButton(button, "Slot Vazio!", "red"); // Mostra uma mensagem de erro.
        return; // Interrompe a função.
    }
    showFeedbackOnButton(button, "Carregando...", "lime"); // Mostra a mensagem "Carregando...".
    setTimeout(() => { // Define um temporizador para dar tempo ao usuário de ver a mensagem.
        localStorage.setItem('wizzGame_loadOnStart', slotIndex); // Armazena no localStorage qual slot deve ser carregado na próxima vez que a página for aberta.
        window.location.reload(); // Recarrega a página. A lógica para aplicar os dados salvos será executada no início do carregamento da página.
    }, 500); // Aguarda 500ms antes de recarregar.
    }

    function deleteSave(slotIndex) { // Função para excluir os dados de um slot.
        localStorage.removeItem(`${SAVE_PREFIX}${slotIndex}`); // Remove o item do localStorage com a chave correspondente.
        updateSaveSlotsUI(); // Atualiza a UI dos slots para mostrar que o slot está agora vazio.
        toggleDeleteMode(false); // Desativa o modo de exclusão.
    }

    function updateSaveSlotsUI() { // Função para atualizar a aparência de todos os botões de slot com base nos dados salvos.
        for (let i = 1; i <= NUM_SLOTS; i++) { // Loop de 1 a 3 (o número de slots).
            const button = document.getElementById(`save-slot-${i}`); // Pega o botão do slot atual.
            if (!button) continue; // Se o botão não for encontrado, pula para o próximo.
            const saveDataString = localStorage.getItem(`${SAVE_PREFIX}${i}`); // Pega os dados salvos para este slot.
            let textToShow = ""; // Inicializa a variável para o texto do botão.
            if (saveDataString) { // Se existem dados salvos.
                try { // Tenta analisar os dados JSON.
                    const data = JSON.parse(saveDataString); // Converte a string de volta para um objeto.
                    textToShow = `Lvl ${data.player.level} | Orda ${data.gameState.ordaAtual}`; // Formata o texto a ser exibido com informações do save.
                    button.style.color = 'lime'; // Define a cor do texto como verde.
                    button.dataset.hasSave = "true"; // Define um atributo de dados no elemento HTML para indicar que ele tem um save.
                } catch (e) { // Se ocorrer um erro ao analisar o JSON (arquivo corrompido).
                    textToShow = `Slot ${i} - Corrompido`; // Mostra uma mensagem de erro.
                    button.style.color = 'red'; // Define a cor como vermelha.
                    button.dataset.hasSave = "false"; // Marca que não tem um save válido.
                }
            } else { // Se não existem dados salvos.
                textToShow = `Slot ${i} - Vazio`; // Mostra a mensagem "Vazio".
                button.style.color = '#ccc'; // Define a cor como cinza.
                button.dataset.hasSave = "false"; // Marca que não tem um save.
            }
            originalSlotTexts[i] = textToShow; // Armazena o texto gerado para poder restaurá-lo mais tarde.
            if (!isDeleteMode) { // Se não estiver no modo de exclusão.
                setButtonContent(button, textToShow); // Atualiza o conteúdo do botão.
            }
        }
        if(isDeleteMode) { // Se o modo de exclusão estiver ativo.
            toggleDeleteMode(true, true); // Chama a função para garantir que a UI de exclusão seja reaplicada corretamente.
        }
    }

    function applyLoadedData() { // Função que é chamada no início do jogo para aplicar os dados de um save, se houver um marcado para ser carregado.
        const slotToLoad = localStorage.getItem('wizzGame_loadOnStart'); // Verifica se há uma marcação para carregar um slot.
        if (!slotToLoad) { // Se não houver.
            return false; // Retorna `false` indicando que nenhum jogo foi carregado.
        }
        const saveDataString = localStorage.getItem(`${SAVE_PREFIX}${slotToLoad}`); // Pega os dados do slot marcado.
        localStorage.removeItem('wizzGame_loadOnStart'); // Remove a marcação para não carregar novamente em futuros reloads.
        if (saveDataString) { // Se os dados existirem.
            try { // Tenta analisar os dados.
                const savedData = JSON.parse(saveDataString); // Converte a string para um objeto.
                // Garante que todas as propriedades do jogador salvas sejam aplicadas
                Object.assign(window.player, savedData.player); // `Object.assign` copia todas as propriedades do objeto `savedData.player` para o objeto `window.player`, atualizando o jogador com os dados salvos.
                Object.assign(window, savedData.gameState); // Copia as propriedades do estado do jogo para o objeto `window` global.
                window.player.vida = window.player.vidaMax; // Restaura a vida do jogador para o máximo ao carregar.
                window.playerLastLevel = window.player.level; // Sincroniza o `playerLastLevel` para evitar falsos "level ups" ao carregar.
                console.log(`Jogo carregado do Slot ${slotToLoad}. Orda atual: ${window.ordaAtual}`); // Exibe uma mensagem de confirmação no console.
                return true; // Retorna `true` indicando que um jogo foi carregado com sucesso.
            } catch(e) { // Se houver um erro.
                console.error("Erro ao aplicar dados salvos:", e); // Exibe o erro no console.
                return false; // Retorna `false`.
            }
        }
        return false; // Retorna `false` se os dados não foram encontrados por algum motivo.
    }

    // ... (O resto do arquivo save.js continua igual)
    function toggleDeleteMode(forceState, isUpdate = false) { const clearButton = document.getElementById('clear-button'); if (!isUpdate) { isDeleteMode = (typeof forceState === 'boolean') ? forceState : !isDeleteMode; } if (isDeleteMode) { clearButton.textContent = "Cancelar"; for (let i = 1; i <= NUM_SLOTS; i++) { const button = document.getElementById(`save-slot-${i}`); button.classList.remove('delete-mode-empty', 'delete-mode-active'); if (button.dataset.hasSave === "true") { setButtonContent(button, 'Confirmar Limpeza'); button.style.color = ''; button.classList.add('delete-mode-active'); } else { setButtonContent(button, originalSlotTexts[i]); button.classList.add('delete-mode-empty'); } } } else { clearButton.textContent = "Limpar"; for (let i = 1; i <= NUM_SLOTS; i++) { const button = document.getElementById(`save-slot-${i}`); setButtonContent(button, originalSlotTexts[i]); button.classList.remove('delete-mode-active', 'delete-mode-empty'); if (button.dataset.hasSave === "true") { button.style.color = 'lime'; } else { button.style.color = '#ccc'; } } } } // Função que alterna a interface do usuário para o modo de exclusão de saves, mudando o texto dos botões e aplicando classes CSS.
    function setupSaveSystem() { const container = document.getElementById('save-slots-container'); const clearButton = document.getElementById('clear-button'); const instrContainer = document.getElementById('save-instructions'); const instrNormal = document.getElementById('instr-normal'); const instrDelete = document.getElementById('instr-delete'); const showNormalHelp = () => { instrNormal.style.display = 'block'; instrDelete.style.display = 'none'; instrContainer.style.opacity = '1'; }; const showDeleteHelp = () => { instrNormal.style.display = 'none'; instrDelete.style.display = 'block'; instrContainer.style.opacity = '1'; }; const hideHelp = () => { instrContainer.style.opacity = '0'; }; container.addEventListener('mouseleave', hideHelp); clearButton.addEventListener('mouseenter', showDeleteHelp); clearButton.addEventListener('click', () => toggleDeleteMode()); for (let i = 1; i <= NUM_SLOTS; i++) { const button = document.getElementById(`save-slot-${i}`); button.addEventListener('mouseenter', () => { if (isDeleteMode && button.dataset.hasSave === "true") { showDeleteHelp(); } else if (!isDeleteMode) { showNormalHelp(); } }); let holdTimeout = null; let progressInterval = null; const cancelAction = () => { clearTimeout(holdTimeout); clearInterval(progressInterval); const progressBar = button.querySelector('.progress-bar'); if(progressBar) { progressBar.style.height = '0%'; progressBar.style.transition = 'height 0.2s ease-out'; } }; button.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); const progressBar = button.querySelector('.progress-bar'); if (isDeleteMode) { if (!e.shiftKey || button.dataset.hasSave !== 'true') return; progressBar.style.setProperty('--progress-bar-bg', 'rgba(255, 255, 0, 0.6)'); progressBar.style.transition = 'none'; let progress = 0; const DURATION = 2000; const INTERVAL = 20; progressInterval = setInterval(() => { progress += INTERVAL; progressBar.style.height = `${(progress / DURATION) * 100}%`; }, INTERVAL); holdTimeout = setTimeout(() => { clearInterval(progressInterval); deleteSave(i); }, DURATION); } else { if (e.shiftKey && e.button === 0) { progressBar.style.setProperty('--progress-bar-bg', 'rgba(0, 255, 0, 0.4)'); progressBar.style.transition = 'none'; let progress = 0; const DURATION = 1000; const INTERVAL = 20; progressInterval = setInterval(() => { progress += INTERVAL; progressBar.style.height = `${(progress / DURATION) * 100}%`; }, INTERVAL); holdTimeout = setTimeout(() => { clearInterval(progressInterval); saveGame(i); setTimeout(cancelAction, 200); }, DURATION); } else if (e.altKey && e.button === 0) { loadGame(i); } } }); button.addEventListener('mouseup', cancelAction); button.addEventListener('mouseleave', cancelAction); } updateSaveSlotsUI(); toggleDeleteMode(false); } // Função principal que inicializa todo o sistema de salvamento, adicionando todos os "ouvintes" de eventos aos botões para lidar com cliques, segurar o botão (para salvar/deletar) e exibir instruções.
    window.applyLoadedData = applyLoadedData; // Expõe a função `applyLoadedData` globalmente para ser chamada por outros scripts no início do jogo.
    window.setupSaveSystem = setupSaveSystem; // Expõe a função `setupSaveSystem` globalmente para ser chamada para inicializar a interface de salvamento.