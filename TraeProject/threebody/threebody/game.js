// 三体文明模拟器 - 使用Matter.js物理引擎

// 常量定义
const G = 6.67430e-11; // 万有引力常数
const TIME_SCALE_DEFAULT = 1; // 默认时间缩放
const TIME_SCALES = [1, 10, 100]; // 时间缩放选项（1倍，10倍，100倍）
const TEMPERATURE_LIMITS = {
    tooHot: 80,     // 过热极限
    tooCold: -100,  // 过冷极限
    minHabitable: -20, // 可居住最低温度
    maxHabitable: 50   // 可居住最高温度
};
// 三体系统参数调整
const THREE_BODY_PARAMS = {
    customG: 2.5e5, // 调整后的引力常数，使系统更稳定
    maxSpeed: 1.0,  // 最大速度限制
    planetMaxSpeed: 1.5, // 行星最大速度限制
    starMassRange: [40, 60], // 恒星质量范围
    planetMass: 20, // 行星质量
    initialDistance: 100, // 初始位置距离中心的距离
    initialDistanceVariation: 30 // 初始位置距离变化范围
};

// 文明时代定义
const ERAS = [
    { name: "石器时代", developmentTime: 2500000, color: "#8B4513" },      // 250万年
    { name: "农耕时代", developmentTime: 7000, color: "#2E8B57" },         // 7000年
    { name: "青铜时代", developmentTime: 2000, color: "#CD7F32" },         // 2000年
    { name: "铁器时代", developmentTime: 1000, color: "#808080" },         // 1000年
    { name: "航海时代", developmentTime: 500, color: "#4169E1" },          // 500年
    { name: "蒸汽时代", developmentTime: 150, color: "#A0522D" },          // 150年
    { name: "工业时代", developmentTime: 100, color: "#696969" },          // 100年
    { name: "电气时代", developmentTime: 50, color: "#FFFF00" },           // 50年
    { name: "电子时代", developmentTime: 30, color: "#00CED1" },           // 30年
    { name: "航天时代", developmentTime: 20, color: "#8A2BE2" },           // 20年
    { name: "航空时代", developmentTime: 10, color: "#FF1493" },           // 10年
    { name: "星际时代", developmentTime: 5, color: "#FFD700" }             // 5年（目标）
];

// 游戏状态
const gameState = {
    canvas: null,
    ctx: null,
    animationId: null,
    currentTime: 0, // 模拟时间（年）
    realTimeElapsed: 0, // 实际经过时间（毫秒）
    timeScaleIndex: 0,
    timeScale: TIME_SCALE_DEFAULT,
    isRunning: false,
    lifeExists: false,
    currentEraIndex: -1,
    eraProgress: 0,
    lastResetEraIndex: -1,
    lastResetProgress: 0,
    surfaceTemperature: 0,
    history: [],
    stars: [], // 存储星体的渲染信息
    planet: null, // 存储行星的渲染信息
    // Matter.js相关对象
    engine: null,
    world: null,
    bodies: {}
};

// 初始化游戏
function initGame() {
    // 获取Canvas元素并设置上下文
    gameState.canvas = document.getElementById('simulationCanvas');
    gameState.ctx = gameState.canvas.getContext('2d');
    
    // 初始化Matter.js引擎
    gameState.engine = Matter.Engine.create({
        gravity: { x: 0, y: 0 }, // 禁用默认重力
        enableSleeping: false, // 禁用睡眠以保持连续运动
        velocityIterations: 8, // 提高速度计算精度
        positionIterations: 8 // 提高位置计算精度
    });
    gameState.world = gameState.engine.world;
    
    // 调整canvas尺寸以适应容器
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // 绑定按钮事件
    document.getElementById('randomizeBtn').addEventListener('click', randomizeSystem);
    document.getElementById('startBtn').addEventListener('click', toggleSimulation);
    document.getElementById('resetBtn').addEventListener('click', resetGame);
    document.getElementById('fastForwardBtn').addEventListener('click', toggleFastForward);
    document.getElementById('restartBtn').addEventListener('click', restartGame);
    
    // 添加自定义重力系统
    Matter.Events.on(gameState.engine, 'afterUpdate', applyGravitationalForces);
    
    // 初始渲染
    render();
}

