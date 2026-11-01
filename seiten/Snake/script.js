        const canvas = document.getElementById("gameCanvas");
        const ctx = canvas.getContext("2d", { alpha: false });
        const minimapCanvas = document.getElementById("minimap");
        const miniCtx = minimapCanvas.getContext("2d");

        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        const WORLD_RADIUS = 2200;
        const FOOD_COUNT = 200;
        const TOTAL_BOTS = 11; 
        const SPAWN_PROTECTION_TIME = 5000;

        let mouse = { x: canvas.width / 2, y: canvas.height / 2, isBoosting: false };
        let camera = { x: 0, y: 0 };
        let frameCount = 0;

        let particles = [];
        let floatTexts = [];
        let powerUps = [];

        const SNAKE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        function getRandomColor() { return SNAKE_COLORS[Math.floor(Math.random() * SNAKE_COLORS.length)]; }
        function distance(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

        // Sofort sterben, wenn der Tab gewechselt / verlassen wird
        document.addEventListener("visibilitychange", () => {
            if (document.hidden && player && !player.isDead) {
                player.die("Tab verlassen!");
            }
        });

        class Particle {
            constructor(x, y, color, speed = 3.5) {
                this.x = x; this.y = y; this.color = color;
                this.radius = Math.random() * 2.5 + 1;
                const angle = Math.random() * Math.PI * 2;
                this.vx = Math.cos(angle) * (Math.random() * speed);
                this.vy = Math.sin(angle) * (Math.random() * speed);
                this.alpha = 1; this.decay = 0.05;
            }
            update() { this.x += this.vx; this.y += this.vy; this.alpha -= this.decay; }
            draw() {
                if (this.alpha <= 0) return;
                ctx.save(); ctx.globalAlpha = this.alpha;
                ctx.beginPath(); ctx.arc(this.x - camera.x, this.y - camera.y, this.radius, 0, Math.PI * 2);
                ctx.fillStyle = this.color; ctx.fill(); ctx.restore();
            }
        }

        class FloatingText {
            constructor(x, y, text, color) {
                this.x = x; this.y = y; this.text = text; this.color = color; this.alpha = 1; this.scale = 0.6;
            }
            update() { this.y -= 0.8; this.alpha -= 0.05; if (this.scale < 1.0) this.scale += 0.1; }
            draw() {
                if (this.alpha <= 0) return;
                ctx.save(); ctx.globalAlpha = this.alpha;
                ctx.font = `900 ${12 * this.scale}px Inter, sans-serif`;
                ctx.fillStyle = this.color; ctx.textAlign = "center";
                ctx.fillText(this.text, this.x - camera.x, this.y - camera.y);
                ctx.restore();
            }
        }

        class PowerUp {
            constructor(type) {
                this.type = type || (Math.random() < 0.5 ? 'speed' : 'magnet');
                const r = Math.sqrt(Math.random()) * (WORLD_RADIUS - 150);
                const theta = Math.random() * Math.PI * 2;
                this.x = Math.cos(theta) * r; this.y = Math.sin(theta) * r;
                this.radius = 16; this.pulse = Math.random() * Math.PI;
            }
            draw() {
                if (Math.abs(this.x - camera.x) > canvas.width || Math.abs(this.y - camera.y) > canvas.height) return;
                this.pulse += 0.12;
                const r = this.radius + Math.sin(this.pulse) * 2.5;
                ctx.save();
                ctx.beginPath(); ctx.arc(this.x - camera.x, this.y - camera.y, r, 0, Math.PI * 2);
                ctx.fillStyle = this.type === 'speed' ? '#059669' : '#2563eb';
                ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
                ctx.fillStyle = '#ffffff'; ctx.font = 'bold 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(this.type === 'speed' ? '⚡' : '🧲', this.x - camera.x, this.y - camera.y);
                ctx.restore();
            }
        }

        class Food {
            constructor(x, y, value = 1, isEgg = false, isShimmering = false, customColor = null) {
                if (x === undefined || y === undefined) {
                    const r = Math.sqrt(Math.random()) * (WORLD_RADIUS - 100);
                    const theta = Math.random() * Math.PI * 2;
                    this.x = Math.cos(theta) * r; this.y = Math.sin(theta) * r;
                } else {
                    this.x = x; this.y = y;
                }
                this.isEgg = isEgg;
                this.isShimmering = isShimmering;
                this.value = Math.round(isEgg ? 10 : value);
                this.radius = isEgg ? 14 : Math.min(8 + this.value * 1.2, 16);
                this.color = customColor ? customColor : (isEgg ? '#f59e0b' : (isShimmering ? '#a855f7' : getRandomColor()));
                this.pulse = Math.random() * Math.PI;
            }
            draw() {
                if (Math.abs(this.x - camera.x) > canvas.width || Math.abs(this.y - camera.y) > canvas.height) return;
                ctx.save();
                if (this.isEgg) {
                    this.pulse += 0.1;
                    const r = this.radius + Math.sin(this.pulse) * 2.5;
                    ctx.beginPath();
                    ctx.ellipse(this.x - camera.x, this.y - camera.y, r * 0.85, r, 0, 0, Math.PI * 2);
                    ctx.fillStyle = this.color; ctx.fill(); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.stroke();
                } else {
                    ctx.beginPath(); ctx.arc(this.x - camera.x, this.y - camera.y, this.radius, 0, Math.PI * 2);
                    ctx.fillStyle = this.color; ctx.fill();
                }
                ctx.restore();
            }
        }

        class Snake {
            constructor(x, y, name, color, isBot = false, aiType = 'normal') {
                this.x = x; this.y = y; this.name = name; this.color = color;
                this.isBot = isBot; this.aiType = aiType;
                this.angle = Math.random() * Math.PI * 2;
                this.targetAngle = this.angle;
                this.turnSpeed = isBot ? (aiType === 'smart' ? 0.14 : aiType === 'dumb' ? 0.05 : 0.09) : 0.10;
                this.baseSpeed = 3.2;
                this.boostSpeed = isBot ? 4.5 : 5.8; 
                this.speed = this.baseSpeed;
                this.isBoosting = false;
                this.boostTimer = 0;
                this.speedBoostTimer = 0;
                this.magnetTimer = 0;
                this.length = Math.round(aiType === 'smart' ? 30 : 16);
                this.radius = 12;
                this.segments = [];
                this.score = 0;
                this.spawnTime = Date.now();
                this.lastBotGrowth = Date.now();
                this.isProtected = true;
                this.isDead = false;

                for (let i = 0; i < this.length; i++) {
                    this.segments.push({ x: this.x, y: this.y });
                }
            }

            update() {
                if (this.isDead) return;
                if (this.isProtected && Date.now() - this.spawnTime > SPAWN_PROTECTION_TIME) {
                    this.isProtected = false;
                }
                if (this.speedBoostTimer > 0) this.speedBoostTimer--;
                if (this.magnetTimer > 0) this.magnetTimer--;

                if (this.isBot && Date.now() - this.lastBotGrowth > 5000) {
                    this.length += 2;
                    this.lastBotGrowth = Date.now();
                }

                let currentSpeed = this.baseSpeed;
                let activeBoostSpeed = this.boostSpeed * (this.speedBoostTimer > 0 ? 1.1 : 1.0);

                if (this.isBoosting && this.length > 10) {
                    currentSpeed = activeBoostSpeed;
                    this.length -= 0.002; 
                    this.score = Math.max(0, this.score - 0.1);
                    if (frameCount % 150 === 0) {
                        const tail = this.segments[this.segments.length - 1];
                        foods.push(new Food(tail.x, tail.y, 1, false, false));
                    }
                }

                let diff = this.targetAngle - this.angle;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                this.angle += diff * this.turnSpeed;

                const steps = Math.ceil(currentSpeed / 2);
                const stepSpeed = currentSpeed / steps;

                for (let step = 0; step < steps; step++) {
                    if (this.isDead) break;
                    this.x += Math.cos(this.angle) * stepSpeed;
                    this.y += Math.sin(this.angle) * stepSpeed;

                    if (Math.hypot(this.x, this.y) >= WORLD_RADIUS - 8) {
                        this.die("Grenze berührt!"); break;
                    }

                    if (!this.isProtected) {
                        for (let other of snakes) {
                            if (other === this || other.isProtected) continue;
                            for (let i = 0; i < other.segments.length; i += 3) {
                                const seg = other.segments[i];
                                if (distance(this.x, this.y, seg.x, seg.y) < this.radius + other.radius * 0.75) {
                                    this.die("Von " + other.name + " besiegt!"); break;
                                }
                            }
                            if (this.isDead) break;
                        }
                    }
                }

                if (this.isDead) return;
                this.segments.unshift({ x: this.x, y: this.y });
                while (this.segments.length > Math.round(this.length)) {
                    this.segments.pop();
                }
                this.radius = 12 + Math.min(25, Math.floor(this.length / 40));

                if (this.magnetTimer > 0) {
                    const pullRadius = 240;
                    for (let f of foods) {
                        if (distance(this.x, this.y, f.x, f.y) < pullRadius) {
                            const angleToSnake = Math.atan2(this.y - f.y, this.x - f.x);
                            f.x += Math.cos(angleToSnake) * 7; f.y += Math.sin(angleToSnake) * 7;
                        }
                    }
                }

                if (this.isBot && frameCount % 6 === 0) {
                    this.updateBotAI();
                }
            }

            updateBotAI() {
                const distFromCenter = Math.hypot(this.x, this.y);
                if (distFromCenter > WORLD_RADIUS - 300) {
                    this.targetAngle = Math.atan2(-this.y, -this.x);
                    this.isBoosting = false; return;
                }
                if (this.aiType === 'dumb') {
                    if (Math.random() < 0.08) this.targetAngle += (Math.random() - 0.5) * 2.0;
                    this.isBoosting = false; return;
                }
                if (this.boostTimer > 0) {
                    this.boostTimer--; this.isBoosting = true;
                } else {
                    if (Math.random() < 0.01) {
                        this.boostTimer = Math.floor(Math.random() * 80) + 40;
                    }
                    this.isBoosting = false;
                }

                let dangerDetected = false;
                const aheadX = this.x + Math.cos(this.angle) * 120;
                const aheadY = this.y + Math.sin(this.angle) * 120;

                for (let other of snakes) {
                    if (other === this || other.isDead || other.isProtected) continue;
                    if (distance(aheadX, aheadY, other.x, other.y) < 90) {
                        this.targetAngle = Math.atan2(this.y - other.y, this.x - other.x);
                        dangerDetected = true; break;
                    }
                }

                if (!dangerDetected) {
                    let closestFood = null; let minDist = 250;
                    for (let i = 0; i < foods.length; i += 8) {
                        const f = foods[i];
                        const d = distance(this.x, this.y, f.x, f.y);
                        if (d < minDist) { minDist = d; closestFood = f; }
                    }
                    if (closestFood) {
                        this.targetAngle = Math.atan2(closestFood.y - this.y, closestFood.x - this.x);
                    } else if (Math.random() < 0.06) {
                        this.targetAngle += (Math.random() - 0.5) * 1.2;
                        this.isBoosting = false;
                    }
                }
            }

            draw() {
                if (this.isDead) return;
                if (Math.abs(this.x - camera.x) > canvas.width || Math.abs(this.y - camera.y) > canvas.height) return;

                if (this.isProtected) {
                    ctx.save();
                    ctx.beginPath(); ctx.arc(this.x - camera.x, this.y - camera.y, this.radius + 12, 0, Math.PI * 2);
                    ctx.fillStyle = "rgba(251, 191, 36, 0.2)"; ctx.strokeStyle = "rgba(251, 191, 36, 0.7)"; ctx.lineWidth = 2;
                    ctx.fill(); ctx.stroke(); ctx.restore();
                }

                if (this.isBoosting || this.speedBoostTimer > 0) {
                    ctx.save();
                    ctx.fillStyle = this.speedBoostTimer > 0 ? "rgba(16, 185, 129, 0.35)" : "rgba(255, 255, 255, 0.35)";
                    for (let i = this.segments.length - 1; i >= 0; i -= 2) {
                        const seg = this.segments[i];
                        ctx.beginPath(); ctx.arc(seg.x - camera.x, seg.y - camera.y, this.radius + 5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();
                }

                for (let i = this.segments.length - 1; i >= 0; i--) {
                    const seg = this.segments[i];
                    ctx.beginPath(); ctx.arc(seg.x - camera.x, seg.y - camera.y, this.radius, 0, Math.PI * 2);
                    ctx.fillStyle = this.color; ctx.fill();
                }

                const eyeOffset = this.radius * 0.5;
                const eyeRadius = this.radius * 0.3;
                const lx = this.x + Math.cos(this.angle - 0.5) * eyeOffset;
                const ly = this.y + Math.sin(this.angle - 0.5) * eyeOffset;
                const rx = this.x + Math.cos(this.angle + 0.5) * eyeOffset;
                const ry = this.y + Math.sin(this.angle + 0.5) * eyeOffset;

                ctx.beginPath();
                ctx.arc(lx - camera.x, ly - camera.y, eyeRadius, 0, Math.PI * 2);
                ctx.arc(rx - camera.x, ry - camera.y, eyeRadius, 0, Math.PI * 2);
                ctx.fillStyle = "#ffffff"; ctx.fill();
                ctx.beginPath();
                ctx.arc(lx - camera.x, ly - camera.y, eyeRadius * 0.5, 0, Math.PI * 2);
                ctx.arc(rx - camera.x, ry - camera.y, eyeRadius * 0.5, 0, Math.PI * 2);
                ctx.fillStyle = "#000000"; ctx.fill();
            }

            die(reason = "Besiegt!") {
                if (this.isDead) return;
                this.isDead = true;
                for (let i = 0; i < this.segments.length; i += 3) {
                    const fx = this.segments[i].x + (Math.random() - 0.5) * 20;
                    const fy = this.segments[i].y + (Math.random() - 0.5) * 20;
                    if (Math.hypot(fx, fy) < WORLD_RADIUS - 15) {
                        foods.push(new Food(fx, fy, 2, false, true, getRandomColor()));
                    }
                }
                if (this === player) triggerGameOver(reason);
            }
        }

        let player;
        let snakes = [];
        let foods = [];
        const BOT_NAMES = ["Bot1", "Bot2", "Bot3", "Bot4", "Bot5", "Bot6", "Bot7", "Bot8", "Bot9", "Bot10", "Bot11", "Bot12", "Bot13", "Bot14", "Bot15"];

        function spawnBot() {
            const r = Math.sqrt(Math.random()) * (WORLD_RADIUS - 150);
            const theta = Math.random() * Math.PI * 2;
            const bx = Math.cos(theta) * r; const by = Math.sin(theta) * r;
            const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
            const color = getRandomColor();
            const rand = Math.random();
            const aiType = rand < 0.45 ? 'smart' : rand < 0.75 ? 'dumb' : 'normal';
            snakes.push(new Snake(bx, by, name, color, true, aiType));
        }

        function init() {
            foods = []; snakes = []; particles = []; floatTexts = []; powerUps = []; frameCount = 0;
            document.getElementById("game-over").classList.add("hidden");

            player = new Snake(0, 0, "Du", "#10b981", false, 'normal');
            snakes.push(player);

            for (let i = 0; i < FOOD_COUNT; i++) {
                foods.push(new Food(undefined, undefined, 1, Math.random() < 0.04, false));
            }
            for (let i = 0; i < 3; i++) {
                powerUps.push(new PowerUp(Math.random() < 0.5 ? 'speed' : 'magnet'));
            }

            for (let i = 0; i < TOTAL_BOTS; i++) {
                spawnBot();
            }
        }

        function explodeEgg(eggX, eggY) {
            const numOrbs = 18;
            for (let i = 0; i < numOrbs; i++) {
                const angle = (i / numOrbs) * Math.PI * 2;
                const dist = Math.random() * 250 + 40;
                const fx = eggX + Math.cos(angle) * dist;
                const fy = eggY + Math.sin(angle) * dist;
                if (Math.hypot(fx, fy) < WORLD_RADIUS - 20) {
                    foods.push(new Food(fx, fy, 2, false, true, getRandomColor()));
                }
            }
        }

        function drawWorldBoundary() {
            ctx.save();
            ctx.beginPath(); ctx.arc(0 - camera.x, 0 - camera.y, WORLD_RADIUS, 0, Math.PI * 2);
            ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 8; ctx.stroke();
            ctx.restore();
        }

        function gameLoop() {
            frameCount++;

            if (frameCount % 450 === 0) {
                const dropX = player.x + (Math.random() - 0.5) * 800;
                const dropY = player.y + (Math.random() - 0.5) * 800;
                for (let f = 0; f < 10; f++) {
                    const fx = dropX + (Math.random() - 0.5) * 150;
                    const fy = dropY + (Math.random() - 0.5) * 150;
                    if (Math.hypot(fx, fy) < WORLD_RADIUS - 20) {
                        foods.push(new Food(fx, fy, 2, false, true, getRandomColor()));
                    }
                }
            }

            if (!player.isDead) {
                camera.x += (player.x - canvas.width / 2 - camera.x) * 0.12;
                camera.y += (player.y - canvas.height / 2 - camera.y) * 0.12;

                const dx = mouse.x - canvas.width / 2;
                const dy = mouse.y - canvas.height / 2;
                player.targetAngle = Math.atan2(dy, dx);
                player.isBoosting = mouse.isBoosting;

                const shieldEl = document.getElementById("protection-status");
                if (player.isProtected) {
                    const remaining = Math.max(0, (SPAWN_PROTECTION_TIME - (Date.now() - player.spawnTime)) / 1000);
                    document.getElementById("protection-timer").innerText = remaining.toFixed(1);
                    shieldEl.classList.remove("hidden");
                } else {
                    shieldEl.classList.add("hidden");
                }
            }

            ctx.fillStyle = "#0b0f19";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            drawWorldBoundary();

            foods = foods.filter(f => Math.hypot(f.x, f.y) <= WORLD_RADIUS - 15);

            for (let p of powerUps) p.draw();
            for (let f of foods) f.draw();

            for (let s = snakes.length - 1; s >= 0; s--) {
                const snake = snakes[s];
                if (snake.isDead) {
                    snakes.splice(s, 1);
                    if (snake.isBot) {
                        if (snakes.filter(sn => sn.isBot).length < TOTAL_BOTS) {
                            spawnBot();
                        }
                    }
                    continue;
                }

                snake.update();
                snake.draw();

                for (let p = powerUps.length - 1; p >= 0; p--) {
                    const pow = powerUps[p];
                    if (distance(snake.x, snake.y, pow.x, pow.y) < snake.radius + pow.radius) {
                        if (pow.type === 'speed') snake.speedBoostTimer = 300;
                        else snake.magnetTimer = 300;
                        if (snake === player) {
                            floatTexts.push(new FloatingText(pow.x, pow.y, pow.type === 'speed' ? '⚡ SPEED SEED!' : '🧲 MAGNET ACTIVE!', pow.type === 'speed' ? '#10b981' : '#3b82f6'));
                        }
                        powerUps.splice(p, 1);
                    }
                }

                for (let f = foods.length - 1; f >= 0; f--) {
                    const orb = foods[f];
                    if (distance(snake.x, snake.y, orb.x, orb.y) < snake.radius + orb.radius + 4) {
                        const points = Math.round(orb.value * 10);
                        snake.length += Math.round(orb.value);
                        snake.score += points;
                        if (orb.isEgg) explodeEgg(orb.x, orb.y);

                        if (snake === player) {
                            const count = orb.isEgg ? 12 : 2;
                            for (let pt = 0; pt < count; pt++) particles.push(new Particle(orb.x, orb.y, orb.color, orb.isEgg ? 5 : 2.5));
                            floatTexts.push(new FloatingText(orb.x, orb.y, orb.isEgg ? `EGG EXPLOSION! +${points}` : `+${points}`, orb.color));
                            document.getElementById('score-val').innerText = Math.round(player.score);
                            document.getElementById('length-val').innerText = Math.round(player.length);
                        }
                        foods.splice(f, 1);
                    }
                }
            }

            while (foods.length < FOOD_COUNT) {
                foods.push(new Food(undefined, undefined, 1, Math.random() < 0.04, false));
            }

            for (let i = particles.length - 1; i >= 0; i--) {
                particles[i].update(); particles[i].draw();
                if (particles[i].alpha <= 0) particles.splice(i, 1);
            }
            for (let i = floatTexts.length - 1; i >= 0; i--) {
                floatTexts[i].update(); floatTexts[i].draw();
                if (floatTexts[i].alpha <= 0) floatTexts.splice(i, 1);
            }

            if (frameCount % 12 === 0) {
                updateLeaderboard();
                updatePowerUpHud();
                drawMiniMap();
            }

            setTimeout(gameLoop, 1000 / 50);
        }

        function drawMiniMap() {
            miniCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
            miniCtx.fillStyle = "rgba(11, 15, 25, 0.85)";
            miniCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

            const scale = minimapCanvas.width / (WORLD_RADIUS * 2);
            const centerX = minimapCanvas.width / 2;
            const centerY = minimapCanvas.height / 2;

            miniCtx.beginPath();
            miniCtx.arc(centerX, centerY, WORLD_RADIUS * scale, 0, Math.PI * 2);
            miniCtx.strokeStyle = "rgba(239, 68, 68, 0.5)"; miniCtx.lineWidth = 1.5; miniCtx.stroke();

            for (let s of snakes) {
                if (s.isDead) continue;
                const mx = centerX + s.x * scale; const my = centerY + s.y * scale;
                miniCtx.beginPath(); 
                const miniRadius = s === player ? 5.0 : 2.0;
                miniCtx.arc(mx, my, miniRadius, 0, Math.PI * 2);
                miniCtx.fillStyle = s === player ? "#10b981" : s.color; 
                miniCtx.fill();
            }
        }

        function updateLeaderboard() {
            const sorted = [...snakes].filter(s => !s.isDead).sort((a, b) => b.length - a.length);
            const top5 = sorted.slice(0, 5);
            const lbEl = document.getElementById("leaderboard");
            let html = "";
            top5.forEach((s, idx) => {
                const isPlayer = s === player;
                html += `<li class="flex items-center justify-between ${isPlayer ? 'text-emerald-400 font-bold' : 'text-gray-300'}"><span>${idx + 1}. ${s.name}</span><span class="text-gray-400">${Math.round(s.length)}</span></li>`;
            });
            lbEl.innerHTML = html;
        }

        function updatePowerUpHud() {
            const statusEl = document.getElementById("powerup-status");
            let html = "";
            if (player.speedBoostTimer > 0) {
                const pct = (player.speedBoostTimer / 300) * 100;
                html += `<div class="flex flex-col gap-0.5"><div class="flex justify-between text-[10px] text-emerald-400"><span>⚡ SPEED SEED</span><span>${(player.speedBoostTimer/60).toFixed(1)}s</span></div><div class="w-full bg-white/10 h-1.5 rounded-full overflow-hidden"><div class="bg-emerald-400 h-full transition-all" style="width: ${pct}%"></div></div></div>`;
            }
            if (player.magnetTimer > 0) {
                const pct = (player.magnetTimer / 300) * 100;
                html += `<div class="flex flex-col gap-0.5"><div class="flex justify-between text-[10px] text-blue-400"><span>🧲 MAGNET</span><span>${(player.magnetTimer/60).toFixed(1)}s</span></div><div class="w-full bg-white/10 h-1.5 rounded-full overflow-hidden"><div class="bg-blue-400 h-full transition-all" style="width: ${pct}%"></div></div></div>`;
            }
            if (html !== "") { statusEl.innerHTML = html; statusEl.classList.remove("hidden"); }
            else { statusEl.classList.add("hidden"); }
        }

        function triggerGameOver(reason) {
            document.getElementById("final-score").innerText = Math.round(player.score);
            document.getElementById("final-length").innerText = Math.round(player.length);
            document.getElementById("game-over-text").innerText = reason;
            document.getElementById("game-over").classList.remove("hidden");
        }

        window.restartGame = function() {
            init();
        };

        // Desktop Events
        window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
        window.addEventListener('mousedown', () => { mouse.isBoosting = true; });
        window.addEventListener('mouseup', () => { mouse.isBoosting = false; });
        window.addEventListener('keydown', (e) => { if (e.code === 'Space') mouse.isBoosting = true; });
        window.addEventListener('keyup', (e) => { if (e.code === 'Space') mouse.isBoosting = false; });

        // Touch & Device Detection
        let isTouchDevice = false;
        const boostBtn = document.getElementById("touch-boost-btn");

        window.addEventListener('touchstart', (e) => {
            if (!isTouchDevice) {
                isTouchDevice = true;
                boostBtn.classList.remove("hidden");
            }
            if (e.touches.length > 0) {
                mouse.x = e.touches[0].clientX;
                mouse.y = e.touches[0].clientY;
            }
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (e.touches.length > 0) {
                mouse.x = e.touches[0].clientX;
                mouse.y = e.touches[0].clientY;
            }
        }, { passive: true });

        // Boost Button Touch Events
        boostBtn.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            mouse.isBoosting = true;
            boostBtn.style.transform = 'scale(0.9)';
        });

        boostBtn.addEventListener('touchend', (e) => {
            e.stopPropagation();
            mouse.isBoosting = false;
            boostBtn.style.transform = 'scale(1)';
        });

        window.onload = function () {
            init();
            gameLoop();
        };
    
