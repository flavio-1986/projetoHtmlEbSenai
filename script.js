// ============================================================================
// 1. IMPORTAÇÕES DE MÓDULOS
// ============================================================================
import * as THREE from 'three'; // Biblioteca principal 3D
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'; // Permite girar/zoom com o mouse
import GUI from 'lil-gui'; // Biblioteca que cria o painel de controle no canto da tela


// ============================================================================
// 2. CONFIGURAÇÃO INICIAL DA CENA E PAINEL GUI
// ============================================================================
// Seleciona o elemento <canvas> do HTML
const canvas = document.querySelector('canvas.webgl');

// Cria a Cena (o universo onde todos os objetos 3D, luzes e câmeras existem)
const scene = new THREE.Scene();

// Inicializa o painel de controle interativo no canto superior direito
const gui = new GUI({ width: 320, title: 'Controles da Galáxia' });


// ============================================================================
// 3. PARÂMETROS DA GALÁXIA
// ============================================================================
// Objeto que guarda todas as configurações. O lil-gui vai alterar estes valores diretamente.
const parameters = {
    count: 100000,          // Número total de estrelas (partículas)
    size: 0.015,            // Tamanho visual de cada estrela
    radius: 5,              // Raio total (comprimento) da galáxia
    branches: 3,            // Quantidade de braços espirais
    spin: 1,                // Intensidade da curvatura (torção) dos braços
    randomness: 0.25,       // O quanto as estrelas se espalham para fora da linha do braço
    randomnessPower: 3,     // Potência que concentra a maioria das estrelas no centro do braço
    insideColor: '#ff6030', // Cor do núcleo da galáxia (Laranja/Dourado)
    outsideColor: '#1b3984',// Cor das bordas externas (Azul profundo)
    rotationSpeed: 0.15     // Velocidade de rotação contínua
};

// Variáveis globais para armazenar a geometria, o material e os pontos atuais.
// Precisam ser 'let' porque serão destruídas e recriadas toda vez que mexermos no painel GUI.
let geometry = null;
let material = null;
let points = null;