// 切换模拟的开始/暂停状态
function toggleSimulation() {
    gameState.isRunning = !gameState.isRunning;
    
    // 更新按钮文本
    const startBtn = document.getElementById('startBtn');
    startBtn.textContent = gameState.isRunning ? '暂停' : '开始';
    startBtn.classList.toggle('active', gameState.isRunning);
    
    if (gameState.isRunning) {
        // 开始模拟
        if (Object.keys(gameState.bodies).length > 0) {
            lastFrameTime = performance.now();
            simulate();
            addHistoryEntry('模拟开始运行');
        } else {
            // 如果没有初始化系统，先初始化
            randomizeSystem();
        }
    } else {
        // 暂停模拟
        addHistoryEntry('模拟暂停');
    }
}

// 调整canvas尺寸
function resizeCanvas() {
    const container = gameState.canvas.parentElement;
    gameState.canvas.width = container.clientWidth;
    gameState.canvas.height = container.clientHeight;
    
    // 更新世界边界
    if (gameState.world) {
        // 移除旧边界
        const bodiesToRemove = [];
        for (let i = 0; i < gameState.world.bodies.length; i++) {
            const body = gameState.world.bodies[i];
            if (body.isStatic && body.label && body.label.startsWith('boundary')) {
                bodiesToRemove.push(body);
            }
        }
        bodiesToRemove.forEach(body => Matter.World.remove(gameState.world, body));
        
        // 添加新边界
        const thickness = 50;
        const boundaries = [
            // 顶部边界
            Matter.Bodies.rectangle(gameState.canvas.width / 2, -thickness / 2, gameState.canvas.width, thickness, {
                isStatic: true,
                restitution: 0.8,
                label: 'boundary_top'
            }),
            // 底部边界
            Matter.Bodies.rectangle(gameState.canvas.width / 2, gameState.canvas.height + thickness / 2, gameState.canvas.width, thickness, {
                isStatic: true,
                restitution: 0.8,
                label: 'boundary_bottom'
            }),
            // 左侧边界
            Matter.Bodies.rectangle(-thickness / 2, gameState.canvas.height / 2, thickness, gameState.canvas.height, {
                isStatic: true,
                restitution: 0.8,
                label: 'boundary_left'
            }),
            // 右侧边界
            Matter.Bodies.rectangle(gameState.canvas.width + thickness / 2, gameState.canvas.height / 2, thickness, gameState.canvas.height, {
                isStatic: true,
                restitution: 0.8,
                label: 'boundary_right'
            })
        ];
        
        Matter.World.add(gameState.world, boundaries);
    }
    
    render();
}

// 应用万有引力
function applyGravitationalForces() {
    // 确保系统正在运行
    if (!gameState.isRunning) return;
    
    // 获取所有动态天体
    const dynamicBodies = [];
    for (const id in gameState.bodies) {
        dynamicBodies.push(gameState.bodies[id]);
    }
    
    // 对每对天体应用引力
    for (let i = 0; i < dynamicBodies.length; i++) {
        for (let j = i + 1; j < dynamicBodies.length; j++) {
            const bodyA = dynamicBodies[i];
            const bodyB = dynamicBodies[j];
            
            // 确保两个物体都有效
            if (!bodyA || !bodyB || !bodyA.position || !bodyB.position) continue;
            
            // 计算距离向量
            const dx = bodyB.position.x - bodyA.position.x;
            const dy = bodyB.position.y - bodyA.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // 避免距离过小导致的极大引力
            const minDistance = (bodyA.circleRadius || 10) + (bodyB.circleRadius || 10) + 10; // 调整最小距离
            if (distance < minDistance) continue;
            
            // 使用三体系统参数中的引力常数
            const customG = THREE_BODY_PARAMS.customG;
            
            // 计算引力大小 F = G * m1 * m2 / r^2
            const forceMagnitude = customG * bodyA.mass * bodyB.mass / (distance * distance);
            
            // 应用引力到两个天体
            const forceX = forceMagnitude * dx / distance; // 确保是单位向量
            const forceY = forceMagnitude * dy / distance;
            
            Matter.Body.applyForce(bodyA, bodyA.position, { x: forceX, y: forceY });
            Matter.Body.applyForce(bodyB, bodyB.position, { x: -forceX, y: -forceY });
        }
    }
    
    // 限制最大速度以避免数值不稳定
    for (const id in gameState.bodies) {
        const body = gameState.bodies[id];
        if (!body || !body.velocity) continue;
        
        // 使用三体系统参数中的最大速度限制
        const maxSpeed = body.label === 'planet' ? THREE_BODY_PARAMS.planetMaxSpeed : THREE_BODY_PARAMS.maxSpeed;
        
        const speed = Math.sqrt(body.velocity.x * body.velocity.x + body.velocity.y * body.velocity.y);
        if (speed > maxSpeed) {
            const factor = maxSpeed / speed;
            Matter.Body.setVelocity(body, {
                x: body.velocity.x * factor,
                y: body.velocity.y * factor
            });
        }
    }
    
    // 保持天体在画布范围内
    for (const id in gameState.bodies) {
        const body = gameState.bodies[id];
        if (!body || !body.position) continue;
        
        const margin = 50;
        const centerX = gameState.canvas.width / 2;
        const centerY = gameState.canvas.height / 2;
        
        // 检查是否超出边界，并施加额外的约束力
        if (body.position.x < margin || body.position.x > gameState.canvas.width - margin ||
            body.position.y < margin || body.position.y > gameState.canvas.height - margin) {
            
            // 计算到中心的向量
            const dx = centerX - body.position.x;
            const dy = centerY - body.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                // 施加约束力，拉回中心
                const约束力 = 0.01 * body.mass;
                Matter.Body.applyForce(body, body.position, {
                    x: (dx / distance) * 约束力,
                    y: (dy / distance) * 约束力
                });
            }
        }
    }
}

