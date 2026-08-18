// =======================
// COLISAO.JS
// =======================

// Lista de blocos sólidos para colisão
window.blocos = []; // Cria uma variável global chamada 'blocos'. Ela é um array (lista) que irá armazenar todos os objetos retangulares sólidos do cenário com os quais outras entidades (como jogador e projéteis) podem colidir.

/**
 * Inicializa blocos de colisão.
 * Os valores de x, y, largura, altura estão em coordenadas do cenário (não da tela).
 */
function criarBlocos() { // Define uma função para popular a lista `window.blocos` com as coordenadas e dimensões de todas as plataformas e paredes do mapa.
  window.blocos = [ // Atribui à lista 'blocos' um array de objetos, onde cada objeto literal representa um retângulo de colisão.
    // Bordas laterais
    { x: 0, y: 0, width: 120, height: 984 }, // Define um bloco na extrema esquerda do mapa (começando em x=0) para servir como parede/limite.
    { x: 2176 - 120, y: 0, width: 120, height: 984 }, // Define uma parede na extrema direita. O cálculo `2176 - 120` posiciona o início do bloco para que ele termine exatamente na borda do mapa de largura 2176.

    // Plataformas da esquerda
    { x: 120, y: 984 - 320, width: 70, height: 320 }, // Cada um desses objetos representa uma plataforma ou obstáculo no mapa.
    { x: 190, y: 984 - 256, width: 64, height: 256 }, // As coordenadas 'y' são calculadas a partir da base do mapa (984) para facilitar o posicionamento de baixo para cima.
    { x: 254, y: 984 - 190, width: 62, height: 190 },
    { x: 316, y: 984 - 128, width: 64, height: 128 },
    { x: 380, y: 984 - 60, width: 136, height: 60 },
    { x: 516, y: 984 - 128, width: 126, height: 128 },
    { x: 642, y: 984 - 190, width: 186, height: 190 },
    { x: 828, y: 984 - 128, width: 64, height: 128 },
    { x: 892, y: 984 - 60, width: 64, height: 60 },

    // Plataformas da direita (espelhadas)
    { x: 2176 - 190, y: 984 - 320, width: 70, height: 320 }, // Estas plataformas são posicionadas de forma espelhada em relação às da esquerda.
    { x: 2176 - 254, y: 984 - 256, width: 64, height: 256 }, // A fórmula `2176 - [valor]` é usada para calcular a posição X no lado direito do mapa, refletindo a posição do lado esquerdo.
    { x: 2176 - 316, y: 984 - 190, width: 62, height: 190 },
    { x: 2176 - 380, y: 984 - 128, width: 64, height: 128 },
    { x: 2176 - 442, y: 984 - 60, width: 62, height: 60 },

    // Chão (reta no horizonte) - agora tem uma altura mínima para colisão
    { x: 0, y: window.cenarioOriginalHeight - 70, width: window.cenarioOriginalWidth, height: 70 } // Define o chão principal do mapa. Ele ocupa toda a largura (`window.cenarioOriginalWidth`), começa a 70 pixels do fundo e tem 70 pixels de altura, garantindo uma superfície sólida.
  ];
}

/**
 * Desenha blocos para debug com borda vermelha.
 */
function drawBlocos() { // Define uma função para visualizar as caixas de colisão. É extremamente útil para depuração (debug) para ver se as colisões estão alinhadas com os visuais.
  if (!window.ctx || !window.blocos) return; // Checagem de segurança: se o contexto do canvas (`ctx`) ou a lista de blocos não existirem, a função para e não faz nada.
  for (const b of window.blocos) { // Itera sobre cada bloco (`b`) na lista `window.blocos`.
    const telaX = (b.x - window.offsetX) * window.scale; // Converte a coordenada X do bloco (que é do cenário) para a coordenada X da tela, considerando o deslocamento da câmera (`offsetX`) e o zoom (`scale`).
    const telaY = (b.y - window.offsetY) * window.scale; // Faz o mesmo para a coordenada Y.
    const telaW = b.width * window.scale; // Converte a largura do bloco para o tamanho na tela, aplicando o zoom.
    const telaH = b.height * window.scale; // Converte a altura do bloco para o tamanho na tela.

    window.ctx.strokeStyle = 'red'; // Define a cor da linha de desenho para vermelho.
    window.ctx.lineWidth = 2; // Define a espessura da linha para 2 pixels.
    window.ctx.strokeRect(telaX, telaY, telaW, telaH); // Desenha o contorno (não preenchido) do retângulo na tela nas posições e tamanhos calculados.
  }
}

/**
 * Checa colisão do player com blocos.
 * Se colidir, ajusta posição para impedir sobreposição.
 */