// ============================================================================
// 4. FUNÇÃO GERADORA DA GALÁXIA
// ============================================================================
const generateGalaxy = () => {
    /**
     * LIMPEZA DE MEMÓRIA (Trecho mostrado no vídeo):
     * Se já existir uma galáxia na tela (quando o usuário mexe nos sliders do lil-gui),
     * precisamos apagar a geometria e o material antigos da placa de vídeo (GPU)
     * para evitar vazamento de memória (memory leak) e travamentos.
     */
    if (points !== null) {
        geometry.dispose();    // Libera os vértices da memória da GPU
        material.dispose();    // Libera os shaders/texturas da memória da GPU
        scene.remove(points);  // Remove o objeto da cena 3D
    }

    /**
     * BUFFER GEOMETRY:
     * É a forma mais performática do Three.js lidar com milhares de objetos.
     * Em vez de criar 100.000 objetos pesados, criamos arrays numéricos simples
     * que são enviados em bloco único para a placa de vídeo.
     */
    geometry = new THREE.BufferGeometry();

    // Cada estrela precisa de 3 números para posição (X, Y, Z) e 3 para cor (R, G, B).
    // Por isso multiplicamos a quantidade de estrelas por 3.
    const positions = new Float32Array(parameters.count * 3);
    const colors = new Float32Array(parameters.count * 3);

    // Converte as strings hexadecimais ('#ff6030') em objetos de cor do Three.js (valores de 0 a 1)
    const colorInside = new THREE.Color(parameters.insideColor);
    const colorOutside = new THREE.Color(parameters.outsideColor);

    // Loop que calcula a posição e a cor de cada uma das 100.000 estrelas
    for (let i = 0; i < parameters.count; i++) {
        // Índice base no array linear: estrela 0 -> índice 0; estrela 1 -> índice 3; estrela 2 -> índice 6...
        const i3 = i * 3;

        // --- A. CÁLCULO DE POSIÇÃO EM ESPIRAL ---
        // Escolhe uma distância aleatória do centro até a borda máxima (radius)
        const radius = Math.random() * parameters.radius;

        // Quanto mais longe do centro (maior o radius), maior o ângulo de torção (cria a curva da espiral)
        const spinAngle = radius * parameters.spin;

        // Divide o círculo completo (2 * PI radianos = 360°) pelo número de braços.
        // O operador módulo (%) distribui as estrelas igualmente entre os braços (0, 1, 2, 0, 1, 2...).
        const branchAngle = ((i % parameters.branches) / parameters.branches) * Math.PI * 2;

        // --- B. DISPERSÃO ALEATÓRIA (ESPALHAMENTO) ---
        // Math.pow(Math.random(), power) gera muitos números próximos de 0 e poucos próximos de 1.
        // Isso faz com que o núcleo dos braços seja denso e as bordas fiquem esparsas como poeira estelar.
        // (Math.random() < 0.5 ? 1 : -1) decide aleatoriamente se o desvio vai para o lado positivo ou negativo.
        const randomX = Math.pow(Math.random(), parameters.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * parameters.randomness * radius;
        const randomY = Math.pow(Math.random(), parameters.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * parameters.randomness * radius;
        const randomZ = Math.pow(Math.random(), parameters.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * parameters.randomness * radius;

        // Converte coordenadas polares (ângulo + raio) para coordenadas cartesianas 3D (X, Y, Z)
        positions[i3]     = Math.cos(branchAngle + spinAngle) * radius + randomX; // Eixo X (largura)
        positions[i3 + 1] = randomY;                                              // Eixo Y (altura/espessura do disco)
        positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ; // Eixo Z (profundidade)

        // --- C. CÁLCULO DO GRADIENTE DE CORES ---
        // Clona a cor interna para não modificar a original
        const mixedColor = colorInside.clone();
        
        // lerp (Linear Interpolation) mistura a cor interna com a externa com base na distância (0.0 a 1.0)
        // Perto do centro (radius = 0) -> 100% insideColor. Na borda (radius = max) -> 100% outsideColor.
        mixedColor.lerp(colorOutside, radius / parameters.radius);

        // Salva os canais Vermelho (R), Verde (G) e Azul (B) no array de cores
        colors[i3]     = mixedColor.r;
        colors[i3 + 1] = mixedColor.g;
        colors[i3 + 2] = mixedColor.b;
    }

    // Anexa os arrays calculados aos atributos da geometria (3 valores por vértice)
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    /**
     * MATERIAL DAS PARTÍCULAS (Trecho exato do vídeo):
     */
    material = new THREE.PointsMaterial({
        size: parameters.size,            // Tamanho base da partícula
        sizeAttenuation: true,            // Faz partículas distantes parecerem menores (perspectiva real)
        depthWrite: false,                // Impede que uma estrela bloqueie o brilho da estrela atrás dela
        blending: THREE.AdditiveBlending, // Soma as cores das partículas sobrepostas (cria o brilho intenso de neon/luz)
        vertexColors: true                // Diz ao material para usar o array 'color' individual de cada vértice
    });

    // Combina a Geometria (onde estão) com o Material (como parecem) para criar a nuvem de pontos
    points = new THREE.Points(geometry, material);
    scene.add(points);
};

// Executa a função pela primeira vez para desenhar a galáxia inicial
generateGalaxy();


// ============================================================================
// 5. CONFIGURAÇÃO DOS CONTROLES INTERATIVOS (LIL-GUI)
// ============================================================================
// Cada .add() cria um slider ou seletor de cor.
// O evento .onFinishChange(generateGalaxy) recria a galáxia assim que você solta o mouse.
gui.add(parameters, 'count').min(1000).max(300000).step(1000).name('Qtd. Estrelas').onFinishChange(generateGalaxy);
gui.add(parameters, 'size').min(0.001).max(0.1).step(0.001).name('Tamanho Estrela').onFinishChange(generateGalaxy);
gui.add(parameters, 'radius').min(1).max(20).step(0.1).name('Raio da Galáxia').onFinishChange(generateGalaxy);
gui.add(parameters, 'branches').min(2).max(12).step(1).name('Braços Espirais').onFinishChange(generateGalaxy);
gui.add(parameters, 'spin').min(-5).max(5).step(0.01).name('Curvatura (Spin)').onFinishChange(generateGalaxy);
gui.add(parameters, 'randomness').min(0).max(2).step(0.01).name('Dispersão').onFinishChange(generateGalaxy);
gui.add(parameters, 'randomnessPower').min(1).max(10).step(0.1).name('Concentração').onFinishChange(generateGalaxy);

// Controles de cor (usamos .onChange para atualizar a cor instantaneamente enquanto arrasta)
gui.addColor(parameters, 'insideColor').name('Cor do Núcleo').onChange(generateGalaxy);
gui.addColor(parameters, 'outsideColor').name('Cor das Bordas').onChange(generateGalaxy);

// Controle de velocidade não precisa recriar a galáxia, apenas altera o valor usado no loop de animação
gui.add(parameters, 'rotationSpeed').min(0).max(2).step(0.01).name('Velocidade Giro');


// ============================================================================
// 6. CÂMERA, CONTROLES DE MOUSE E RESPONSIVIDADE
// ============================================================================
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
};

// Câmera em perspectiva: (Campo de visão 75°, Proporção da tela, Plano próximo 0.1, Plano distante 100)
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100);
camera.position.set(3, 3, 4); // Posiciona a câmera um pouco acima e afastada para ver o disco inclinado
scene.add(camera);

// OrbitControls permite clicar e arrastar para girar, e usar o scroll para zoom
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; // Adiciona inércia/suavidade ao movimento da câmera

// Atualiza a câmera e o renderizador se o usuário redimensionar a janela do navegador
window.addEventListener('resize', () => {
    sizes.width = window.innerWidth;
    sizes.height = window.innerHeight;

    camera.aspect = sizes.width / sizes.height;
    camera.updateProjectionMatrix();

    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});


// ============================================================================
// 7. RENDERIZADOR E LOOP DE ANIMAÇÃO (60+ FPS)
// ============================================================================
const renderer = new THREE.WebGLRenderer({
    canvas: canvas
});
renderer.setSize(sizes.width, sizes.height);
// Limita o pixelRatio a 2 para evitar queda de desempenho em telas 4K ou Retina
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Relógio interno para medir o tempo decorrido independentemente da taxa de quadros (FPS) do monitor
const clock = new THREE.Clock();

const tick = () => {
    const elapsedTime = clock.getElapsedTime();

    // Gira a galáxia continuamente no eixo vertical (Y)
    if (points) {
        points.rotation.y = elapsedTime * parameters.rotationSpeed;
    }

    // Atualiza a suavização (damping) dos controles de câmera
    controls.update();

    // Desenha o quadro atual na tela
    renderer.render(scene, camera);

    // Agenda a execução da função 'tick' no próximo quadro de atualização da tela
    window.requestAnimationFrame(tick);
};

// Inicia o loop de animação
tick();