// 初始化三体系统（三体+一颗行星，共4个主星体）
function randomizeSystem() {
    // 停止之前的动画
    if (gameState.animationId) {
        cancelAnimationFrame(gameState.animationId);
        gameState.animationId = null;
    }
    
    // 清除现有天体
    if (gameState.world) {
        // 移除动态天体
        for (const id in gameState.bodies) {
            Matter.World.remove(gameState.world, gameState.bodies[id]);
        }
        
        // 清空存储
        gameState.bodies = {};
        gameState.stars = [];
        gameState.planet = null;
    }
    
    // 重置游戏状态，但保留历史和科技进度
    gameState.currentTime = 0;
    gameState.realTimeElapsed = 0;
    gameState.isRunning = false; // 初始化为暂停状态，等待用户点击开始
    
    // 更新开始按钮文本
    const startBtn = document.getElementById('startBtn');
    startBtn.textContent = '开始';
    startBtn.classList.remove('active');
    
    // 创建三体系统（三颗恒星和一颗行星）
    const starColors = ['#FF5733', '#FFC300', '#33FF57'];
    const centerX = gameState.canvas.width / 2;
    const centerY = gameState.canvas.height / 2;
    
    // 创建三颗恒星 - 采用更稳定的初始配置
    for (let i = 0; i < 3; i++) {
        // 使用极坐标创建初始位置，确保星体均匀分散
        const angle = (i / 3) * Math.PI * 2 + (Math.random() - 0.5) * 0.2; // 小幅度随机化角度
        const distance = THREE_BODY_PARAMS.initialDistance + (Math.random() - 0.5) * THREE_BODY_PARAMS.initialDistanceVariation;
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;
        
        // 恒星参数
        const radius = 18 + Math.random() * 5; // 增大半径使星体更明显
        const mass = THREE_BODY_PARAMS.starMassRange[0] + Math.random() * (THREE_BODY_PARAMS.starMassRange[1] - THREE_BODY_PARAMS.starMassRange[0]);
        
        // 创建物理体
        const starBody = Matter.Bodies.circle(x, y, radius, {
            mass: mass,
            friction: 0,
            frictionAir: 0,
            restitution: 0.9,
            label: `star_${i}`
        });
        
        // 为每个恒星设置合理的初始速度，形成旋转系统
        // 使用更精确的初始速度计算，确保系统稳定性
        const vAngle = angle + Math.PI / 2 + (Math.random() - 0.5) * 0.1; // 略微调整速度方向
        const baseSpeed = 0.7; // 基础速度
        const speed = baseSpeed + (Math.random() - 0.5) * 0.1; // 微调速度
        Matter.Body.setVelocity(starBody, {
            x: Math.cos(vAngle) * speed,
            y: Math.sin(vAngle) * speed
        });
        
        // 添加到世界
        Matter.World.add(gameState.world, starBody);
        
        // 存储渲染信息
        gameState.bodies[`star_${i}`] = starBody;
        gameState.stars.push({
            id: `star_${i}`,
            mass: mass,
            color: starColors[i],
            radius: radius
        });
    }
    
    // 创建一颗行星，放置在三星系统的适当位置
    const planetAngle = Math.random() * Math.PI * 2;
    const planetDistance = THREE_BODY_PARAMS.initialDistance * 1.5 + Math.random() * 30;
    const planetX = centerX + Math.cos(planetAngle) * planetDistance;
    const planetY = centerY + Math.sin(planetAngle) * planetDistance;
    const planetRadius = 12; // 增大行星半径使其更明显
    const planetMass = THREE_BODY_PARAMS.planetMass;
    
    // 创建行星物理体
    const planetBody = Matter.Bodies.circle(planetX, planetY, planetRadius, {
        mass: planetMass,
        friction: 0,
        frictionAir: 0,
        restitution: 0.95,
        label: 'planet'
    });
    
    // 设置行星初始速度，使其有可能在三星系统中生存更长时间
    const planetVAngle = planetAngle + Math.PI / 2 + (Math.random() - 0.5) * 0.2;
    const planetSpeed = 0.9; // 行星初始速度
    Matter.Body.setVelocity(planetBody, {
        x: Math.cos(planetVAngle) * planetSpeed,
        y: Math.sin(planetVAngle) * planetSpeed
    });
    
    // 添加到世界
    Matter.World.add(gameState.world, planetBody);
    
    // 存储渲染信息
    gameState.bodies.planet = planetBody;
    gameState.planet = {
        id: 'planet',
        mass: planetMass,
        color: '#3498db',
        radius: planetRadius
    };
    

    
    // 计算初始温度
    calculateTemperature();
    
    // 记录历史
    addHistoryEntry('系统初始化完成，请点击开始按钮运行模拟');
    
    // 更新UI
    updateUI();
    
    // 只渲染初始状态，不自动开始模拟
    render();
}

