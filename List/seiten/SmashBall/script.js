        // --- SOUND ENGINE ---
        class SoundEngine {
            constructor() { this.ctx = null; }
            init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
            playTone(freq, type, duration, vol = 0.1) {
                try {
                    this.init();
                    if (!this.ctx) return;
                    const osc = this.ctx.createOscillator();
                    const gain = this.ctx.createGain();
                    osc.type = type;
                    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
                    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
                    osc.connect(gain);
                    gain.connect(this.ctx.destination);
                    osc.start();
                    osc.stop(this.ctx.currentTime + duration);
                } catch(e) {}
            }
            hit() { this.playTone(300, 'sine', 0.1, 0.15); }
            jump() { this.playTone(400, 'triangle', 0.12, 0.1); }
            tick() { this.playTone(600, 'sine', 0.05, 0.1); }
            selected() {
                this.playTone(523, 'triangle', 0.08, 0.2);
                setTimeout(() => this.playTone(659, 'triangle', 0.08, 0.2), 80);
                setTimeout(() => this.playTone(783, 'triangle', 0.15, 0.25), 160);
            }
            smash() { 
                this.playTone(180, 'sawtooth', 0.2, 0.25); 
                setTimeout(() => this.playTone(90, 'square', 0.15, 0.2), 40);
            }
            lob() { this.playTone(550, 'sine', 0.15, 0.12); }
            bounce() { this.playTone(140, 'sine', 0.08, 0.15); }
            powerup() {
                this.playTone(523, 'triangle', 0.08, 0.15);
                setTimeout(() => this.playTone(659, 'triangle', 0.08, 0.15), 70);
                setTimeout(() => this.playTone(783, 'triangle', 0.12, 0.2), 140);
            }
            explosion() {
                try {
                    this.init();
                    if (!this.ctx) return;
                    const bufferSize = this.ctx.sampleRate * 0.5;
                    const buffer = this.ctx.bufferSize ? this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate) : null;
                    if (!buffer) return;
                    const data = buffer.getChannelData(0);
                    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                    const noise = this.ctx.createBufferSource();
                    noise.buffer = buffer;
                    const filter = this.ctx.createBiquadFilter();
                    filter.type = 'lowpass';
                    filter.frequency.setValueAtTime(600, this.ctx.currentTime);
                    filter.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + 0.5);

                    const gain = this.ctx.createGain();
                    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);

                    noise.connect(filter);
                    filter.connect(gain);
                    gain.connect(this.ctx.destination);
                    noise.start();
                } catch(e){}
            }
        }
        const audio = new SoundEngine();

        // --- CANVAS SETUP ---
        // MAP CONFIGURATIONS
        const MAPS = [
            {
                name: "Beach Paradise",
                bgGradient: ['#38bdf8', '#0284c7', '#0369a1'],
                groundColor: '#fde047',
                sunColor: '#fef08a',
                mountainsColor: '#0c4a6e'
            },
            {
                name: "Cyber City",
                bgGradient: ['#312e81', '#1e1b4b', '#0f172a'],
                groundColor: '#d946ef',
                sunColor: '#06b6d4',
                mountainsColor: '#1e1035'
            },
            {
                name: "Sunset Hills",
                bgGradient: ['#f97316', '#ea580c', '#431407'],
                groundColor: '#78350f',
                sunColor: '#fef08a',
                mountainsColor: '#292524'
            },
            {
                name: "Dark Void",
                bgGradient: ['#0f172a', '#020617', '#000000'],
                groundColor: '#334155',
                sunColor: 'rgba(255, 255, 255, 0.1)',
                mountainsColor: '#090d16'
            }
        ];
        let currentMapIndex = 0;

        // Stumble Guys Style Random Map Roulette Animation
        function startRandomMapRoulette() {
            document.getElementById('menu-overlay').classList.add('hidden');
            const rouletteOverlay = document.getElementById('map-roulette-overlay');
            const card = document.getElementById('roulette-card');
            const mapNameEl = document.getElementById('roulette-map-name');
            
            rouletteOverlay.classList.remove('hidden');

            let spins = 0;
            let maxSpins = 20;
            let delay = 60;
            let currentIndex = 0;

            function spinStep() {
                currentIndex = (currentIndex + 1) % MAPS.length;
                const m = MAPS[currentIndex];
                
                mapNameEl.textContent = m.name;
                card.style.background = `linear-gradient(135deg, ${m.bgGradient[0]}, ${m.bgGradient[1]})`;
                card.style.borderColor = m.groundColor;
                
                // Micro Pulse Effect
                card.style.transform = 'scale(1.06)';
                setTimeout(() => { card.style.transform = 'scale(1.0)'; }, 40);

                audio.tick();

                spins++;
                if (spins < maxSpins) {
                    delay += spins * 6; // Verlangsamt sich am Ende
                    setTimeout(spinStep, delay);
                } else {
                    // Final Map Selected
                    currentMapIndex = currentIndex;
                    card.style.transform = 'scale(1.15)';
                    card.style.borderColor = '#ffffff';
                    audio.selected();

                    setTimeout(() => {
                        rouletteOverlay.classList.add('hidden');
                        resetAndStartGame();
                    }, 1000);
                }
            }

            spinStep();
        }

        function selectAndStartMap(index) {
            selectMap(index);
            resetAndStartGame();
        }

        // --- PARTICLE & EFFECTS SYSTEM ---
        let particles = [];
        let screenShake = 0;
        let transitionProgress = -1;

        // --- POWER-UP SYSTEM ---
        const POWERUP_TYPES = [
            { id: 'SPEED', label: 'SCHNELLER RUN', color: '#f59e0b', icon: '⚡' },
            { id: 'SHIELD', label: 'SCHILD BOUNCE', color: '#06b6d4', icon: '🛡️' },
            { id: 'BIGBALL', label: 'RIESENBALL', color: '#ec4899', icon: '⚽' }
        ];

        let playerPowerUp = null; // { type, duration }
        let opponentPowerUp = null;

        function updatePowerUps() {
            if (playerPowerUp) {
                playerPowerUp.duration--;
                if (playerPowerUp.duration <= 0) {
                    playerPowerUp = null;
                    updatePowerUpUI();
                }
            }
            if (opponentPowerUp) {
                opponentPowerUp.duration--;
                if (opponentPowerUp.duration <= 0) opponentPowerUp = null;
            }
        }

        function updatePowerUpUI() {
            const statusEl = document.getElementById('powerup-status');
            if (playerPowerUp) {
                statusEl.textContent = `POWER-UP: ${playerPowerUp.type.label}!`;
            } else {
                statusEl.textContent = '';
            }
        }

        function grantRallyPowerUp(sideKey) {
            const randomType = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
            audio.powerup();
            addBounceShockwave(ball.x, ball.y);

            if (sideKey === 'player') {
                playerPowerUp = { type: randomType, duration: 450 };
                updatePowerUpUI();
            } else {
                opponentPowerUp = { type: randomType, duration: 450 };
            }
        }

        function startRoundTransition() {
            transitionProgress = 0;
        }

        function updateParticles() {
            if (screenShake > 0) screenShake *= 0.85;
            
            // Wisch-Animation Update
            if (transitionProgress >= 0) {
                transitionProgress += 0.035;
                if (transitionProgress > 1.4) {
                    transitionProgress = -1;
                }
            }

            for (let i = particles.length - 1; i >= 0; i--) {
                let p = particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.alpha -= p.decay;
                if (p.alpha <= 0) particles.splice(i, 1);
            }
        }

        function addBounceShockwave(x, y) {
            screenShake = Math.max(screenShake, 3);
            for (let i = 0; i < 12; i++) {
                let angle = Math.random() * Math.PI * 2;
                let speed = 1.5 + Math.random() * 3.5;
                particles.push({
                    x: x,
                    y: y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    radius: 2 + Math.random() * 3,
                    color: '#e2e8f0',
                    alpha: 0.9,
                    decay: 0.04 + Math.random() * 0.03
                });
            }
        }

        function addMegaExplosion(x, y) {
            screenShake = 12;
            audio.explosion();

            // Explosions-Partikel & Rauch
            for (let i = 0; i < 40; i++) {
                let angle = Math.random() * Math.PI * 2;
                let speed = 2 + Math.random() * 8;
                let isSmoke = Math.random() < 0.5;
                particles.push({
                    x: x,
                    y: y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    radius: isSmoke ? (6 + Math.random() * 10) : (3 + Math.random() * 4),
                    color: isSmoke ? '#475569' : '#ffffff',
                    alpha: 0.95,
                    decay: isSmoke ? 0.015 + Math.random() * 0.01 : 0.03 + Math.random() * 0.02
                });
            }
        }

        function drawTransitionLine() {
            if (transitionProgress < 0) return;

            ctx.save();
            // Strich zieht diagonal von links oben (-300) nach rechts unten (V_WIDTH + 300)
            let currX = (V_WIDTH + 600) * transitionProgress - 300;
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 15;

            ctx.beginPath();
            // Quer-Strich / Parallelogramm-Form
            ctx.moveTo(currX, 0);
            ctx.lineTo(currX + 80, 0);
            ctx.lineTo(currX - 120, V_HEIGHT);
            ctx.lineTo(currX - 200, V_HEIGHT);
            ctx.closePath();
            ctx.fill();

            // Zarter Nachleucht-Strich
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.beginPath();
            ctx.moveTo(currX - 40, 0);
            ctx.lineTo(currX + 140, 0);
            ctx.lineTo(currX - 60, V_HEIGHT);
            ctx.lineTo(currX - 240, V_HEIGHT);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        function drawParticles() {
            for (let p of particles) {
                ctx.save();
                ctx.globalAlpha = p.alpha;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        // --- ENTITIES ---
        class Player {
            constructor(x, isOpponent = false) {
                this.startX = x;
                this.isOpponent = isOpponent;
                this.width = 46;
                this.height = 76;
                this.reset();
            }

            reset() {
                this.x = this.startX;
                this.y = V_HEIGHT - 90 - this.height;
                this.vx = 0;
                this.vy = 0;
                this.baseSpeed = 6.2;
                this.speed = 6.2;
                this.jumpPower = -12.5;
                this.gravity = 0.58;
                this.isGrounded = false;
                this.color = this.isOpponent ? '#94a3b8' : '#e2e8f0';
            }

            update(ball) {
                const currentPowerUp = this.isOpponent ? opponentPowerUp : playerPowerUp;
                this.speed = (currentPowerUp && currentPowerUp.type.id === 'SPEED') ? this.baseSpeed * 1.45 : this.baseSpeed;

                if (this.isOpponent) {
                    this.updateOpponentAI(ball);
                } else {
                    this.updateUser();
                }

                this.vy += this.gravity;
                this.x += this.vx;
                this.y += this.vy;

                const groundLevel = V_HEIGHT - 90;
                if (this.y + this.height >= groundLevel) {
                    this.y = groundLevel - this.height;
                    this.vy = 0;
                    this.isGrounded = true;
                }

                const netX = V_WIDTH / 2;
                if (!this.isOpponent) {
                    if (this.x < 15) this.x = 15;
                    if (this.x + this.width > netX - 15) this.x = netX - 15 - this.width;
                } else {
                    if (this.x < netX + 15) this.x = netX + 15;
                    if (this.x + this.width > V_WIDTH - 15 - this.width) this.x = V_WIDTH - 15 - this.width;
                }
            }

            updateUser() {
                this.vx = 0;
                const left = keys['ArrowLeft'] || keys['KeyA'];
                const right = keys['ArrowRight'] || keys['KeyD'];
                const jump = keys['ArrowUp'] || keys['KeyW'];

                if (left) this.vx = -this.speed;
                if (right) this.vx = this.speed;

                if (jump && this.isGrounded) {
                    this.vy = this.jumpPower;
                    this.isGrounded = false;
                    audio.jump();
                }
            }

            updateOpponentAI(ball) {
                this.vx = 0;
                const netX = V_WIDTH / 2;
                let targetX = V_WIDTH * 0.75;

                // Dynamische Anpassung basierend auf dem Bot-Level (1 bis 10)
                // Level 1 = langsam & ungenau, Level 10 = extrem schnell & präzise
                const speedFactor = 0.45 + (botLevel * 0.085); // 0.535x bis 1.3x Geschwindigkeit
                const maxReactionDist = 120 - (botLevel * 8);   // Zielgenauigkeit steigt mit Level
                const smashProbability = 0.2 + (botLevel * 0.075); // Höheres Level smashst deutlich häufiger

                if (ball.x > netX - 30) {
                    targetX = ball.x - 22;
                }

                if (this.x + this.width/2 < targetX - maxReactionDist / 6) {
                    this.vx = this.speed * speedFactor;
                } else if (this.x + this.width/2 > targetX + maxReactionDist / 6) {
                    this.vx = -this.speed * speedFactor;
                }

                // Sprung- und Smash-Verhalten
                if (this.isGrounded && ball.x > netX && ball.x < V_WIDTH - 40 && ball.y < this.y + 20 && ball.vy > -2) {
                    if (Math.abs((this.x + this.width/2) - ball.x) < (45 + botLevel * 3)) {
                        if (Math.random() < smashProbability) {
                            this.vy = this.jumpPower;
                            this.isGrounded = false;
                            audio.jump();
                        }
                    }
                }
            }

            draw() {
                ctx.save();
                const centerX = this.x + this.width / 2;

                // Schatten
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.beginPath();
                ctx.ellipse(centerX, V_HEIGHT - 90, this.width * 0.45, 6, 0, 0, Math.PI * 2);
                ctx.fill();

                // Character Base - Komplett einfarbig (Solid Color)
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.roundRect(this.x, this.y, this.width, this.height, 20);
                ctx.fill();

                ctx.restore();
            }
        }

        class Ball {
            constructor() {
                this.reset(1);
            }

            reset(servingSide = 1) {
                this.baseRadius = 16;
                this.radius = 16;
                this.x = servingSide === 1 ? V_WIDTH * 0.25 : V_WIDTH * 0.75;
                this.y = 160;
                // Sehr langsamer Start-Aufschlag
                this.vx = servingSide === 1 ? 2.2 : -2.2;
                this.vy = -2.5;
                this.gravity = 0.38; // Mildere Gravitation
                this.bouncesOnGround = { player: 0, opponent: 0 };
                this.trail = [];
                this.isSmashActive = false;
                this.rallyHits = 0;
                this.speedMultiplier = 0.8; // Sehr schonender Aufprall/Start
                this.lastHitter = null;
            }

            update() {
                const activePUp = this.lastHitter === 'player' ? playerPowerUp : (this.lastHitter === 'opponent' ? opponentPowerUp : null);
                this.radius = (activePUp && activePUp.type.id === 'BIGBALL') ? this.baseRadius * 1.55 : this.baseRadius;

                this.trail.push({ x: this.x, y: this.y, isSmash: this.isSmashActive });
                if (this.trail.length > 7) this.trail.shift();

                this.vy += this.gravity;
                this.x += this.vx;
                this.y += this.vy;

                if (this.x - this.radius < 15) {
                    this.x = 15 + this.radius;
                    this.vx *= -0.75;
                    audio.bounce();
                    addBounceShockwave(this.x, this.y);
                }
                if (this.x + this.radius > V_WIDTH - 15) {
                    this.x = V_WIDTH - 15 - this.radius;
                    this.vx *= -0.75;
                    audio.bounce();
                    addBounceShockwave(this.x, this.y);
                }
                if (this.y - this.radius < 15) {
                    this.y = 15 + this.radius;
                    this.vy *= -0.75;
                    audio.bounce();
                }
            }

            draw() {
                ctx.save();
                // Trail
                for (let i = 0; i < this.trail.length; i++) {
                    let pt = this.trail[i];
                    let alpha = (i + 1) / this.trail.length * 0.3;
                    ctx.fillStyle = this.isSmashActive ? `rgba(239, 68, 68, ${alpha})` : `rgba(241, 245, 249, ${alpha})`;
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, this.radius * (0.5 + (i / this.trail.length) * 0.5), 0, Math.PI * 2);
                    ctx.fill();
                }

                // Ball
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = this.isSmashActive ? '#ef4444' : '#ffffff';
                ctx.shadowBlur = this.isSmashActive ? 15 : 8;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        // --- GAME INSTANCES & STATE ---
        const player = new Player(120, false);
        const opponent = new Player(V_WIDTH - 120 - 46, true);
        const ball = new Ball();

        let playerHP = 100;
        let opponentHP = 100;
        let roundActive = false;

        function updateHPBars() {
            const playerBar = document.getElementById('player-hp-bar');
            const oppBar = document.getElementById('opp-hp-bar');
            if (playerBar) playerBar.style.width = `${Math.max(0, playerHP)}%`;
            if (oppBar) oppBar.style.width = `${Math.max(0, opponentHP)}%`;
        }

        function startRound(servingSide) {
            ball.reset(servingSide);
            player.reset();
            opponent.reset();
            playerPowerUp = null;
            opponentPowerUp = null;
            updatePowerUpUI();
            roundActive = true;
            document.getElementById('point-overlay').classList.add('hidden');
            gameState = STATE_PLAYING;
            startRoundTransition();
        }

        function checkPlayerHit(p, sideKey) {
            let closestX = Math.max(p.x, Math.min(ball.x, p.x + p.width));
            let closestY = Math.max(p.y, Math.min(ball.y, p.y + p.height));

            let distX = ball.x - closestX;
            let distY = ball.y - closestY;
            let distance = Math.sqrt(distX * distX + distY * distY);

            if (distance < ball.radius) {
                ball.bouncesOnGround.player = 0;
                ball.bouncesOnGround.opponent = 0;

                if (ball.lastHitter !== sideKey) {
                    ball.lastHitter = sideKey;
                    ball.rallyHits++;
                    
                    // Power-up Belohnung für 10 Ballwechsel in der Luft!
                    if (ball.rallyHits === 10) {
                        grantRallyPowerUp(sideKey);
                    }

                    let speedLevel = Math.floor(ball.rallyHits / 2);
                    ball.speedMultiplier = 0.8 + (speedLevel * 0.1);
                }

                let isSmash = false;
                let isLob = false;

                if (sideKey === 'player') {
                    if (keys['Space'] || keys['KeyJ']) isSmash = true;
                    if (keys['KeyS'] || keys['ArrowDown']) isLob = true;
                } else {
                    if (ball.y < p.y + 25 && Math.random() < 0.65) isSmash = true;
                }

                let dir = sideKey === 'player' ? 1 : -1;

                if (isSmash) {
                    audio.smash();
                    ball.isSmashActive = true;
                    ball.vx = 9 * dir * ball.speedMultiplier;
                    ball.vy = 8 * ball.speedMultiplier;
                    addBounceShockwave(ball.x, ball.y);
                } else if (isLob) {
                    audio.lob();
                    ball.isSmashActive = false;
                    ball.vx = 3.5 * dir * ball.speedMultiplier;
                    ball.vy = -8.5 * ball.speedMultiplier;
                } else {
                    audio.hit();
                    ball.isSmashActive = false;
                    let hitAngle = (ball.x - (p.x + p.width/2)) / (p.width/2);
                    ball.vx = (hitAngle * 4.5 + (4.2 * dir)) * ball.speedMultiplier;
                    ball.vy = -5.5 * ball.speedMultiplier;
                }

                ball.y = p.y - ball.radius - 2;
            }
        }

        function checkCollisions() {
            const netX = V_WIDTH / 2;
            const netHeight = 150;
            const netY = V_HEIGHT - 90 - netHeight;
            const netWidth = 10;

            if (ball.x + ball.radius > netX - netWidth/2 &&
                ball.x - ball.radius < netX + netWidth/2 &&
                ball.y + ball.radius > netY) {
                
                if (ball.y - ball.radius < netY + 12) {
                    ball.y = netY - ball.radius;
                    ball.vy *= -0.5;
                    audio.bounce();
                } else {
                    if (ball.x < netX) {
                        ball.x = netX - netWidth/2 - ball.radius;
                        ball.vx = -Math.abs(ball.vx) * 0.7;
                    } else {
                        ball.x = netX + netWidth/2 + ball.radius;
                        ball.vx = Math.abs(ball.vx) * 0.7;
                    }
                    audio.bounce();
                }
            }

            checkPlayerHit(player, 'player');
            checkPlayerHit(opponent, 'opponent');

            const groundLevel = V_HEIGHT - 90;
            if (ball.y + ball.radius >= groundLevel) {
                ball.y = groundLevel - ball.radius;
                
                let sideOnGround = ball.x < netX ? 'player' : 'opponent';
                let activePUp = sideOnGround === 'player' ? playerPowerUp : opponentPowerUp;
                if (activePUp && activePUp.type.id === 'SHIELD') {
                    ball.vy = -7;
                    audio.powerup();
                    if (sideOnGround === 'player') playerPowerUp = null;
                    else opponentPowerUp = null;
                    updatePowerUpUI();
                    addBounceShockwave(ball.x, groundLevel);
                    return;
                }

                ball.vy *= -0.45;
                audio.bounce();
                addBounceShockwave(ball.x, groundLevel);

                if (ball.x < netX) {
                    ball.bouncesOnGround.player++;
                    ball.bouncesOnGround.opponent = 0;
                    if (ball.bouncesOnGround.player >= 2 && roundActive) {
                        triggerPointLost('player');
                    }
                } else {
                    ball.bouncesOnGround.opponent++;
                    ball.bouncesOnGround.player = 0;
                    if (ball.bouncesOnGround.opponent >= 2 && roundActive) {
                        triggerPointLost('opponent');
                    }
                }
            }
        }

        function triggerPointLost(sideLost) {
            if (!roundActive) return;
            roundActive = false;

            addMegaExplosion(ball.x, ball.y);

            const damage = 34;
            let pointTitleText = "";

            if (sideLost === 'player') {
                playerHP = Math.max(0, playerHP - damage);
                pointTitleText = "PUNKT FÜR BOT";
                document.getElementById('game-status-text').textContent = pointTitleText;
            } else {
                opponentHP = Math.max(0, opponentHP - damage);
                pointTitleText = "PUNKT FÜR DICH";
                document.getElementById('game-status-text').textContent = pointTitleText;
            }
            updateHPBars();

            gameState = STATE_POINT_PAUSE;
            const pointOverlay = document.getElementById('point-overlay');
            document.getElementById('point-title').textContent = pointTitleText;
            pointOverlay.classList.remove('hidden');

            if (playerHP <= 0 || opponentHP <= 0) {
                setTimeout(endMatch, 1400);
            } else {
                setTimeout(() => {
                    startRound(sideLost === 'player' ? -1 : 1);
                    document.getElementById('game-status-text').textContent = "BEREIT ZUM AUFSCHLAG";
                }, 1600);
            }
        }

        function endMatch() {
            gameState = STATE_GAMEOVER;
            document.getElementById('point-overlay').classList.add('hidden');
            const overlay = document.getElementById('gameover-overlay');
            const title = document.getElementById('gameover-title');

            if (playerHP <= 0) {
                playerHP = 0;
                title.textContent = "VERLOREN";
                title.className = "arcade-font text-3xl sm:text-4xl text-slate-300 mb-2";
            } else {
                opponentHP = 0;
                title.textContent = "GEWONNEN";
                title.className = "arcade-font text-3xl sm:text-4xl text-white mb-2";
            }
            updateHPBars();
            overlay.classList.remove('hidden');
        }

        function resetAndStartGame() {
            document.getElementById('menu-overlay').classList.add('hidden');
            document.getElementById('point-overlay').classList.add('hidden');
            document.getElementById('gameover-overlay').classList.add('hidden');
            playerHP = 100;
            opponentHP = 100;
            updateHPBars();
            startRound(1);
        }

        function showMainMenu() {
            gameState = STATE_MENU;
            document.getElementById('gameover-overlay').classList.add('hidden');
            document.getElementById('point-overlay').classList.add('hidden');
            document.getElementById('map-roulette-overlay').classList.add('hidden');
            document.getElementById('menu-overlay').classList.remove('hidden');
        }

        // Interface Handlers
        bindButtonAction('start-game-btn', startRandomMapRoulette);
        bindButtonAction('restart-btn', startRandomMapRoulette);
        bindButtonAction('menu-btn', showMainMenu);

        // Bot Level Slider Event-Listener & Styling
        const botSlider = document.getElementById('bot-level-slider');
        const botText = document.getElementById('bot-level-text');

        function setBotLevel(val) {
            botLevel = parseInt(val);
            if (botSlider) botSlider.value = botLevel;
            
            let label = "Mittel";
            if (botLevel <= 3) label = "Leicht";
            else if (botLevel >= 7) label = "Profi";
            
            if (botText) botText.textContent = `${botLevel} (${label})`;

            document.querySelectorAll('.bot-preset-btn').forEach(btn => {
                btn.className = "bot-preset-btn bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 py-2 rounded-lg text-xs font-bold active:scale-95 transition";
            });
            if (botLevel === 1) {
                const b1 = document.getElementById('bot-preset-1');
                if (b1) b1.className = "bot-preset-btn bg-amber-500/20 border-2 border-amber-400 text-amber-300 py-2 rounded-lg text-xs font-bold active:scale-95 transition";
            } else if (botLevel === 5) {
                const b5 = document.getElementById('bot-preset-5');
                if (b5) b5.className = "bot-preset-btn bg-amber-500/20 border-2 border-amber-400 text-amber-300 py-2 rounded-lg text-xs font-bold active:scale-95 transition";
            } else if (botLevel === 9) {
                const b9 = document.getElementById('bot-preset-9');
                if (b9) b9.className = "bot-preset-btn bg-amber-500/20 border-2 border-amber-400 text-amber-300 py-2 rounded-lg text-xs font-bold active:scale-95 transition";
            }
        }

        if (botSlider) {
            botSlider.addEventListener('input', (e) => setBotLevel(e.target.value));
        }

        bindButtonAction('bot-preset-1', () => setBotLevel(1));
        bindButtonAction('bot-preset-5', () => setBotLevel(5));
        bindButtonAction('bot-preset-9', () => setBotLevel(9));

        setBotLevel(5);

        // --- HINTERGRUND & RENDER-LOGIK ---
        function drawBackground() {
            const map = MAPS[currentMapIndex];
            
            // 1. Schöner Hintergrund-Farbverlauf
            let bgGrad = ctx.createLinearGradient(0, 0, 0, V_HEIGHT);
            bgGrad.addColorStop(0, map.bgGradient[0]);
            bgGrad.addColorStop(0.5, map.bgGradient[1]);
            bgGrad.addColorStop(1, map.bgGradient[2]);
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);

            // 2. Hintergrund-Sonne / Mond Glow
            ctx.fillStyle = map.sunColor;
            ctx.beginPath();
            ctx.arc(V_WIDTH / 2, 140, 160, 0, Math.PI * 2);
            ctx.fill();

            // 3. Berg-/Landschafts-Silhouetten
            ctx.fillStyle = map.mountainsColor;
            ctx.beginPath();
            ctx.moveTo(0, V_HEIGHT - 90);
            ctx.lineTo(150, V_HEIGHT - 170);
            ctx.lineTo(320, V_HEIGHT - 110);
            ctx.lineTo(500, V_HEIGHT - 190);
            ctx.lineTo(680, V_HEIGHT - 120);
            ctx.lineTo(850, V_HEIGHT - 180);
            ctx.lineTo(V_WIDTH, V_HEIGHT - 90);
            ctx.fill();

            // 4. Spielfeldboden
            const groundY = V_HEIGHT - 90;
            ctx.fillStyle = map.groundColor;
            ctx.fillRect(0, groundY, V_WIDTH, 90);

            // Boden-Trennlinie
            ctx.fillStyle = '#64748b';
            ctx.fillRect(0, groundY, V_WIDTH, 4);

            // 5. Netz
            const netX = V_WIDTH / 2;
            const netHeight = 150;
            const netY = groundY - netHeight;
            const netWidth = 8;

            ctx.fillStyle = '#cbd5e1';
            ctx.fillRect(netX - netWidth/2, netY, netWidth, netHeight);

            // Netz-Muster
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 1;
            for (let y = netY; y < groundY; y += 12) {
                ctx.beginPath();
                ctx.moveTo(netX - netWidth/2, y);
                ctx.lineTo(netX + netWidth/2, y + 6);
                ctx.stroke();
            }
        }

        function gameLoop() {
            ctx.save();
            
            // Screen Shake Effect
            if (screenShake > 0.5) {
                let dx = (Math.random() - 0.5) * screenShake;
                let dy = (Math.random() - 0.5) * screenShake;
                ctx.translate(dx, dy);
            }

            drawBackground();

            if (gameState === STATE_PLAYING) {
                player.update(ball);
                opponent.update(ball);
                ball.update();
                updatePowerUps();
                checkCollisions();
            }

            updateParticles();
            drawParticles();

            player.draw();
            opponent.draw();
            ball.draw();

            // Diagonale Wisch-Animation zeichnen
            drawTransitionLine();

            ctx.restore();

            requestAnimationFrame(gameLoop);
        }

        // Main Loop Start
        requestAnimationFrame(gameLoop);
    
