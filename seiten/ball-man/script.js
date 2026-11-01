        let audioCtx = null;
        let isMusicOn = true;
        let currentTrackIdx = 0;
        let musicTimer = null;

        // Eingabe-Modus (Auto-Erkennung: 'touch', 'keyboard', 'gamepad')
        let inputMode = 'keyboard';
        let isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        function setInputMode(mode) {
            inputMode = mode;
            if (mode === 'touch') isTouchDevice = true;
            
            const touchControlsEl = document.getElementById('touch-controls');
            const controllerStatusEl = document.getElementById('controller-status');
            
            // Touch-Buttons NUR im 2-Spieler-Modus auf Touch-Geräten anzeigen
            if (touchControlsEl) {
                if (isTouchDevice && currentMode === 2 && state === 'playing') {
                    touchControlsEl.classList.remove('hidden');
                    touchControlsEl.classList.add('flex');
                } else {
                    touchControlsEl.classList.add('hidden');
                    touchControlsEl.classList.remove('flex');
                }
            }

            if (controllerStatusEl) {
                if (inputMode === 'touch' || isTouchDevice) controllerStatusEl.innerText = '📱 Touch Format Aktiv';
                else if (inputMode === 'gamepad') controllerStatusEl.innerText = '🎮 Gamepad Aktiv';
                else controllerStatusEl.innerText = '⌨️ Tastatur Format Aktiv';
            }
        }

        // Death delay state
        let deathTimer = null;

        function initAudio() {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
        }

        function playSound(type) {
            initAudio();
            if (!audioCtx) return;

            try {
                const now = audioCtx.currentTime;
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);

                if (type === 'btn') {
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(440, now);
                    osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
                    gain.gain.setValueAtTime(0.15, now);
                    gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
                    osc.start(now);
                    osc.stop(now + 0.08);
                } else if (type === 'grapple') {
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(220, now);
                    osc.frequency.exponentialRampToValueAtTime(550, now + 0.12);
                    gain.gain.setValueAtTime(0.2, now);
                    gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
                    osc.start(now);
                    osc.stop(now + 0.12);
                } else if (type === 'cut') {
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(800, now);
                    osc.frequency.exponentialRampToValueAtTime(120, now + 0.2);
                    gain.gain.setValueAtTime(0.25, now);
                    gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
                    osc.start(now);
                    osc.stop(now + 0.2);
                } else if (type === 'coin') {
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(987.77, now);
                    osc.frequency.setValueAtTime(1318.51, now + 0.08);
                    gain.gain.setValueAtTime(0.18, now);
                    gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
                    osc.start(now);
                    osc.stop(now + 0.25);
                } else if (type === 'jumppad') {
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(300, now);
                    osc.frequency.exponentialRampToValueAtTime(900, now + 0.25);
                    gain.gain.setValueAtTime(0.3, now);
                    gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
                    osc.start(now);
                    osc.stop(now + 0.25);
                } else if (type === 'powerup') {
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(330, now);
                    osc.frequency.setValueAtTime(440, now + 0.06);
                    osc.frequency.setValueAtTime(554.37, now + 0.12);
                    osc.frequency.setValueAtTime(659.25, now + 0.18);
                    gain.gain.setValueAtTime(0.15, now);
                    gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
                    osc.start(now);
                    osc.stop(now + 0.3);
                } else if (type === 'win') {
                    const freqs = [523.25, 659.25, 783.99, 1046.50];
                    freqs.forEach((f, i) => {
                        const o = audioCtx.createOscillator();
                        const g = audioCtx.createGain();
                        o.connect(g);
                        g.connect(audioCtx.destination);
                        o.type = 'triangle';
                        o.frequency.setValueAtTime(f, now + i * 0.1);
                        g.gain.setValueAtTime(0.18, now + i * 0.1);
                        g.gain.linearRampToValueAtTime(0.01, now + i * 0.1 + 0.3);
                        o.start(now + i * 0.1);
                        o.stop(now + i * 0.1 + 0.3);
                    });
                } else if (type === 'death' || type === 'explosion') {
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(220, now);
                    osc.frequency.exponentialRampToValueAtTime(30, now + 0.45);
                    gain.gain.setValueAtTime(0.4, now);
                    gain.gain.linearRampToValueAtTime(0.01, now + 0.45);
                    osc.start(now);
                    osc.stop(now + 0.45);
                }
            } catch (e) {}
        }

        // Generiere 100 unterschiedliche Prozedurale Musik-Tracks & Frequenzen
        const trackNames = [];
        const trackMelodies = [];
        const baseScales = [
            [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25], // Dur
            [220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00], // Moll
            [146.83, 164.81, 174.61, 196.00, 220.00, 233.08, 261.63, 293.66]  // Dämonen-Moll / Phrygisch
        ];
        const adjectives = ["Neon", "Cyber", "Dark", "Demon", "Hyper", "Galactic", "Pixel", "Synth", "Electric", "Cosmic", "Infernal", "Shadow", "Quantum", "Void", "Blood", "Abyssal"];
        const nouns = ["Pulse", "Glide", "Drift", "Echo", "Orbit", "Vibe", "Waveform", "Horizon", "Arcade", "Dream", "Core", "Storm", "Rage", "Realm", "Nexus", "Doom"];

        for (let i = 0; i < 100; i++) {
            const adj = adjectives[i % adjectives.length];
            const noun = nouns[(i * 3) % nouns.length];
            trackNames.push(`${i + 1}. ${adj} ${noun}`);

            const isDemonTrack = i >= 9; // Ab Track 10 sehr bedrohlich/spannend
            const scale = isDemonTrack ? baseScales[2] : baseScales[i % 2];
            const melody = [];
            for (let s = 0; s < 8; s++) {
                const note = scale[Math.floor((Math.sin(i * 10 + s) * 0.5 + 0.5) * scale.length)];
                melody.push(note);
            }
            trackMelodies.push(melody);
        }

        function startSynthMusic() {
            if (musicTimer) clearInterval(musicTimer);
            if (!isMusicOn) return;

            let step = 0;
            const melody = trackMelodies[currentTrackIdx % trackMelodies.length];
            const isDemon = currentTrackIdx >= 9;

            musicTimer = setInterval(() => {
                if (!isMusicOn || !audioCtx) return;
                try {
                    const now = audioCtx.currentTime;
                    
                    if (step % (isDemon ? 1 : 2) === 0) {
                        const bassOsc = audioCtx.createOscillator();
                        const bassGain = audioCtx.createGain();
                        bassOsc.connect(bassGain);
                        bassGain.connect(audioCtx.destination);
                        bassOsc.type = isDemon ? 'sawtooth' : 'triangle';
                        bassOsc.frequency.setValueAtTime(melody[(step) % melody.length] / (isDemon ? 3 : 2), now);
                        bassGain.gain.setValueAtTime(isDemon ? 0.09 : 0.06, now);
                        bassGain.gain.linearRampToValueAtTime(0.001, now + (isDemon ? 0.12 : 0.22));
                        bassOsc.start(now);
                        bassOsc.stop(now + (isDemon ? 0.12 : 0.22));
                    }

                    const leadOsc = audioCtx.createOscillator();
                    const leadGain = audioCtx.createGain();
                    leadOsc.connect(leadGain);
                    leadGain.connect(audioCtx.destination);
                    leadOsc.type = isDemon ? 'sawtooth' : 'sine';
                    leadOsc.frequency.setValueAtTime(melody[step % melody.length] * (isDemon ? 1.5 : 1), now);
                    leadGain.gain.setValueAtTime(isDemon ? 0.06 : 0.04, now);
                    leadGain.gain.linearRampToValueAtTime(0.001, now + 0.16);
                    leadOsc.start(now);
                    leadOsc.stop(now + 0.16);

                    step = (step + 1) % 16;
                } catch(e) {}
            }, isDemon ? 110 : 150);
        }

        function playRandomTrack() {
            initAudio();
            currentTrackIdx = Math.floor(Math.random() * trackNames.length);
            updateTrackUI();
            startSynthMusic();
        }

        function toggleMusic() {
            initAudio();
            isMusicOn = !isMusicOn;
            updateTrackUI();
            if (isMusicOn) startSynthMusic();
            else if (musicTimer) clearInterval(musicTimer);
        }

        function setTrackByLevel(lvlId) {
            currentTrackIdx = (lvlId - 1) % trackNames.length;
            updateTrackUI();
            if (isMusicOn) startSynthMusic();
        }

        function updateTrackUI() {
            const name = trackNames[currentTrackIdx];
            const status = isMusicOn ? "AN" : "AUS";
            document.getElementById('music-track-name').innerText = name;
            document.getElementById('music-hud-status').innerText = status;
            document.getElementById('menu-track-name').innerText = name;
            document.getElementById('music-menu-status').innerText = status;
        }

        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        
        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        const config = {
            gravity: 0.58,
            damping: 0.996,
            minRopeLength: 45,
            maxAttachDist: 900,
            playerRadius: 18,
            deathY: 550
        };

        // Expanded Level Definitions (20 Levels, 11-20 Dämonen-Level)
        const gdLevels = [
            { id: 1, name: "1. STEREO SWING", diff: "EASY", stars: 1, color: "#22c55e", bg: "NEON GRID", segments: 35, spacing: 320, platformChance: 0.5, powerupChance: 0.4, obstacleChance: 0.08, cost: 0 },
            { id: 2, name: "2. HOOK ON TRACK", diff: "NORMAL", stars: 2, color: "#3b82f6", bg: "DEEP SPACE", segments: 42, spacing: 330, platformChance: 0.45, powerupChance: 0.45, obstacleChance: 0.1, cost: 100 },
            { id: 3, name: "3. POLAR GRAPPLE", diff: "NORMAL", stars: 2, color: "#a855f7", bg: "RETRO SUNSET", segments: 48, spacing: 340, platformChance: 0.42, powerupChance: 0.45, obstacleChance: 0.12, cost: 200 },
            { id: 4, name: "4. DRY COMBAT", diff: "HARD", stars: 3, color: "#f97316", bg: "CYBER MATRIX", segments: 55, spacing: 350, platformChance: 0.4, powerupChance: 0.5, obstacleChance: 0.15, cost: 400 },
            { id: 5, name: "5. NEON FLIGHT", diff: "HARD", stars: 3, color: "#eab308", bg: "NEON GRID", segments: 62, spacing: 360, platformChance: 0.38, powerupChance: 0.5, obstacleChance: 0.18, cost: 600 },
            { id: 6, name: "6. CYBER DRIFT", diff: "HARD", stars: 3, color: "#ec4899", bg: "CYBER MATRIX", segments: 70, spacing: 370, platformChance: 0.35, powerupChance: 0.55, obstacleChance: 0.2, cost: 800 },
            { id: 7, name: "7. SUNSET RUSH", diff: "INSANE", stars: 4, color: "#10b981", bg: "RETRO SUNSET", segments: 78, spacing: 380, platformChance: 0.32, powerupChance: 0.55, obstacleChance: 0.22, cost: 1000 },
            { id: 8, name: "8. ORBITAL FLYER", diff: "INSANE", stars: 4, color: "#06b6d4", bg: "DEEP SPACE", segments: 85, spacing: 390, platformChance: 0.3, powerupChance: 0.6, obstacleChance: 0.25, cost: 1300 },
            { id: 9, name: "9. VOLCANO ESCAPE", diff: "INSANE", stars: 4, color: "#f43f5e", bg: "LAVA CAVERN", segments: 92, spacing: 400, platformChance: 0.28, powerupChance: 0.6, obstacleChance: 0.28, cost: 1600 },
            // EXTREM SCHWERE DÄMONEN LEVEL (10-20)
            { id: 10, name: "10. DEMON AWAKENING", diff: "EXTREME DEMON", stars: 5, color: "#ef4444", bg: "LAVA CAVERN", segments: 100, spacing: 410, platformChance: 0.22, powerupChance: 0.65, obstacleChance: 0.35, cost: 2000 },
            { id: 11, name: "11. ABYSSAL CHAOS", diff: "EXTREME DEMON", stars: 5, color: "#dc2626", bg: "DEMON REALM", segments: 110, spacing: 420, platformChance: 0.2, powerupChance: 0.65, obstacleChance: 0.38, cost: 2500 },
            { id: 12, name: "12. INFERNAL HELLFIRE", diff: "EXTREME DEMON", stars: 5, color: "#b91c1c", bg: "DEMON REALM", segments: 120, spacing: 430, platformChance: 0.18, powerupChance: 0.7, obstacleChance: 0.4, cost: 3000 },
            { id: 13, name: "13. BLOOD SWING", diff: "INSANE DEMON", stars: 6, color: "#991b1b", bg: "DEMON REALM", segments: 130, spacing: 440, platformChance: 0.16, powerupChance: 0.7, obstacleChance: 0.42, cost: 3500 },
            { id: 14, name: "14. VOID CRUSHER", diff: "INSANE DEMON", stars: 6, color: "#7f1d1d", bg: "DEMON REALM", segments: 140, spacing: 450, platformChance: 0.15, powerupChance: 0.75, obstacleChance: 0.45, cost: 4000 },
            { id: 15, name: "15. SHADOW CORE", diff: "INSANE DEMON", stars: 6, color: "#881337", bg: "DEMON REALM", segments: 150, spacing: 460, platformChance: 0.14, powerupChance: 0.75, obstacleChance: 0.48, cost: 4500 },
            { id: 16, name: "16. DOOMSDAY HAVOC", diff: "MYTHIC DEMON", stars: 7, color: "#be123c", bg: "DEMON REALM", segments: 160, spacing: 470, platformChance: 0.12, powerupChance: 0.8, obstacleChance: 0.5, cost: 5000 },
            { id: 17, name: "17. DARK GRAVITY", diff: "MYTHIC DEMON", stars: 7, color: "#e11d48", bg: "DEMON REALM", segments: 170, spacing: 480, platformChance: 0.1, powerupChance: 0.8, obstacleChance: 0.52, cost: 6000 },
            { id: 18, name: "18. APOCALYPSE RUN", diff: "MYTHIC DEMON", stars: 7, color: "#f43f5e", bg: "DEMON REALM", segments: 185, spacing: 490, platformChance: 0.08, powerupChance: 0.85, obstacleChance: 0.55, cost: 7000 },
            { id: 19, name: "19. DEMON GOD'S LAIR", diff: "GODLIKE DEMON", stars: 8, color: "#fda4af", bg: "DEMON REALM", segments: 200, spacing: 500, platformChance: 0.06, powerupChance: 0.9, obstacleChance: 0.58, cost: 8500 },
            { id: 20, name: "20. ULTIMATE OMEGA DEMON", diff: "GODLIKE DEMON", stars: 10, color: "#ffffff", bg: "DEMON REALM", segments: 220, spacing: 520, platformChance: 0.05, powerupChance: 1.0, obstacleChance: 0.6, cost: 10000 }
        ];

        let state = 'menu';
        let currentMode = 1;
        let selectedLevelIdx = 0;
        let totalCoins = parseInt(localStorage.getItem('grapple_coins') || '0');
        let levelProgress = JSON.parse(localStorage.getItem('grapple_progress') || JSON.stringify(new Array(20).fill(0)));
        let unlockedLevels = JSON.parse(localStorage.getItem('grapple_unlocked') || JSON.stringify([true, ...new Array(19).fill(false)]));

        let camera = { x: 0, y: 0 };
        let levelEndX = 0;

        let players = [];
        let anchors = [];
        let platforms = [];
        let jumpPads = [];
        let powerups = [];
        let coins = [];
        let obstacles = [];
        let particles = [];

        const uiMenu = document.getElementById('menu-overlay');
        const uiLevel = document.getElementById('level-overlay');
        const uiHUD = document.getElementById('hud');
        const uiEnd = document.getElementById('end-overlay');
        const uiHudP2 = document.getElementById('hud-p2');

        function showToast(msg) {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = 'toast bg-slate-900 border-2 border-yellow-500 text-yellow-300 font-extrabold px-4 py-2 rounded-xl shadow-lg text-sm';
            toast.innerText = msg;
            container.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }

        function saveProgress() {
            localStorage.setItem('grapple_coins', totalCoins.toString());
            localStorage.setItem('grapple_progress', JSON.stringify(levelProgress));
            localStorage.setItem('grapple_unlocked', JSON.stringify(unlockedLevels));
        }

        function attachGrapple(pIdx) {
            if (state !== 'playing') return;
            const p = players[pIdx];
            if (!p || p.dead || p.isSwinging) return;

            let bestAnchor = null;
            let minDist = config.maxAttachDist;

            anchors.forEach(a => {
                if (a.x > p.x - 50) {
                    let d = Math.hypot(p.x - a.x, p.y - a.y);
                    if (d < minDist) {
                        minDist = d;
                        bestAnchor = a;
                    }
                }
            });

            if (bestAnchor) {
                p.isSwinging = true;
                p.activeAnchor = bestAnchor;
                p.ropeLength = Math.hypot(p.x - bestAnchor.x, p.y - bestAnchor.y);
                p.vx += 0.9;
                p.vy -= 0.9;
                playSound('grapple');
            }
        }

        function detachGrapple(pIdx) {
            if (state !== 'playing') return;
            const p = players[pIdx];
            if (!p || p.dead) return;

            if (p.isSwinging) {
                p.isSwinging = false;
                p.activeAnchor = null;
                p.vx *= 1.05;
            }
        }

        function checkRopeIntersection(p1, p2) {
            if (!p1 || !p2 || !p1.isSwinging || !p2.isSwinging || !p1.activeAnchor || !p2.activeAnchor) return false;
            return lineIntersects(
                p1.x, p1.y, p1.activeAnchor.x, p1.activeAnchor.y,
                p2.x, p2.y, p2.activeAnchor.x, p2.activeAnchor.y
            );
        }

        function lineIntersects(x1, y1, x2, y2, x3, y3, x4, y4) {
            function CCW(pA, pB, pC) {
                return (pC.y - pA.y) * (pB.x - pA.x) > (pB.y - pA.y) * (pC.x - pA.x);
            }
            let p1 = {x: x1, y: y1}, p2 = {x: x2, y: y2}, p3 = {x: x3, y: y3}, p4 = {x: x4, y: y4};
            return (CCW(p1, p3, p4) !== CCW(p2, p3, p4)) && (CCW(p1, p2, p3) !== CCW(p1, p2, p4));
        }

        function triggerDeathExplosion(p) {
            playSound('explosion');
            for (let i = 0; i < 60; i++) {
                let angle = Math.random() * Math.PI * 2;
                let speed = 4 + Math.random() * 16;
                particles.push({
                    x: p.x,
                    y: p.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 2,
                    color: Math.random() < 0.3 ? '#ef4444' : (Math.random() < 0.6 ? '#f97316' : '#facc15'),
                    life: 1.0,
                    r: 5 + Math.random() * 7
                });
            }
        }

        function updateLevelCardUI() {
            const lvl = gdLevels[selectedLevelIdx];
            const unlocked = unlockedLevels[selectedLevelIdx];
            const progress = levelProgress[selectedLevelIdx] || 0;

            document.getElementById('card-name').innerText = lvl.name;
            document.getElementById('card-difficulty').innerText = `${lvl.diff} • ⭐ ${lvl.stars} STERN${lvl.stars > 1 ? 'E' : ''}`;
            document.getElementById('card-difficulty').style.color = lvl.color;
            document.getElementById('card-bg-theme').innerText = `HINTERGRUND: ${lvl.bg}`;
            document.getElementById('card-progress-bar').style.width = `${progress}%`;
            document.getElementById('card-progress-text').innerText = `${progress}% ERREICHT`;

            const actionContainer = document.getElementById('card-action-container');
            if (unlocked) {
                actionContainer.innerHTML = `
                    <button onclick="playSound('btn'); startSelectedLevel()" class="gd-play-btn w-20 h-20 rounded-full flex items-center justify-center text-4xl text-white pl-1 shadow-lg">
                        ▶
                    </button>
                `;
            } else {
                actionContainer.innerHTML = `
                    <button onclick="playSound('btn'); unlockLevel(${selectedLevelIdx})" class="px-6 py-3 rounded-2xl bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-black text-lg border-2 border-yellow-200 shadow-lg flex items-center gap-2">
                        🔒 FREISCHALTEN (${lvl.cost} 🪙)
                    </button>
                `;
            }

            document.getElementById('total-coins-display').innerText = totalCoins;
            let starsEarned = levelProgress.reduce((acc, p) => acc + (p >= 100 ? 1 : 0), 0);
            let totalPossibleStars = gdLevels.reduce((acc, l) => acc + l.stars, 0);
            document.getElementById('total-stars').innerText = `${starsEarned} / ${gdLevels.length}`;
        }

        function unlockLevel(idx) {
            const lvl = gdLevels[idx];
            if (totalCoins >= lvl.cost) {
                totalCoins -= lvl.cost;
                unlockedLevels[idx] = true;
                saveProgress();
                playSound('powerup');
                showToast(`Level "${lvl.name}" freigeschaltet!`);
                updateLevelCardUI();
            } else {
                playSound('death');
                showToast(`Nicht genug Münzen! Braucht ${lvl.cost} 🪙`);
            }
        }

        function showMainMenu() {
            state = 'menu';
            deathTimer = null;
            uiMenu.classList.remove('hidden');
            uiLevel.classList.add('hidden');
            uiHUD.classList.add('hidden');
            uiEnd.classList.add('hidden');
        }

        function showLevelSelect(mode = 1) {
            currentMode = mode;
            state = 'levelSelect';
            deathTimer = null;
            document.getElementById('mode-title').innerText = mode === 2 ? "2-SPIELER LEVEL AUSWAHL" : "LEVEL AUSWAHL";
            uiMenu.classList.add('hidden');
            uiLevel.classList.remove('hidden');
            uiHUD.classList.add('hidden');
            uiEnd.classList.add('hidden');
            updateLevelCardUI();
        }

        function changeLevelCard(dir) {
            selectedLevelIdx = (selectedLevelIdx + dir + gdLevels.length) % gdLevels.length;
            updateLevelCardUI();
        }

        function generateLevel(levelData) {
            anchors = [];
            platforms = [];
            jumpPads = [];
            powerups = [];
            coins = [];
            obstacles = [];
            particles = [];

            let currentX = 200;
            let currentY = -120;
            
            anchors.push({ x: 0, y: -220 });
            platforms.push({ x: -400, y: 15, w: 800, h: 30 });

            const powerTypes = ['speed', 'magnet', 'rocket', 'low_grav', 'invert_grav'];

            for (let i = 0; i < levelData.segments; i++) {
                currentX += levelData.spacing + (Math.random() - 0.2) * 160;
                currentY += (Math.random() - 0.5) * 280;
                
                if (currentY < -500) currentY = -500;
                if (currentY > 160) currentY = 160;

                anchors.push({ x: currentX, y: currentY });

                let hasPlatform = Math.random() < levelData.platformChance;
                let platX = currentX - 90 + (Math.random() - 0.5) * 60;
                let platY = currentY + 180 + Math.random() * 80;
                let platW = 160 + Math.random() * 80;

                if (hasPlatform) {
                    let plat = { x: platX, y: platY, w: platW, h: 26 };
                    platforms.push(plat);

                    if (Math.random() < 0.35) {
                        jumpPads.push({
                            x: plat.x + plat.w * 0.5 - 25,
                            y: plat.y - 14,
                            w: 50,
                            h: 14,
                            bounceForce: 21
                        });
                    }

                    if (Math.random() < levelData.powerupChance) {
                        let pType = powerTypes[Math.floor(Math.random() * powerTypes.length)];
                        powerups.push({
                            x: plat.x + plat.w / 2,
                            y: plat.y - 25,
                            type: pType,
                            r: 16,
                            collected: false
                        });
                    }

                    for (let c = 0; c < 3; c++) {
                        coins.push({
                            x: plat.x + 25 + c * 45,
                            y: plat.y - 25,
                            r: 22,
                            collected: false
                        });
                    }
                }

                if (Math.random() < (levelData.obstacleChance || 0.1)) {
                    let obsX = currentX - levelData.spacing * 0.45;
                    let obsY = currentY + (Math.random() - 0.5) * 200 + 40;
                    let isMoving = Math.random() < 0.5;
                    obstacles.push({
                        x: obsX,
                        y: obsY,
                        originY: obsY,
                        r: 20 + Math.random() * 8,
                        speed: isMoving ? 0.03 + Math.random() * 0.04 : 0,
                        range: isMoving ? 60 + Math.random() * 80 : 0,
                        angle: Math.random() * Math.PI * 2,
                        type: Math.random() < 0.5 ? 'saw' : 'spike'
                    });
                }

                if (i > 0 && Math.random() < 0.7) {
                    let prevA = anchors[i - 1];
                    for (let step = 1; step <= 3; step++) {
                        let t = step / 4;
                        coins.push({
                            x: prevA.x + (currentX - prevA.x) * t,
                            y: prevA.y + (currentY - prevA.y) * t + 120 + Math.sin(t * Math.PI) * 50,
                            r: 22,
                            collected: false
                        });
                    }
                }
            }

            levelEndX = currentX + 350;
        }

        function startSelectedLevel() {
            state = 'playing';
            deathTimer = null;
            uiMenu.classList.add('hidden');
            uiLevel.classList.add('hidden');
            uiEnd.classList.add('hidden');
            uiHUD.classList.remove('hidden');

            setInputMode(isTouchDevice ? 'touch' : inputMode);

            const currentLevel = gdLevels[selectedLevelIdx];
            setTrackByLevel(currentLevel.id);
            generateLevel(currentLevel);

            players = [];
            players.push({
                id: 1, x: 0, y: -25, vx: 5, vy: 0, r: config.playerRadius,
                color: '#3b82f6', isSwinging: false, activeAnchor: null, ropeLength: 0,
                dead: false, grounded: true, speedTimer: 0, magnetTimer: 0,
                lowGravTimer: 0, invertGravTimer: 0
            });

            if (currentMode === 2) {
                uiHudP2.classList.remove('hidden');
                players.push({
                    id: 2, x: -60, y: -25, vx: 5, vy: 0, r: config.playerRadius,
                    color: '#f97316', isSwinging: false, activeAnchor: null, ropeLength: 0,
                    dead: false, grounded: true, speedTimer: 0, magnetTimer: 0,
                    lowGravTimer: 0, invertGravTimer: 0
                });
            } else {
                uiHudP2.classList.add('hidden');
            }

            // Exakte Kamera-Positionierung basierend auf der Spieler-X-Koordinate
            camera.x = players[0].x - canvas.width / 2;
            camera.y = players[0].y - canvas.height * 0.45;
        }

        function updatePhysics() {
            if (state !== 'playing') return;

            obstacles.forEach(obs => {
                if (obs.speed > 0) {
                    obs.angle += obs.speed;
                    obs.y = obs.originY + Math.sin(obs.angle) * obs.range;
                }
            });

            if (players.length === 2 && checkRopeIntersection(players[0], players[1])) {
                players[0].isSwinging = false;
                players[1].isSwinging = false;
                playSound('cut');
                showToast("⚔ SEILE DURCHSCHNITTEN!");

                for (let i = 0; i < 20; i++) {
                    particles.push({
                        x: (players[0].x + players[1].x) / 2,
                        y: (players[0].y + players[1].y) / 2,
                        vx: (Math.random() - 0.5) * 12,
                        vy: (Math.random() - 0.5) * 12,
                        color: '#ffffff',
                        life: 1.0,
                        r: 4
                    });
                }
            }

            players.forEach(p => {
                if (p.dead) return;

                obstacles.forEach(obs => {
                    if (!p.dead && Math.hypot(obs.x - p.x, obs.y - p.y) < p.r + obs.r) {
                        p.dead = true;
                        triggerDeathExplosion(p);
                    }
                });

                if (p.speedTimer > 0) p.speedTimer--;
                if (p.magnetTimer > 0) p.magnetTimer--;
                if (p.lowGravTimer > 0) p.lowGravTimer--;
                if (p.invertGravTimer > 0) p.invertGravTimer--;

                const buffContainer = document.getElementById(`p${p.id}-buffs`);
                if (buffContainer) {
                    let buffs = [];
                    if (p.speedTimer > 0) buffs.push('⚡');
                    if (p.magnetTimer > 0) buffs.push('🧲');
                    if (p.lowGravTimer > 0) buffs.push('🪐');
                    if (p.invertGravTimer > 0) buffs.push('🌀');
                    buffContainer.innerText = buffs.join(' ');
                }

                let speedMultiplier = p.speedTimer > 0 ? 1.5 : 1.0;

                let activeGravity = config.gravity;
                if (p.invertGravTimer > 0) {
                    activeGravity = -config.gravity * 0.5;
                } else if (p.lowGravTimer > 0) {
                    activeGravity = config.gravity * 0.22;
                }

                if (p.isSwinging && p.activeAnchor) {
                    p.grounded = false;

                    if (p.ropeLength > config.minRopeLength) {
                        p.ropeLength = Math.max(config.minRopeLength, p.ropeLength - 1.2);
                    }

                    let dx = p.x - p.activeAnchor.x;
                    let dy = p.y - p.activeAnchor.y;
                    let dist = Math.hypot(dx, dy);

                    p.vy += activeGravity;
                    
                    if (dist > p.ropeLength) {
                        let nx = dx / dist;
                        let ny = dy / dist;
                        let dot = p.vx * nx + p.vy * ny;
                        p.vx -= dot * nx;
                        p.vy -= dot * ny;

                        p.x = p.activeAnchor.x + nx * p.ropeLength;
                        p.y = p.activeAnchor.y + ny * p.ropeLength;

                        p.vx *= 1.008 * speedMultiplier;
                        p.vy *= 1.008 * speedMultiplier;
                    }
                } else {
                    p.vy += activeGravity;
                    p.vx *= config.damping;

                    p.grounded = false;
                    
                    platforms.forEach(plat => {
                        if (p.x + p.r > plat.x && p.x - p.r < plat.x + plat.w) {
                            if (p.y + p.r >= plat.y && p.y - p.r < plat.y + plat.h && p.vy > 0) {
                                p.y = plat.y - p.r;
                                p.vy = 0;
                                p.grounded = true;

                                if (Math.abs(p.vx) < 4) p.vx = 4.5 * speedMultiplier;
                            }
                        }
                    });

                    jumpPads.forEach(jp => {
                        if (p.x + p.r > jp.x && p.x - p.r < jp.x + jp.w) {
                            if (p.y + p.r >= jp.y && p.y - p.r < jp.y + jp.h && p.vy >= 0) {
                                p.vy = -jp.bounceForce;
                                p.isSwinging = false;
                                p.activeAnchor = null;
                                playSound('jumppad');

                                for (let i = 0; i < 12; i++) {
                                    particles.push({
                                        x: p.x, y: jp.y,
                                        vx: (Math.random() - 0.5) * 8,
                                        vy: -Math.random() * 6 - 2,
                                        color: '#22c55e',
                                        life: 1.0,
                                        r: 4
                                    });
                                }
                            }
                        }
                    });
                }

                p.x += p.vx;
                p.y += p.vy;

                if (p.magnetTimer > 0) {
                    powerups.forEach(pw => {
                        if (!pw.collected && Math.hypot(pw.x - p.x, pw.y - p.y) < 250) {
                            pw.x += (p.x - pw.x) * 0.12;
                            pw.y += (p.y - pw.y) * 0.12;
                        }
                    });
                    coins.forEach(c => {
                        if (!c.collected && Math.hypot(c.x - p.x, c.y - p.y) < 250) {
                            c.x += (p.x - c.x) * 0.15;
                            c.y += (p.y - c.y) * 0.15;
                        }
                    });
                }

                powerups.forEach(pw => {
                    if (!pw.collected && Math.hypot(pw.x - p.x, pw.y - p.y) < p.r + pw.r) {
                        pw.collected = true;
                        playSound('powerup');
                        if (pw.type === 'speed') {
                            p.speedTimer = 300;
                            showToast(`⚡ P${p.id} SPEED BOOST!`);
                        } else if (pw.type === 'magnet') {
                            p.magnetTimer = 400;
                            showToast(`🧲 P${p.id} MAGNET!`);
                        } else if (pw.type === 'rocket') {
                            p.vy = -18;
                            p.vx = 18;
                            playSound('win');
                            showToast(`🚀 P${p.id} ROCKET LAUNCH!`);
                        } else if (pw.type === 'low_grav') {
                            p.lowGravTimer = 350;
                            p.invertGravTimer = 0;
                            showToast(`🪐 P${p.id} SCHWERKRAFT MINIMIERT!`);
                        } else if (pw.type === 'invert_grav') {
                            p.invertGravTimer = 300;
                            p.lowGravTimer = 0;
                            showToast(`🌀 P${p.id} ANTI-GRAVITÄT!`);
                        }
                    }
                });

                coins.forEach(c => {
                    if (!c.collected && Math.hypot(c.x - p.x, c.y - p.y) < p.r + c.r) {
                        c.collected = true;
                        totalCoins++;
                        saveProgress();
                        playSound('coin');
                    }
                });

                if (p.y > config.deathY && !p.dead) {
                    p.dead = true;
                    triggerDeathExplosion(p);
                }
            });

            for (let i = particles.length - 1; i >= 0; i--) {
                let pt = particles[i];
                pt.x += pt.vx;
                pt.y += pt.vy;
                pt.life -= 0.025;
                if (pt.life <= 0) particles.splice(i, 1);
            }

            // Exakte Kamera-Führung (Sowohl X als auch Y-Achsennachführung)
            let activePlayers = players.filter(p => !p.dead);
            if (activePlayers.length > 0) {
                let avgX = activePlayers.reduce((sum, p) => sum + p.x, 0) / activePlayers.length;
                let avgY = activePlayers.reduce((sum, p) => sum + p.y, 0) / activePlayers.length;

                let targetCamX = avgX - canvas.width / 2;
                let targetCamY = avgY - canvas.height * 0.5;

                // X-Koordinate direkt setzen, damit der Ball immer exakt in der Mitte bleibt
                camera.x = targetCamX;
                camera.y += (targetCamY - camera.y) * 0.1;
            }

            let maxP = Math.max(...players.map(p => p.x));
            let pct = Math.min(100, Math.max(0, Math.floor((maxP / levelEndX) * 100)));
            document.getElementById('level-progress-bar').style.width = `${pct}%`;
            document.getElementById('level-progress-text').innerText = `${pct}%`;
            document.getElementById('hud-coins').innerText = `🪙 ${totalCoins}`;

            let winner = players.find(p => p.x >= levelEndX);
            if (winner) {
                levelProgress[selectedLevelIdx] = 100;
                saveProgress();
                playSound('win');

                document.getElementById('end-title').innerText = `SPIELER ${winner.id} GEWINNT!`;
                document.getElementById('end-sub').innerText = `Level ${gdLevels[selectedLevelIdx].name} erfolgreich absolviert!`;
                uiEnd.classList.remove('hidden');
                uiEnd.classList.add('flex');
                state = 'end';
            } else if (players.every(p => p.dead)) {
                if (!deathTimer) {
                    deathTimer = setTimeout(() => {
                        startSelectedLevel();
                    }, 1200);
                }
            }
        }

        function drawLevelBackground(lvl, camX, camY) {
            ctx.save();
            let theme = lvl.bg;

            if (theme === "DEMON REALM") {
                let pulse = Math.sin(Date.now() * 0.003) * 0.1 + 0.9;
                let grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
                grad.addColorStop(0, '#050002'); 
                grad.addColorStop(0.5, '#2a0208'); 
                grad.addColorStop(1, '#640d14');
                ctx.fillStyle = grad; 
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.strokeStyle = `rgba(239, 68, 68, ${0.2 * pulse})`; 
                ctx.lineWidth = 2;
                let gridSize = 60;
                let offsetX = -(camX * 0.4) % gridSize, offsetY = -(camY * 0.4) % gridSize;
                for (let x = offsetX; x < canvas.width; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
                for (let y = offsetY; y < canvas.height; y += gridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
            } else if (theme === "DEEP SPACE") {
                let grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
                grad.addColorStop(0, '#020617');
                grad.addColorStop(1, '#0f172a');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                let sunY = canvas.height * 0.3;
                let sunGrad = ctx.createRadialGradient(canvas.width / 2, sunY, 10, canvas.width / 2, sunY, 80);
                sunGrad.addColorStop(0, '#38bdf8');
                sunGrad.addColorStop(1, 'transparent');
                ctx.fillStyle = sunGrad;
                ctx.beginPath();
                ctx.arc(canvas.width / 2, sunY, 75, 0, Math.PI * 2);
                ctx.fill();
            } else if (theme === "CYBER MATRIX") {
                ctx.fillStyle = '#022c22'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = 'rgba(16, 185, 129, 0.15)'; ctx.lineWidth = 1;
                let gridSize = 40;
                let offsetX = -(camX * 0.2) % gridSize, offsetY = -(camY * 0.2) % gridSize;
                for (let x = offsetX; x < canvas.width; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
                for (let y = offsetY; y < canvas.height; y += gridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
            } else if (theme === "LAVA CAVERN") {
                let grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
                grad.addColorStop(0, '#111827'); grad.addColorStop(0.7, '#450a0a'); grad.addColorStop(1, '#991b1b');
                ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
            } else {
                let grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
                grad.addColorStop(0, '#0b0f19'); grad.addColorStop(1, '#1e1b4b');
                ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)'; ctx.lineWidth = 1;
                let gridSize = 50;
                let offsetX = -(camX * 0.3) % gridSize, offsetY = -(camY * 0.3) % gridSize;
                for (let x = offsetX; x < canvas.width; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
                for (let y = offsetY; y < canvas.height; y += gridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
            }
            ctx.restore();
        }

        function draw() {
            let currentLvl = gdLevels[selectedLevelIdx] || gdLevels[0];
            drawLevelBackground(currentLvl, camera.x, camera.y);

            ctx.save();
            ctx.translate(-camera.x, -camera.y);

            let checkW = 30;
            for (let y = -1500; y < 1500; y += checkW) {
                for (let x = 0; x < 2; x++) {
                    ctx.fillStyle = (Math.floor(y / checkW) + x) % 2 === 0 ? '#ffffff' : '#000000';
                    ctx.fillRect(levelEndX + x * checkW, y, checkW, checkW);
                }
            }
            ctx.fillStyle = '#22c55e';
            ctx.font = '900 36px sans-serif';
            ctx.fillText("ZIEL", levelEndX - 20, -100);

            ctx.save();
            let lavaGrad = ctx.createLinearGradient(0, config.deathY, 0, config.deathY + 800);
            lavaGrad.addColorStop(0, 'rgba(239, 68, 68, 0.85)');
            lavaGrad.addColorStop(0.25, 'rgba(185, 28, 28, 0.95)');
            lavaGrad.addColorStop(1, 'rgba(127, 29, 29, 1)');
            ctx.fillStyle = lavaGrad;
            ctx.fillRect(camera.x - 1000, config.deathY, canvas.width + 2000, 2500);

            ctx.strokeStyle = '#f87171';
            ctx.lineWidth = 6;
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.moveTo(camera.x - 1000, config.deathY);
            ctx.lineTo(camera.x + canvas.width + 1000, config.deathY);
            ctx.stroke();
            ctx.restore();

            anchors.forEach(a => {
                ctx.beginPath();
                ctx.arc(a.x, a.y, 11, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = '#38bdf8';
                ctx.shadowBlur = 15;
                ctx.fill();
                ctx.shadowBlur = 0;
            });

            players.forEach(p => {
                if (p.isSwinging && p.activeAnchor && !p.dead) {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p.activeAnchor.x, p.activeAnchor.y);
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 3;
                    ctx.stroke();
                }
            });

            platforms.forEach(plat => {
                ctx.fillStyle = '#334155';
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.roundRect(plat.x, plat.y, plat.w, plat.h, 8);
                ctx.fill();
                ctx.stroke();
            });

            jumpPads.forEach(jp => {
                ctx.save();
                ctx.fillStyle = '#16a34a';
                ctx.strokeStyle = '#4ade80';
                ctx.lineWidth = 3;
                ctx.shadowColor = '#22c55e';
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.roundRect(jp.x, jp.y, jp.w, jp.h, 6);
                ctx.fill();
                ctx.stroke();

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(jp.x + 10, jp.y + jp.h - 3);
                ctx.lineTo(jp.x + jp.w / 2, jp.y + 3);
                ctx.lineTo(jp.x + jp.w - 10, jp.y + jp.h - 3);
                ctx.stroke();
                ctx.restore();
            });

            obstacles.forEach(obs => {
                ctx.save();
                ctx.translate(obs.x, obs.y);
                
                ctx.shadowColor = '#ef4444';
                ctx.shadowBlur = 15;

                if (obs.type === 'saw') {
                    let rotAngle = Date.now() * 0.005 + obs.angle;
                    ctx.rotate(rotAngle);
                    ctx.fillStyle = '#dc2626';
                    ctx.beginPath();
                    ctx.arc(0, 0, obs.r, 0, Math.PI * 2);
                    ctx.fill();
                    
                    ctx.fillStyle = '#fca5a5';
                    for (let s = 0; s < 8; s++) {
                        let a = (s * Math.PI) / 4;
                        ctx.beginPath();
                        ctx.moveTo(Math.cos(a) * (obs.r - 2), Math.sin(a) * (obs.r - 2));
                        ctx.lineTo(Math.cos(a + 0.2) * (obs.r + 9), Math.sin(a + 0.2) * (obs.r + 9));
                        ctx.lineTo(Math.cos(a + 0.4) * (obs.r - 2), Math.sin(a + 0.4) * (obs.r - 2));
                        ctx.fill();
                    }
                } else {
                    ctx.fillStyle = '#991b1b';
                    ctx.strokeStyle = '#f87171';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(0, 0, obs.r, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();

                    ctx.fillStyle = '#ef4444';
                    for (let s = 0; s < 6; s++) {
                        let a = (s * Math.PI) / 3 + Date.now() * 0.002;
                        ctx.beginPath();
                        ctx.moveTo(Math.cos(a - 0.25) * obs.r, Math.sin(a - 0.25) * obs.r);
                        ctx.lineTo(Math.cos(a) * (obs.r + 10), Math.sin(a) * (obs.r + 10));
                        ctx.lineTo(Math.cos(a + 0.25) * obs.r, Math.sin(a + 0.25) * obs.r);
                        ctx.fill();
                    }
                }
                ctx.restore();
            });

            coins.forEach(c => {
                if (c.collected) return;
                ctx.beginPath();
                ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                ctx.fillStyle = '#eab308';
                ctx.shadowColor = '#eab308';
                ctx.shadowBlur = 12;
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 18px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🪙', c.x, c.y);
            });

            powerups.forEach(pw => {
                if (pw.collected) return;
                ctx.beginPath();
                ctx.arc(pw.x, pw.y, pw.r, 0, Math.PI * 2);
                ctx.fillStyle = pw.type === 'speed' ? '#eab308' : 
                                pw.type === 'magnet' ? '#a855f7' : 
                                pw.type === 'rocket' ? '#ef4444' : 
                                pw.type === 'low_grav' ? '#38bdf8' : '#ec4899';
                ctx.shadowColor = ctx.fillStyle;
                ctx.shadowBlur = 12;
                ctx.fill();
                ctx.shadowBlur = 0;

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                let symbol = pw.type === 'speed' ? '⚡' : 
                             pw.type === 'magnet' ? '🧲' : 
                             pw.type === 'rocket' ? '🚀' : 
                             pw.type === 'low_grav' ? '🪐' : '🌀';
                ctx.fillText(symbol, pw.x, pw.y);
            });

            particles.forEach(pt => {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
                ctx.fillStyle = pt.color;
                ctx.globalAlpha = pt.life;
                ctx.fill();
                ctx.globalAlpha = 1;
            });

            players.forEach(p => {
                if (p.dead) return;

                if (!p.isSwinging && state === 'playing') {
                    let bestAnchor = null;
                    let minDist = config.maxAttachDist;
                    anchors.forEach(a => {
                        if (a.x > p.x - 50) {
                            let d = Math.hypot(p.x - a.x, p.y - a.y);
                            if (d < minDist) { minDist = d; bestAnchor = a; }
                        }
                    });
                    if (bestAnchor) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(bestAnchor.x, bestAnchor.y);
                        ctx.strokeStyle = '#ffffff';
                        ctx.globalAlpha = 0.35;
                        ctx.lineWidth = 2;
                        ctx.setLineDash([6, 6]);
                        ctx.stroke();
                        ctx.restore();
                    }
                }

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.beginPath();
                ctx.arc(0, 0, p.r, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.fill();
                ctx.restore();
            });

            ctx.restore();
        }

        function updateGamepad() {
            if (state !== 'playing') return;
            const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
            if (!gamepads) return;

            for (let i = 0; i < gamepads.length; i++) {
                const gp = gamepads[i];
                if (!gp) continue;
                
                let pIndex = i < players.length ? i : 0;
                let isPressed = gp.buttons[0]?.pressed || gp.buttons[7]?.pressed || gp.buttons[5]?.pressed || gp.axes[1] < -0.5;
                
                if (isPressed) {
                    setInputMode('gamepad');
                    attachGrapple(pIndex);
                } else {
                    detachGrapple(pIndex);
                }
            }
        }

        let keysDown = {};
        window.addEventListener('keydown', (e) => {
            setInputMode('keyboard');
            keysDown[e.code] = true;
            if (e.repeat) return;
            initAudio();

            if (e.code === 'Space' || e.code === 'KeyW') {
                attachGrapple(0);
            }
            if (e.code === 'ArrowUp' || e.code === 'Enter') {
                if (currentMode === 2) attachGrapple(1);
                else attachGrapple(0);
            }

            if (state === 'levelSelect') {
                if (e.code === 'ArrowLeft') changeLevelCard(-1);
                if (e.code === 'ArrowRight') changeLevelCard(1);
                if (e.code === 'Space' || e.code === 'Enter') startSelectedLevel();
            }
        });

        window.addEventListener('keyup', (e) => {
            keysDown[e.code] = false;
            if (e.code === 'Space' || e.code === 'KeyW') detachGrapple(0);
            if (e.code === 'ArrowUp' || e.code === 'Enter') {
                if (currentMode === 2) detachGrapple(1);
                else detachGrapple(0);
            }
        });

        // Vollständiger Touch- & Pointer-Event Handler
        window.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch' || e.pointerType === 'pen') {
                setInputMode('touch');
            }
        });

        window.addEventListener('touchstart', (e) => {
            setInputMode('touch');
            initAudio();
            if (state !== 'playing') return;

            // Direct Touch Steuerung überall auf dem Bildschirmschirm (ausgenommen Buttons)
            if (e.target.closest('.interactive')) return;

            for (let i = 0; i < e.changedTouches.length; i++) {
                let touch = e.changedTouches[i];
                if (currentMode === 2) {
                    if (touch.clientX < window.innerWidth / 2) {
                        attachGrapple(0);
                    } else {
                        attachGrapple(1);
                    }
                } else {
                    attachGrapple(0);
                }
            }
        }, { passive: true });

        window.addEventListener('touchend', (e) => {
            if (state !== 'playing') return;
            if (e.target.closest('.interactive')) return;

            for (let i = 0; i < e.changedTouches.length; i++) {
                let touch = e.changedTouches[i];
                if (currentMode === 2) {
                    if (touch.clientX < window.innerWidth / 2) {
                        detachGrapple(0);
                    } else {
                        detachGrapple(1);
                    }
                } else {
                    detachGrapple(0);
                }
            }
        });

        // Setup Virtual Touch Buttons (nur im 2-Spieler-Modus aktiv)
        const btnP1 = document.getElementById('touch-btn-p1');
        const btnP2 = document.getElementById('touch-btn-p2');

        if (btnP1) {
            btnP1.addEventListener('touchstart', (e) => { e.stopPropagation(); setInputMode('touch'); attachGrapple(0); }, { passive: true });
            btnP1.addEventListener('touchend', (e) => { e.stopPropagation(); detachGrapple(0); }, { passive: true });
            btnP1.addEventListener('mousedown', (e) => { e.stopPropagation(); attachGrapple(0); });
            btnP1.addEventListener('mouseup', (e) => { e.stopPropagation(); detachGrapple(0); });
        }
        if (btnP2) {
            btnP2.addEventListener('touchstart', (e) => { e.stopPropagation(); setInputMode('touch'); attachGrapple(1); }, { passive: true });
            btnP2.addEventListener('touchend', (e) => { e.stopPropagation(); detachGrapple(1); }, { passive: true });
            btnP2.addEventListener('mousedown', (e) => { e.stopPropagation(); attachGrapple(1); });
            btnP2.addEventListener('mouseup', (e) => { e.stopPropagation(); detachGrapple(1); });
        }

        function gameLoop() {
            updateGamepad();
            updatePhysics();
            draw();
            requestAnimationFrame(gameLoop);
        }

        window.onload = function() {
            setTrackByLevel(1);
            gameLoop();
        };
    