// 重置游戏
function resetGame() {
    // 停止动画
    if (gameState.animationId) {
        cancelAnimationFrame(gameState.animationId);
        gameState.animationId = null;
    }
    
    // 完全重置游戏状态
    gameState.currentTime = 0;
    gameState.realTimeElapsed = 0;
    gameState.isRunning = false;
    gameState.timeScaleIndex = 0;
    gameState.timeScale = TIME_SCALE_DEFAULT;
    gameState.lifeExists = false;
    gameState.currentEraIndex = -1;
    gameState.eraProgress = 0;
    gameState.lastResetEraIndex = -1;
    gameState.lastResetProgress = 0;
    gameState.surfaceTemperature = 0;
    
    // 清除天体
    if (gameState.world) {
        for (const id in gameState.bodies) {
            Matter.World.remove(gameState.world, gameState.bodies[id]);
        }
        gameState.bodies = {};
        gameState.stars = [];
        gameState.planet = null;
    }
    
    // 更新按钮状态
    document.getElementById('fastForwardBtn').textContent = `快进 (1x)`;
    
    // 清空画布
    gameState.ctx.clearRect(0, 0, gameState.canvas.width, gameState.canvas.height);
    
    // 记录历史
    addHistoryEntry('游戏重置，等待初始化...');
    
    // 更新UI
    updateUI();
}

// 切换快进模式
function toggleFastForward() {
    gameState.timeScaleIndex = (gameState.timeScaleIndex + 1) % (TIME_SCALES.length + 1);
    
    if (gameState.timeScaleIndex === TIME_SCALES.length) {
        // 恢复默认速度
        gameState.timeScale = TIME_SCALE_DEFAULT;
        document.getElementById('fastForwardBtn').textContent = `快进 (1x)`;
    } else {
        gameState.timeScale = TIME_SCALES[gameState.timeScaleIndex];
        document.getElementById('fastForwardBtn').textContent = `快进 (${gameState.timeScale}x)`;
    }
    
    addHistoryEntry(`时间流速调整为 ${gameState.timeScale}x 速度`);
}