function verificarColisoes() { // Função principal que lida com a lógica de colisão e resposta física do jogador com os blocos do cenário.
  if (!window.player || !window.blocos) return; // Checagem de segurança para garantir que o jogador e os blocos existam antes de executar a lógica.

  for (const b of window.blocos) { // Itera sobre cada bloco para verificar a colisão com o jogador.
    // Dimensões da hitbox do player no cenário
    const px = window.player.x + window.player.hitboxOffsetX; // Pega a posição X real da caixa de colisão do jogador, que pode ter um deslocamento (`hitboxOffsetX`) em relação à sua imagem.
    const py = window.player.y + window.player.hitboxOffsetY; // Pega a posição Y da caixa de colisão.
    const pw = window.player.hitboxWidth; // Pega a largura da caixa de colisão (hitbox).
    const ph = window.player.hitboxHeight; // Pega a altura da caixa de colisão (hitbox).

    // Colisão AABB (Axis-Aligned Bounding Box)
    if ( // Este é o algoritmo padrão para verificar se dois retângulos alinhados aos eixos estão se sobrepondo.
      px < b.x + b.width &&   // O lado esquerdo do jogador está à esquerda do lado direito do bloco?
      px + pw > b.x &&        // O lado direito do jogador está à direita do lado esquerdo do bloco?
      py < b.y + b.height &&  // O topo do jogador está acima da base do bloco?
      py + ph > b.y           // A base do jogador está abaixo do topo do bloco?
    ) {
      // Se há colisão, precisamos determinar de qual lado ela ocorreu
      // e ajustar a posição do player para "empurrá-lo" para fora do bloco.

      // Assume que a colisão aconteceu na direção oposta ao movimento
      const prevPy = (window.player.y - window.player.velocityY) + window.player.hitboxOffsetY; // Calcula onde a caixa de colisão do jogador estava no eixo Y no frame anterior, subtraindo a velocidade Y atual.
      const prevPx = (window.player.x - window.player.velocityX) + window.player.hitboxOffsetX; // Calcula a posição X do frame anterior, subtraindo a velocidade X.

      // Colisão Vertical (vindo de cima ou de baixo)
      if (prevPy + ph <= b.y || prevPy >= b.y + b.height) { // Colisão Y. Verifica se, no frame anterior, o jogador estava completamente ACIMA ou completamente ABAIXO do bloco. Isso indica que a colisão atual foi vertical.
        if (window.player.velocityY > 0) { // Se a velocidade Y é positiva, o jogador está caindo. Portanto, colidiu com o topo do bloco.
          window.player.y = b.y - ph - window.player.hitboxOffsetY; // Reposiciona o jogador para que sua base fique exatamente no topo do bloco, resolvendo a sobreposição.
          window.player.velocityY = 0; // Zera a velocidade vertical para parar a queda.
          window.player.jumping = false; // Define que o jogador não está mais pulando (está no chão), permitindo que ele pule novamente.
        } else if (window.player.velocityY < 0) { // Se a velocidade Y é negativa, o jogador está subindo (pulando). Portanto, colidiu com a base do bloco.
          window.player.y = b.y + b.height - window.player.hitboxOffsetY; // Reposiciona o jogador para que seu topo encoste na base do bloco.
          window.player.velocityY = 0; // Zera a velocidade vertical para parar a subida (bateu a cabeça).
        }
      }
      // Colisão Horizontal (vindo da esquerda ou da direita)
      else if (prevPx + pw <= b.x || prevPx >= b.x + b.width) { // Colisão X. Se não foi vertical, verifica se foi horizontal (no frame anterior, estava à ESQUERDA ou à DIREITA do bloco).
        if (window.player.velocityX > 0) { // Se a velocidade X é positiva, o jogador está se movendo para a direita. Portanto, colidiu com o lado esquerdo do bloco.
          window.player.x = b.x - pw - window.player.hitboxOffsetX; // Reposiciona o jogador para que seu lado direito encoste no lado esquerdo do bloco.
        } else if (window.player.velocityX < 0) { // Se a velocidade X é negativa, está se movendo para a esquerda. Colidiu com o lado direito do bloco.
          window.player.x = b.x + b.width - window.player.hitboxOffsetX; // Reposiciona o jogador para que seu lado esquerdo encoste no lado direito do bloco.
        }
        window.player.velocityX = 0; // Zera a velocidade horizontal para impedir que o jogador entre na parede.
      }
    }
  }
}

// Criar blocos ao carregar
criarBlocos(); // Chama a função para criar os blocos assim que o script for lido pelo navegador, populando a lista `window.blocos`.

// Expõe as funções para o escopo global
window.criarBlocos = criarBlocos; // Torna a função `criarBlocos` acessível por outros scripts através do objeto `window`, permitindo recriar os blocos se necessário.
window.drawBlocos = drawBlocos; // Torna a função de desenhar os blocos acessível globalmente, para ser chamada no loop de desenho principal do jogo.
window.verificarColisoes = verificarColisoes; // Torna a função de verificar colisões acessível globalmente, para ser chamada no loop de atualização principal do jogo.