// 重新开始游戏（成功后调用）
function restartGame() {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('successMessage').style.display = 'none';
    resetGame();
}

// 添加历史记录
function addHistoryEntry(message) {
    gameState.history.unshift({
        time: new Date().toLocaleTimeString(),
        message: message
    });
    
    // 限制历史记录数量
    if (gameState.history.length > 50) {
        gameState.history.pop();
    }
    
    // 更新历史记录UI
    const historyElement = document.getElementById('gameHistory');
    historyElement.innerHTML = '';
    
    gameState.history.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'history-entry';
        div.textContent = `[${entry.time}] ${entry.message}`;
        historyElement.appendChild(div);
    });
}

// 计算行星表面温度
function calculateTemperature() {
    if (!gameState.planet || gameState.stars.length === 0) return;
    
    // 简化的温度计算：基于与所有恒星的距离
    let totalHeating = 0;
    
    gameState.stars.forEach(star => {
        const body = gameState.bodies[star.id];
        const planetBody = gameState.bodies.planet;
        
        if (!body || !planetBody) return;
        
        const dx = planetBody.position.x - body.position.x;
        const dy = planetBody.position.y - body.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 基于距离的加热效应（简化模型）
        const heating = (star.mass / (distance * distance)) * 0.5; // 增加加热系数
        totalHeating += heating;
    });
    
    // 添加一些随机波动
    const randomVariation = (Math.random() - 0.5) * 20; // 增加随机波动范围
    gameState.surfaceTemperature = Math.min(100, Math.max(-100, totalHeating + randomVariation)); // 移除-30的偏移量
    

    
    // 更新温度指示器
    updateTemperatureIndicator();
    
    return gameState.surfaceTemperature;
}

// 更新温度指示器
function updateTemperatureIndicator() {
    const pointer = document.getElementById('tempPointer');
    
    // 将温度映射到0-100%的位置
    let percent = 50;
    
    if (gameState.surfaceTemperature <= -100) {
        percent = 0;
    } else if (gameState.surfaceTemperature >= 100) {
        percent = 100;
    } else {
        // 线性映射，从-100到100度映射到0-100%
        percent = ((gameState.surfaceTemperature + 100) / 200) * 100;
    }
    
    pointer.style.left = `${percent}%`;
}

// 检查生命状态
function checkLifeStatus() {
    if (!gameState.planet || gameState.stars.length === 0) return;
    
    const prevLifeExists = gameState.lifeExists;
    const isHabitable = gameState.surfaceTemperature >= TEMPERATURE_LIMITS.minHabitable && 
                       gameState.surfaceTemperature <= TEMPERATURE_LIMITS.maxHabitable;
    
    // 如果变为可居住且之前没有生命，则生命出现
    if (isHabitable && !prevLifeExists) {
        gameState.lifeExists = true;
        
        // 决定从哪个时代开始发展
        if (gameState.lastResetEraIndex >= 0) {
            if (gameState.lastResetProgress >= 60) {
                // 从上一次毁灭时的时代开始
                gameState.currentEraIndex = gameState.lastResetEraIndex;
                gameState.eraProgress = gameState.lastResetProgress;
                addHistoryEntry(`生命在${ERAS[gameState.currentEraIndex].name}重生，保留了${gameState.eraProgress}%的科技`);
            } else if (gameState.lastResetProgress >= 10) {
                // 从上一个时代开始
                gameState.currentEraIndex = Math.max(0, gameState.lastResetEraIndex - 1);
                gameState.eraProgress = 0;
                addHistoryEntry(`生命在${ERAS[gameState.currentEraIndex].name}重生`);
            } else {
                // 从头开始
                gameState.currentEraIndex = 0;
                gameState.eraProgress = 0;
                addHistoryEntry('生命出现，但之前的科技几乎完全丧失，重新开始发展');
            }
        } else {
            // 第一次出现生命
            gameState.currentEraIndex = 0;
            gameState.eraProgress = 0;
            addHistoryEntry('原始生命出现！文明发展开始...');
        }
    }
    // 如果变得不适宜居住且之前有生命，则生命毁灭
    else if (!isHabitable && prevLifeExists) {
        gameState.lifeExists = false;
        gameState.lastResetEraIndex = gameState.currentEraIndex;
        gameState.lastResetProgress = gameState.eraProgress;
        
        addHistoryEntry(`文明毁灭！地表温度${gameState.surfaceTemperature.toFixed(1)}°C，${ERAS[gameState.currentEraIndex].name}发展度${gameState.eraProgress.toFixed(1)}%`);
    }
}

// 更新文明发展
function updateCivilization(deltaTime) {
    if (!gameState.lifeExists || gameState.currentEraIndex >= ERAS.length) return;
    
    // 计算发展进度
    const currentEra = ERAS[gameState.currentEraIndex];
    const progressRate = deltaTime / currentEra.developmentTime * 100;
    
    gameState.eraProgress += progressRate;
    
    // 检查是否进入新时代
    if (gameState.eraProgress >= 100) {
        gameState.eraProgress = 0;
        gameState.currentEraIndex++;
        
        if (gameState.currentEraIndex < ERAS.length) {
            addHistoryEntry(`文明进入${ERAS[gameState.currentEraIndex].name}！科技发展加速！`);
        } else {
            // 达到星际时代，游戏胜利
            gameState.isRunning = false;
            addHistoryEntry('🎉 文明成功发展到星际时代！逃离三体星系！');
            showSuccessMessage();
        }
    }
}

// 显示成功消息
function showSuccessMessage() {
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('successMessage').style.display = 'block';
}

// 模拟三体运动
let lastFrameTime = 0;
function simulate() {
    // 渲染当前状态
    render();
    
    if (!gameState.isRunning) {
        // 暂停状态下仍然保持动画循环，但不更新物理
        gameState.animationId = requestAnimationFrame(simulate);
        return;
    }
    
    // 计算时间增量
    const currentFrameTime = performance.now();
    const deltaRealTime = Math.min(currentFrameTime - lastFrameTime, 16); // 限制为最大约60fps
    lastFrameTime = currentFrameTime;
    
    // 使用Matter.js更新物理
    Matter.Engine.update(gameState.engine, deltaRealTime * gameState.timeScale);
    
    // 更新时间
    gameState.currentTime += deltaRealTime / 1000 * gameState.timeScale * 1000; // 转换为年
    gameState.realTimeElapsed += deltaRealTime;
    
    // 每10帧更新一次UI，避免过多的DOM操作
    if (Math.floor(gameState.realTimeElapsed / 16) % 10 === 0) {
        // 更新温度
        calculateTemperature();
        
        // 检查生命状态
        checkLifeStatus();
        
        // 更新文明发展
        updateCivilization(deltaRealTime / 1000 * gameState.timeScale * 1000); // 转换为年
        
        // 更新UI
        updateUI();
    }
    
    // 继续动画循环
    gameState.animationId = requestAnimationFrame(simulate);
}

// 更新UI
function updateUI() {
    // 更新模拟时间
    document.getElementById('simulationTime').textContent = formatTime(gameState.currentTime);
    
    // 更新地表温度
    document.getElementById('surfaceTemp').textContent = gameState.surfaceTemperature.toFixed(1) + ' °C';
    
    // 更新生命状态
    document.getElementById('lifeStatus').textContent = gameState.lifeExists ? '存在' : '不存在';
    document.getElementById('lifeStatus').style.color = gameState.lifeExists ? '#00ff00' : '#ff0000';
    
    // 更新科技等级
    if (gameState.currentEraIndex >= 0 && gameState.currentEraIndex < ERAS.length) {
        document.getElementById('techLevel').textContent = ERAS[gameState.currentEraIndex].name;
        document.getElementById('currentEra').textContent = ERAS[gameState.currentEraIndex].name;
        
        // 更新进度条
        document.getElementById('progressFill').style.width = `${gameState.eraProgress}%`;
        document.getElementById('progressText').textContent = gameState.eraProgress.toFixed(1) + '%';
        
        // 计算发展时间
        let developmentYears = 0;
        // 计算已完成时代的总时间
        for (let i = 0; i < gameState.currentEraIndex; i++) {
            developmentYears += ERAS[i].developmentTime;
        }
        // 加上当前时代已发展的时间
        developmentYears += ERAS[gameState.currentEraIndex].developmentTime * (gameState.eraProgress / 100);
        document.getElementById('developmentTime').textContent = formatTime(developmentYears);
    } else {
        document.getElementById('techLevel').textContent = '--';
        document.getElementById('currentEra').textContent = '--';
        document.getElementById('progressFill').style.width = '0%';
        document.getElementById('progressText').textContent = '0%';
        document.getElementById('developmentTime').textContent = '0 年';
    }
    
    // 更新总科技进度
    const totalProgress = gameState.currentEraIndex >= 0 ? 
        (gameState.currentEraIndex * 100 + gameState.eraProgress) / (ERAS.length * 100) * 100 : 0;
    document.getElementById('totalProgressFill').style.width = `${totalProgress}%`;
    document.getElementById('totalProgressText').textContent = totalProgress.toFixed(1) + '%';
    
    // 更新总进度显示
    document.getElementById('overallProgress').textContent = totalProgress.toFixed(1) + '%';
    document.getElementById('overallProgress').style.color = totalProgress > 80 ? '#ffd700' : 
                                                             totalProgress > 50 ? '#00ff00' : 
                                                             totalProgress > 20 ? '#ffff00' : '#ffffff';
}

// 格式化时间显示
function formatTime(years) {
    if (years < 1000) {
        return years.toFixed(0) + ' 年';
    } else if (years < 1000000) {
        return (years / 1000).toFixed(1) + ' 千年';
    } else {
        return (years / 1000000).toFixed(1) + ' 百万年';
    }
}

// 渲染函数 - 只显示四个主星体（三体+一颗行星）
function render() {
    // 清空画布
    gameState.ctx.clearRect(0, 0, gameState.canvas.width, gameState.canvas.height);
    
    // 绘制深色背景（不再绘制背景星体）
    gameState.ctx.fillStyle = '#00001a';
    gameState.ctx.fillRect(0, 0, gameState.canvas.width, gameState.canvas.height);
    
    // 绘制恒星 - 增强视觉效果和位置稳定性
    gameState.stars.forEach(star => {
        const body = gameState.bodies[star.id];
        if (!body || !body.position) {
            console.warn(`Star ${star.id} has no valid body or position`);
            return;
        }
        
        // 严格检查和限制星体位置，确保不会飞离屏幕
        let x = body.position.x;
        let y = body.position.y;
        
        // 确保星体始终在可视范围内
        const margin = star.radius * 2;
        if (x < margin) x = margin;
        if (x > gameState.canvas.width - margin) x = gameState.canvas.width - margin;
        if (y < margin) y = margin;
        if (y > gameState.canvas.height - margin) y = gameState.canvas.height - margin;
        
        // 如果位置被修正，更新物理体位置
        if (x !== body.position.x || y !== body.position.y) {
            Matter.Body.setPosition(body, { x: x, y: y });
        }
        
        // 增强恒星光晕效果，使其更醒目
        const gradient = gameState.ctx.createRadialGradient(
            x, y, 0,
            x, y, star.radius * 2
        );
        gradient.addColorStop(0, star.color);
        gradient.addColorStop(0.4, star.color + 'CC');
        gradient.addColorStop(0.7, star.color + '77');
        gradient.addColorStop(1, star.color + '22');
        
        // 绘制光晕
        gameState.ctx.beginPath();
        gameState.ctx.arc(x, y, star.radius * 2, 0, Math.PI * 2);
        gameState.ctx.fillStyle = gradient;
        gameState.ctx.fill();
        
        // 绘制恒星核心
        gameState.ctx.beginPath();
        gameState.ctx.arc(x, y, star.radius, 0, Math.PI * 2);
        gameState.ctx.fillStyle = star.color;
        gameState.ctx.fill();
        
        // 为恒星添加高光效果，增强三体视觉效果
        gameState.ctx.beginPath();
        gameState.ctx.arc(x - star.radius * 0.3, y - star.radius * 0.3, star.radius * 0.2, 0, Math.PI * 2);
        gameState.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        gameState.ctx.fill();
    });
    
    // 绘制行星 - 增强视觉效果
    if (gameState.planet) {
        const body = gameState.bodies.planet;
        if (!body || !body.position) {
            console.warn('Planet has no valid body or position');
            return;
        }
        
        // 严格检查和限制行星位置
        let x = body.position.x;
        let y = body.position.y;
        
        // 确保行星始终在可视范围内
        const margin = gameState.planet.radius * 2;
        if (x < margin) x = margin;
        if (x > gameState.canvas.width - margin) x = gameState.canvas.width - margin;
        if (y < margin) y = margin;
        if (y > gameState.canvas.height - margin) y = gameState.canvas.height - margin;
        
        // 如果位置被修正，更新物理体位置
        if (x !== body.position.x || y !== body.position.y) {
            Matter.Body.setPosition(body, { x: x, y: y });
        }
        
        // 增强行星大气层效果
        const gradient = gameState.ctx.createRadialGradient(
            x, y, 0,
            x, y, gameState.planet.radius * 1.5
        );
        gradient.addColorStop(0, gameState.planet.color);
        gradient.addColorStop(0.5, gameState.planet.color + 'AA');
        gradient.addColorStop(0.8, gameState.planet.color + '66');
        gradient.addColorStop(1, gameState.planet.color + '22');
        
        // 绘制大气层
        gameState.ctx.beginPath();
        gameState.ctx.arc(x, y, gameState.planet.radius * 1.5, 0, Math.PI * 2);
        gameState.ctx.fillStyle = gradient;
        gameState.ctx.fill();
        
        // 绘制行星主体
        gameState.ctx.beginPath();
        gameState.ctx.arc(x, y, gameState.planet.radius, 0, Math.PI * 2);
        gameState.ctx.fillStyle = gameState.planet.color;
        gameState.ctx.fill();
        
        // 为行星添加表面细节
        gameState.ctx.beginPath();
        gameState.ctx.arc(x - gameState.planet.radius * 0.2, y - gameState.planet.radius * 0.2, gameState.planet.radius * 0.15, 0, Math.PI * 2);
        gameState.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        gameState.ctx.fill();
        
        // 添加一些表面特征线
        gameState.ctx.strokeStyle = gameState.planet.color + '88';
        gameState.ctx.lineWidth = 1;
        gameState.ctx.beginPath();
        gameState.ctx.ellipse(x, y, gameState.planet.radius * 0.8, gameState.planet.radius * 0.3, 0, 0, Math.PI * 2);
        gameState.ctx.stroke();
    }
}

// 绘制星空背景
function drawStarsBackground() {
    const ctx = gameState.ctx;
    const width = gameState.canvas.width;
    const height = gameState.canvas.height;
    
    // 随机生成一些星星
    const starCount = Math.floor(width * height * 0.0005);
    
    for (let i = 0; i < starCount; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const size = Math.random() * 2;
        const brightness = Math.random();
        
        ctx.fillStyle = `rgba(255, 255, 255, ${brightness * 0.8 + 0.2})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 添加历史记录
function addHistoryEntry(message) {
    gameState.history.unshift({
        time: new Date().toLocaleTimeString(),
        message: message
    });
    
    // 限制历史记录数量
    if (gameState.history.length > 50) {
        gameState.history.pop();
    }
    
    // 更新历史记录UI
    const historyElement = document.getElementById('gameHistory');
    historyElement.innerHTML = '';
    
    gameState.history.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'history-entry';
        div.textContent = `[${entry.time}] ${entry.message}`;
        historyElement.appendChild(div);
    });
}

// 更新文明发展
function updateCivilization(deltaTime) {
    if (!gameState.lifeExists || gameState.currentEraIndex >= ERAS.length) return;
    
    // 计算发展进度
    const currentEra = ERAS[gameState.currentEraIndex];
    const progressRate = deltaTime / currentEra.developmentTime * 100;
    
    gameState.eraProgress += progressRate;
    
    // 检查是否进入新时代
    if (gameState.eraProgress >= 100) {
        gameState.eraProgress = 0;
        gameState.currentEraIndex++;
        
        if (gameState.currentEraIndex < ERAS.length) {
            const eraName = ERAS[gameState.currentEraIndex].name;
            addHistoryEntry(`文明进入${eraName}！科技发展加速！`);
        } else {
            // 达到星际时代，游戏胜利
            gameState.isRunning = false;
            addHistoryEntry('🎉 文明成功发展到星际时代！逃离三体星系！');
            showSuccessMessage();
        }
    }
}

// 页面加载完成后初始化游戏
window.addEventListener('DOMContentLoaded', initGame);