        // CAMPAIGN LEVELS CONFIGURATION (50 LEVELS)
        const campaignLevels = [];
        for (let i = 1; i <= 50; i++) {
            const diff = Math.ceil(i / 5); // Level 1-50 -> Stärke 1-10
            campaignLevels.push({
                id: i,
                title: `Level ${i}`,
                desc: i <= 15 ? "Anfänger-Herausforderung" : (i <= 35 ? "Taktische Partie" : "Meister-Herausforderung"),
                diff: diff,
                mode: 'pvai'
            });
        }

        let userProgress = {
            unlockedLevel: 1,
            completedLevels: {}
        };

        const game = new Chess();
        let selectedSquare = null;
        let possibleMoves = [];
        let pendingPromotion = null;
        let gameMode = 'pvai'; 
        let aiDifficulty = 2; 
        let playerColor = 'w';
        let soundEnabled = true;
        let activeCampaignLevel = null;
        let myColor = 'w';      // im Multiplayer ggf. 'b'
        let mpConn = null, mpPeer = null, mpActive = false, mpGameOver = false;

        // Multiplayer Timer variables
        let mpTimedGame = false;
        let mpTimeSeconds = 300;
        let whiteTime = 300;
        let blackTime = 300;
        let timerInterval = null;

        const PIECE_UNICODE = {
            'w': { 'p': '♙', 'r': '♖', 'n': '♘', 'b': '♗', 'q': '♕', 'k': '♔' },
            'b': { 'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚' }
        };

        const PIECE_VALUES = {
            'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 200
        };

        function playSound(type) {
            if (!soundEnabled) return;
            try {
                if (Tone.context.state !== 'running') {
                    Tone.start();
                }
                const synth = new Tone.Synth({
                    oscillator: { type: 'sine' },
                    envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 }
                }).toDestination();

                if (type === 'move') {
                    synth.triggerAttackRelease('C4', '8n');
                } else if (type === 'capture') {
                    synth.triggerAttackRelease('G4', '8n');
                } else if (type === 'check') {
                    synth.triggerAttackRelease('E5', '8n');
                } else if (type === 'gameover') {
                    synth.triggerAttackRelease('C3', '4n');
                } else if (type === 'defeat') {
                    const now = Tone.now();
                    synth.triggerAttackRelease('G3', '8n', now);
                    synth.triggerAttackRelease('E3', '8n', now + 0.15);
                    synth.triggerAttackRelease('C3', '4n', now + 0.3);
                }
            } catch (e) {}
        }

        const campaignScreen = document.getElementById('campaignScreen');
        const mapMainView = document.getElementById('mapMainView');
        const levelMapContainer = document.getElementById('levelMapContainer');
        const mainMapLine = document.getElementById('mainMapLine');
        const subLevelView = document.getElementById('subLevelView');
        const subLevelListContainer = document.getElementById('subLevelListContainer');
        const subMapLine = document.getElementById('subMapLine');
        const subLevelTitle = document.getElementById('subLevelTitle');
        const backToMapBtn = document.getElementById('backToMapBtn');

        const totalStarsCount = document.getElementById('totalStarsCount');
        const quickPlayBtn = document.getElementById('quickPlayBtn');
        const openCampaignBtn = document.getElementById('openCampaignBtn');
        const backToCampaignBtn = document.getElementById('backToCampaignBtn');
        const startScreen = document.getElementById('startScreen');
        const startGameBtn = document.getElementById('startGameBtn');
        const startModeAiBtn = document.getElementById('startModeAiBtn');
        const startModePvpBtn = document.getElementById('startModePvpBtn');
        const startAiSettings = document.getElementById('startAiSettings');
        const startDifficultySelect = document.getElementById('startDifficultySelect');
        const themeSelect = document.getElementById('themeSelect');
        const startDifficultyName = document.getElementById('startDifficultyName');
        const startDifficultyValue = document.getElementById('startDifficultyValue');
        const LEVEL_NAMES = ['','Anfänger','Gelegenheitsspieler','Hobbyspieler','Vereinsspieler','Fortgeschritten','Stark','Experte','Meister','Internationaler Meister','Großmeister'];

        const mpUseTimer = document.getElementById('mpUseTimer');
        const mpTimeChoice = document.getElementById('mpTimeChoice');
        const mpTimerSelectContainer = document.getElementById('mpTimerSelectContainer');
        const hostTimeConfig = document.getElementById('hostTimeConfig');

        function applyTheme(t) {
            boardContainer.className = `relative w-full aspect-square bg-neutral-900 rounded-2xl shadow-2xl p-2 sm:p-3 border border-neutral-800 ${t}`;
            try { localStorage.setItem('chessTheme', t); } catch (e) {}
        }

        const boardContainer = document.getElementById('boardContainer');
        const boardElement = document.getElementById('board');
        const overlayNewGameBtn = document.getElementById('overlayNewGameBtn');
        const headerTitle = document.getElementById('headerTitle');

        window.addEventListener('DOMContentLoaded', () => {
            renderCampaignMap();
            initStartScreen();
            initBoard();
            setupEventListeners();
        });

        function renderCampaignMap() {
            levelMapContainer.innerHTML = '';
            subLevelView.classList.add('hidden');
            mapMainView.classList.remove('hidden');
            mapMainView.style.transform = 'scale(1)';
            mapMainView.style.opacity = '1';

            let visibleStagesCount = 0;

            for (let stageId = 1; stageId <= 10; stageId++) {
                const startLvl = (stageId - 1) * 5 + 1;
                const endLvl = stageId * 5;

                const isUnlocked = startLvl <= userProgress.unlockedLevel;
                if (!isUnlocked) continue;

                visibleStagesCount++;
                let stageCompleted = true;
                for (let l = startLvl; l <= endLvl; l++) {
                    if (!userProgress.completedLevels[l]) {
                        stageCompleted = false;
                        break;
                    }
                }

                const isLeft = (stageId - 1) % 2 === 0;
                const alignmentClass = isLeft ? "self-start mr-auto pl-2 flex-row" : "self-end ml-auto pr-2 flex-row-reverse text-right";

                const rowWrapper = document.createElement('div');
                rowWrapper.className = `w-3/4 flex items-center gap-4 ${alignmentClass}`;

                const btn = document.createElement('button');
                let btnBg = "bg-neutral-800 border-neutral-700 text-neutral-500 cursor-not-allowed";
                let iconClass = "fa-solid fa-lock text-2xl";

                if (stageCompleted) {
                    btnBg = "bg-yellow-500 hover:bg-yellow-400 border-yellow-300 text-neutral-950 shadow-lg shadow-yellow-500/30";
                    iconClass = "fa-solid fa-trophy text-2xl";
                } else {
                    btnBg = "bg-indigo-600 hover:bg-indigo-500 border-indigo-400 text-white shadow-xl shadow-indigo-600/40 animate-pulse";
                    iconClass = "fa-solid fa-chess text-2xl";
                }

                btn.className = `w-20 h-20 rounded-full border-4 flex flex-col items-center justify-center transition-all transform hover:scale-105 shrink-0 ${btnBg}`;
                btn.innerHTML = `<i class="${iconClass}"></i><span class="text-[10px] font-bold mt-0.5">Stufe ${stageId}</span>`;

                btn.addEventListener('click', (e) => {
                    openStageDetails(stageId, startLvl, endLvl, btn);
                });

                const infoDiv = document.createElement('div');
                infoDiv.className = `flex flex-col ${isLeft ? 'text-left' : 'text-right'}`;
                infoDiv.innerHTML = `
                    <div class="text-sm font-bold text-white">Stufe ${stageId}</div>
                    <div class="text-xs text-neutral-400 max-w-[160px]">Level ${startLvl}-${endLvl}</div>
                `;

                rowWrapper.appendChild(btn);
                rowWrapper.appendChild(infoDiv);
                levelMapContainer.appendChild(rowWrapper);
            }

            if (visibleStagesCount > 0) {
                mainMapLine.classList.remove('hidden');
                setTimeout(() => {
                    const firstNode = levelMapContainer.firstElementChild;
                    const lastNode = levelMapContainer.lastElementChild;
                    if (firstNode && lastNode) {
                        const topOffset = firstNode.offsetTop + firstNode.offsetHeight / 2;
                        const bottomOffset = lastNode.offsetTop + lastNode.offsetHeight / 2;
                        mainMapLine.style.top = `${topOffset}px`;
                        mainMapLine.style.height = `${Math.max(0, bottomOffset - topOffset)}px`;
                    }
                }, 10);
            } else {
                mainMapLine.classList.add('hidden');
            }
        }

        function openStageDetails(stageId, startLvl, endLvl, clickedBtn) {
            const btnRect = clickedBtn.getBoundingClientRect();
            const parentRect = campaignScreen.getBoundingClientRect();
            const xPercent = ((btnRect.left + btnRect.width / 2 - parentRect.left) / parentRect.width) * 100;
            const yPercent = ((btnRect.top + btnRect.height / 2 - parentRect.top) / parentRect.height) * 100;

            mapMainView.style.transformOrigin = `${xPercent}% ${yPercent}%`;
            mapMainView.style.transform = 'scale(2.2)';
            mapMainView.style.opacity = '0';

            setTimeout(() => {
                mapMainView.classList.add('hidden');
                mapMainView.style.transform = 'scale(1)';
                mapMainView.style.opacity = '1';

                subLevelView.classList.remove('hidden');
                subLevelView.style.transformOrigin = `${xPercent}% ${yPercent}%`;
                subLevelView.style.transform = 'scale(2.2)';
                subLevelView.style.opacity = '0';

                subLevelTitle.innerText = `Stufe ${stageId} (Level ${startLvl}-${endLvl})`;
                subLevelListContainer.innerHTML = '';

                let idx = 0;
                let visibleSubCount = 0;
                for (let lId = startLvl; lId <= endLvl; lId++) {
                    const lvl = campaignLevels.find(l => l.id === lId);
                    if (!lvl) continue;

                    const isUnlocked = lId <= userProgress.unlockedLevel;
                    if (!isUnlocked) continue;

                    visibleSubCount++;
                    const isCompleted = userProgress.completedLevels[lId] !== undefined;

                    const isLeft = idx % 2 === 0;
                    const alignmentClass = isLeft ? "self-start mr-auto pl-2 flex-row" : "self-end ml-auto pr-2 flex-row-reverse text-right";

                    const rowWrapper = document.createElement('div');
                    rowWrapper.className = `w-3/4 flex items-center gap-4 ${alignmentClass}`;

                    const btn = document.createElement('button');
                    let btnBg = "bg-neutral-800 border-neutral-700 text-neutral-500 cursor-not-allowed";
                    let iconClass = "fa-solid fa-lock text-2xl";

                    if (isCompleted) {
                        btnBg = "bg-yellow-500 hover:bg-yellow-400 border-yellow-300 text-neutral-950 shadow-lg shadow-yellow-500/30";
                        iconClass = "fa-solid fa-trophy text-2xl";
                    } else {
                        btnBg = "bg-indigo-600 hover:bg-indigo-500 border-indigo-400 text-white shadow-xl shadow-indigo-600/40 animate-pulse";
                        iconClass = "fa-solid fa-play text-2xl";
                    }

                    btn.className = `w-20 h-20 rounded-full border-4 flex flex-col items-center justify-center transition-all transform hover:scale-105 shrink-0 ${btnBg}`;
                    btn.innerHTML = `<i class="${iconClass}"></i><span class="text-[10px] font-bold mt-0.5">Lvl ${lId}</span>`;

                    btn.addEventListener('click', () => {
                        startCampaignLevel(lvl);
                    });

                    const infoDiv = document.createElement('div');
                    infoDiv.className = `flex flex-col ${isLeft ? 'text-left' : 'text-right'}`;
                    infoDiv.innerHTML = `
                        <div class="text-sm font-bold text-white">Level ${lId}</div>
                        <div class="text-xs text-neutral-400 max-w-[160px]">Stufe ${lvl.diff} (KI)</div>
                    `;

                    rowWrapper.appendChild(btn);
                    rowWrapper.appendChild(infoDiv);
                    subLevelListContainer.appendChild(rowWrapper);
                    idx++;
                }

                if (visibleSubCount > 0) {
                    subMapLine.classList.remove('hidden');
                    setTimeout(() => {
                        const firstNode = subLevelListContainer.firstElementChild;
                        const lastNode = subLevelListContainer.lastElementChild;
                        if (firstNode && lastNode) {
                            const topOffset = firstNode.offsetTop + firstNode.offsetHeight / 2;
                            const bottomOffset = lastNode.offsetTop + lastNode.offsetHeight / 2;
                            subMapLine.style.top = `${topOffset}px`;
                            subMapLine.style.height = `${Math.max(0, bottomOffset - topOffset)}px`;
                        }
                    }, 10);
                } else {
                    subMapLine.classList.add('hidden');
                }

                setTimeout(() => {
                    subLevelView.style.transform = 'scale(1)';
                    subLevelView.style.opacity = '1';
                }, 30);
            }, 300);
        }

        backToMapBtn.addEventListener('click', () => {
            subLevelView.style.transform = 'scale(1.8)';
            subLevelView.style.opacity = '0';
            setTimeout(() => {
                subLevelView.classList.add('hidden');
                subLevelView.style.transform = 'scale(1)';
                subLevelView.style.opacity = '1';

                mapMainView.classList.remove('hidden');
                mapMainView.style.transform = 'scale(1.8)';
                mapMainView.style.opacity = '0';
                setTimeout(() => {
                    mapMainView.style.transform = 'scale(1)';
                    mapMainView.style.opacity = '1';
                }, 30);
            }, 300);
        });

        function startCampaignLevel(lvl) {
            activeCampaignLevel = lvl;
            gameMode = lvl.mode;
            aiDifficulty = lvl.diff;
            headerTitle.innerText = `${lvl.title} (Stufe)`;

            campaignScreen.classList.add('transition-opacity', 'duration-300', 'opacity-0');
            setTimeout(() => {
                campaignScreen.classList.add('hidden');
                campaignScreen.classList.remove('opacity-0');
                resetGame();
            }, 300);
        }

        function initStartScreen() {
            let saved = null;
            try { saved = localStorage.getItem('chessTheme'); } catch (e) {}
            if (saved) themeSelect.value = saved;
            applyTheme(themeSelect.value);
            themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));
            startDifficultySelect.addEventListener('input', () => {
                const v = parseInt(startDifficultySelect.value);
                startDifficultyName.innerText = `Stärke ${v} – ${LEVEL_NAMES[v]}`;
                startDifficultyValue.innerText = `${v} / 10`;
            });
            
            mpUseTimer.addEventListener('change', () => {
                mpTimerSelectContainer.classList.toggle('hidden', !mpUseTimer.checked);
            });

            document.getElementById('multiplayerBtn').addEventListener('click', startQueue);
            document.getElementById('queueCancelBtn').addEventListener('click', cancelQueue);
            quickPlayBtn.addEventListener('click', () => {
                leaveMultiplayer();
                campaignScreen.classList.add('hidden');
                startScreen.classList.remove('hidden');
            });

            backToCampaignBtn.addEventListener('click', () => {
                startScreen.classList.add('hidden');
                campaignScreen.classList.remove('hidden');
            });

            openCampaignBtn.addEventListener('click', () => {
                leaveMultiplayer();
                activeCampaignLevel = null;
                resetGame();
                renderCampaignMap();
                campaignScreen.classList.remove('hidden');
            });

            startModeAiBtn.addEventListener('click', () => {
                gameMode = 'pvai';
                startModeAiBtn.className = "p-3.5 rounded-xl border-2 border-white bg-white/10 flex flex-col items-center gap-2 transition hover:bg-white/20 text-white font-medium";
                startModePvpBtn.className = "p-3.5 rounded-xl border-2 border-neutral-700 bg-neutral-800/50 flex flex-col items-center gap-2 transition hover:border-neutral-600 text-neutral-400 font-medium";
                startAiSettings.classList.remove('hidden');
            });

            startModePvpBtn.addEventListener('click', () => {
                gameMode = 'pvp';
                startModePvpBtn.className = "p-3.5 rounded-xl border-2 border-white bg-white/10 flex flex-col items-center gap-2 transition hover:bg-white/20 text-white font-medium";
                startModeAiBtn.className = "p-3.5 rounded-xl border-2 border-neutral-700 bg-neutral-800/50 flex flex-col items-center gap-2 transition hover:border-neutral-600 text-neutral-400 font-medium";
                startAiSettings.classList.add('hidden');
            });

            startGameBtn.addEventListener('click', () => {
                leaveMultiplayer();
                aiDifficulty = parseInt(startDifficultySelect.value);
                activeCampaignLevel = null;
                headerTitle.innerText = "Freies Spiel";

                startScreen.classList.add('transition-opacity', 'duration-300', 'opacity-0');
                setTimeout(() => {
                    startScreen.classList.add('hidden');
                    startScreen.classList.remove('opacity-0');
                    resetGame();
                }, 300);
            });
        }


        // ===== MULTIPLAYER (PeerJS) =====
        const QUEUE_ID = 'schach-queue-v1-slot';
        const queueModal = document.getElementById('queueModal');
        const queueStatus = document.getElementById('queueStatus');
        const queueIcon = document.getElementById('queueIcon');
        let queueTimer = null;

        function setQueueMsg(msg, spin = true) {
            queueStatus.innerText = msg;
            queueIcon.className = spin ? 'fa-solid fa-spinner fa-spin text-3xl text-indigo-400 mb-3' : 'fa-solid fa-triangle-exclamation text-3xl text-red-400 mb-3';
        }

        function closePeer() {
            clearTimeout(queueTimer);
            try { if (mpConn) mpConn.close(); } catch (e) {}
            try { if (mpPeer) mpPeer.destroy(); } catch (e) {}
            mpConn = null; mpPeer = null;
            hostTimeConfig.classList.add('hidden');
        }

        function startQueue() {
            closePeer();
            mpActive = false;
            queueModal.classList.remove('hidden');
            setQueueMsg('Suche Gegner...');
            tryAsWaiter();
        }

        function cancelQueue() {
            closePeer();
            queueModal.classList.add('hidden');
        }

        function tryAsWaiter() {
            const peer = new Peer(QUEUE_ID);
            mpPeer = peer;
            peer.on('open', () => {
                setQueueMsg('In der Queue – Du bist der Host!');
                hostTimeConfig.classList.remove('hidden');
            });
            peer.on('connection', (conn) => {
                if (mpConn) { conn.close(); return; }
                mpConn = conn;
                conn.on('open', () => {
                    const lobby = peer;
                    const timed = mpUseTimer.checked;
                    const secs = timed ? parseInt(mpTimeChoice.value) : 0;
                    
                    conn.send({ type: 'config', timed: timed, seconds: secs });
                    beginMultiplayer('w', conn, timed, secs);
                    try { lobby.disconnect(); } catch (e) {}
                });
            });
            peer.on('error', (err) => {
                if (err.type === 'unavailable-id') {
                    try { peer.destroy(); } catch (e) {}
                    mpPeer = null;
                    tryAsGuest();
                } else if (!mpActive) {
                    setQueueMsg('Verbindungsfehler: ' + err.type, false);
                }
            });
        }

        function tryAsGuest() {
            hostTimeConfig.classList.add('hidden');
            setQueueMsg('Gegner gefunden, verbinde...');
            const peer = new Peer();
            mpPeer = peer;
            let connected = false;
            peer.on('open', () => {
                const conn = peer.connect(QUEUE_ID, { reliable: true });
                mpConn = conn;
                conn.on('open', () => { 
                    connected = true; 
                });
                conn.on('data', (d) => {
                    if (d && d.type === 'config') {
                        beginMultiplayer('b', conn, d.timed, d.seconds);
                    }
                });
                queueTimer = setTimeout(() => {
                    if (!connected && !mpActive) { closePeer(); tryAsWaiter(); }
                }, 5000);
            });
            peer.on('error', (err) => {
                if (mpActive) return;
                if (err.type === 'peer-unavailable') { closePeer(); setTimeout(tryAsWaiter, 300); }
                else setQueueMsg('Verbindungsfehler: ' + err.type, false);
            });
        }

        function beginMultiplayer(color, conn, timed = false, seconds = 0) {
            clearTimeout(queueTimer);
            mpConn = conn;
            mpActive = true;
            mpGameOver = false;
            myColor = color;
            gameMode = 'pvp';
            activeCampaignLevel = null;

            mpTimedGame = timed;
            mpTimeSeconds = seconds;
            whiteTime = seconds;
            blackTime = seconds;

            headerTitle.innerText = timed ? `Multiplayer (${formatTime(seconds)})` : 'Multiplayer';
            queueModal.classList.add('hidden');
            campaignScreen.classList.add('hidden');
            startScreen.classList.add('hidden');
            resetGame();

            conn.on('data', (d) => {
                if (!d) return;
                if (d.type === 'move' && game.turn() !== myColor) {
                    const mv = game.moves({ verbose: true }).find(m => m.from === d.from && m.to === d.to && (!m.promotion || m.promotion === (d.promotion || 'q')));
                    if (mv) { if (d.promotion) mv.promotion = d.promotion; executeMove(mv, true); }
                } else if (d.type === 'resign') {
                    mpGameOver = myColor === 'w' ? 'b' : 'w';
                    handleGameOver();
                } else if (d.type === 'timeout') {
                    mpGameOver = d.color;
                    handleGameOver(true);
                }
            });
            conn.on('close', () => {
                if (mpActive && !isGameOverState()) {
                    const ov = document.getElementById('gameOverlay');
                    document.getElementById('overlayTitle').innerText = 'Gegner hat die Verbindung verloren';
                    document.getElementById('overlayTitle').className = 'text-xl font-bold text-white mb-6';
                    document.getElementById('overlayIcon').classList.add('hidden');
                    ov.classList.remove('hidden');
                    mpGameOver = true;
                    stopTimer();
                }
            });

            if (mpTimedGame) {
                startTimer();
            }
        }

        function formatTime(s) {
            const mins = Math.floor(s / 60);
            const secs = s % 60;
            return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }

        function startTimer() {
            stopTimer();
            if (!mpTimedGame) return;
            timerInterval = setInterval(() => {
                if (isGameOverState()) {
                    stopTimer();
                    return;
                }
                const turn = game.turn();
                if (turn === 'w') {
                    whiteTime--;
                    if (whiteTime <= 0) {
                        whiteTime = 0;
                        stopTimer();
                        mpGameOver = 'w';
                        if (mpActive && mpConn && mpConn.open) {
                            try { mpConn.send({ type: 'timeout', color: 'w' }); } catch(e){}
                        }
                        handleGameOver(true);
                    }
                } else {
                    blackTime--;
                    if (blackTime <= 0) {
                        blackTime = 0;
                        stopTimer();
                        mpGameOver = 'b';
                        if (mpActive && mpConn && mpConn.open) {
                            try { mpConn.send({ type: 'timeout', color: 'b' }); } catch(e){}
                        }
                        handleGameOver(true);
                    }
                }
                updateTimerUI();
            }, 1000);
        }

        function stopTimer() {
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = null;
        }

        function updateTimerUI() {
            const topTimer = document.getElementById('topTimer');
            const bottomTimer = document.getElementById('bottomTimer');
            const topTimerVal = document.getElementById('topTimerVal');
            const bottomTimerVal = document.getElementById('bottomTimerVal');

            if (!mpTimedGame) {
                topTimer.classList.add('hidden');
                bottomTimer.classList.add('hidden');
                return;
            }

            topTimer.classList.remove('hidden');
            bottomTimer.classList.remove('hidden');

            const fl = myColor === 'b';
            topTimerVal.innerText = formatTime(fl ? whiteTime : blackTime);
            bottomTimerVal.innerText = formatTime(fl ? blackTime : whiteTime);
        }

        function leaveMultiplayer() {
            stopTimer();
            if (mpActive && mpConn && mpConn.open && !game.game_over() && !mpGameOver) {
                try { mpConn.send({ type: 'resign' }); } catch (e) {}
            }
            closePeer();
            mpActive = false;
            mpGameOver = false;
            mpTimedGame = false;
            myColor = 'w';
            queueModal.classList.add('hidden');
        }

        function setupEventListeners() {
            overlayNewGameBtn.addEventListener('click', () => {
                const overlay = document.getElementById('gameOverlay');
                overlay.classList.add('hidden');
                if (mpActive) {
                    leaveMultiplayer();
                    campaignScreen.classList.remove('hidden');
                } else if (activeCampaignLevel) {
                    renderCampaignMap();
                    campaignScreen.classList.remove('hidden');
                } else {
                    resetGame();
                }
            });
        }

        function initBoard() {
            renderBoard();
        }

        function renderBoard() {
            boardElement.innerHTML = '';
            const fenBoard = game.board();

            const flip = mpActive && myColor === 'b';
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const row = flip ? 7 - r : r;
                    const col = flip ? 7 - c : c;

                    const squareName = String.fromCharCode(97 + col) + (8 - row);
                    const piece = fenBoard[row][col];
                    const isLight = (row + col) % 2 === 0;

                    const squareDiv = document.createElement('div');
                    squareDiv.className = `board-square ${isLight ? 'square-light' : 'square-dark'} flex items-center justify-center relative cursor-pointer`;
                    squareDiv.dataset.square = squareName;

                    if (c === 0) {
                        const rankSpan = document.createElement('span');
                        rankSpan.className = 'absolute top-0.5 left-1 text-[10px] font-semibold opacity-60 pointer-events-none';
                        rankSpan.innerText = 8 - row;
                        squareDiv.appendChild(rankSpan);
                    }
                    if (r === 7) {
                        const fileSpan = document.createElement('span');
                        fileSpan.className = 'absolute bottom-0.5 right-1 text-[10px] font-semibold opacity-60 pointer-events-none';
                        fileSpan.innerText = String.fromCharCode(97 + col);
                        squareDiv.appendChild(fileSpan);
                    }

                    if (selectedSquare === squareName) {
                        squareDiv.classList.add('square-selected');
                    }

                    if (piece) {
                        const pieceDiv = document.createElement('div');
                        pieceDiv.className = 'chess-piece select-none flex items-center justify-center w-full h-full text-3xl sm:text-4xl md:text-5xl';
                        pieceDiv.innerText = PIECE_UNICODE[piece.color][piece.type];
                        pieceDiv.style.color = piece.color === 'w' ? '#ffffff' : '#000000';
                        if (piece.color === 'w') {
                            pieceDiv.style.textShadow = '0 2px 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.9)';
                        }
                        
                        if (piece.type === 'k') {
                            pieceDiv.id = `king-${piece.color}`;
                        }

                        squareDiv.appendChild(pieceDiv);
                    }

                    const moveOption = possibleMoves.find(m => m.to === squareName);
                    if (moveOption) {
                        const indicator = document.createElement('div');
                        if (moveOption.captured || moveOption.flags.includes('e')) {
                            indicator.className = 'capture-ring absolute';
                        } else {
                            indicator.className = 'move-dot absolute';
                        }
                        squareDiv.appendChild(indicator);
                    }

                    squareDiv.addEventListener('click', () => handleSquareClick(squareName));
                    boardElement.appendChild(squareDiv);
                }
            }
        }

        function handleSquareClick(square) {
            if (isGameOverState()) return;
            if (gameMode === 'pvai' && game.turn() !== playerColor) return;
            if (mpActive && game.turn() !== myColor) return;

            const piece = game.get(square);

            if (selectedSquare) {
                const legalMove = possibleMoves.find(m => m.to === square);
                if (legalMove) {
                    executeMove(legalMove);
                    return;
                }
            }

            if (piece && piece.color === game.turn()) {
                selectedSquare = square;
                possibleMoves = game.moves({ square: square, verbose: true });
            } else {
                selectedSquare = null;
                possibleMoves = [];
            }

            renderBoard();
        }

        function animatePieceMove(fromSquare, toSquare, pieceColor, pieceType, callback) {
            const fromEl = boardElement.querySelector(`[data-square="${fromSquare}"]`);
            const toEl = boardElement.querySelector(`[data-square="${toSquare}"]`);

            if (!fromEl || !toEl) {
                callback();
                return;
            }

            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();
            const boardRect = boardElement.getBoundingClientRect();

            const startX = fromRect.left - boardRect.left;
            const startY = fromRect.top - boardRect.top;
            const targetX = toRect.left - boardRect.left;
            const targetY = toRect.top - boardRect.top;

            const pieceDiv = fromEl.querySelector('.chess-piece');
            if (pieceDiv) pieceDiv.style.opacity = '0';

            const animDiv = document.createElement('div');
            animDiv.className = 'animating-piece flex items-center justify-center text-3xl sm:text-4xl md:text-5xl';
            animDiv.innerText = PIECE_UNICODE[pieceColor][pieceType];
            animDiv.style.color = pieceColor === 'w' ? '#ffffff' : '#000000';
            if (pieceColor === 'w') {
                animDiv.style.textShadow = '0 2px 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.9)';
            }
            animDiv.style.width = `${fromRect.width}px`;
            animDiv.style.height = `${fromRect.height}px`;
            animDiv.style.transform = `translate(${startX}px, ${startY}px)`;

            boardElement.appendChild(animDiv);
            animDiv.getBoundingClientRect();
            animDiv.style.transform = `translate(${targetX}px, ${targetY}px)`;

            setTimeout(() => {
                animDiv.remove();
                callback();
            }, 350);
        }

        function executeMove(moveObj, fromRemote) {
            if (moveObj.flags.includes('p') && !moveObj.promotion) {
                pendingPromotion = moveObj;
                showPromotionModal(moveObj.color);
                return;
            }

            if (mpActive && !fromRemote && mpConn && mpConn.open) {
                mpConn.send({ type: 'move', from: moveObj.from, to: moveObj.to, promotion: moveObj.promotion || null });
            }
            animatePieceMove(moveObj.from, moveObj.to, moveObj.color, moveObj.piece, () => {
                finalizeMove(moveObj);
            });
        }

        function finalizeMove(moveObj) {
            const moveResult = game.move({
                from: moveObj.from,
                to: moveObj.to,
                promotion: moveObj.promotion || 'q'
            });

            if (moveResult) {
                selectedSquare = null;
                possibleMoves = [];

                if (moveResult.captured) playSound('capture');
                else playSound('move');

                if (game.in_check()) playSound('check');

                updateUI();

                if (isGameOverState()) {
                    setTimeout(handleGameOver, 1000);
                } else if (gameMode === 'pvai' && game.turn() !== playerColor && !mpActive) {
                    setTimeout(makeAIMove, 500);
                }
            }
        }

        function showPromotionModal(color) {
            const modal = document.getElementById('promotionModal');
            const optionsContainer = document.getElementById('promotionOptions');
            optionsContainer.innerHTML = '';

            ['q', 'r', 'b', 'n'].forEach(p => {
                const btn = document.createElement('button');
                btn.className = "bg-neutral-800 hover:bg-neutral-700 text-3xl sm:text-4xl p-3 rounded-xl border border-neutral-700 flex items-center justify-center transition text-white";
                btn.innerText = PIECE_UNICODE[color][p];
                btn.addEventListener('click', () => {
                    modal.classList.add('hidden');
                    if (pendingPromotion) {
                        pendingPromotion.promotion = p;
                        executeMove(pendingPromotion);
                        pendingPromotion = null;
                    }
                });
                optionsContainer.appendChild(btn);
            });

            modal.classList.remove('hidden');
        }

        function isGameOverState() {
            return game.game_over() || mpGameOver;
        }

        function handleGameOver(isTimeout = false) {
            stopTimer();
            const overlay = document.getElementById('gameOverlay');
            const overlayTitle = document.getElementById('overlayTitle');
            const overlayIcon = document.getElementById('overlayIcon');

            let loserColor = null;
            let isDraw = false;
            if (mpGameOver && mpGameOver !== true) loserColor = mpGameOver;
            else if (game.in_checkmate()) loserColor = game.turn();
            else isDraw = true;

            if (isDraw) {
                playSound('gameover');
                overlay.classList.remove('hidden', 'bg-neutral-950/0');
                overlay.classList.add('animate-checkmate-overlay');
                overlayIcon.classList.remove('hidden');
                overlayIcon.innerHTML = '<i class="fa-solid fa-handshake text-neutral-200"></i>';
                overlayTitle.innerText = game.in_stalemate() ? "PATT - REMIS" : "REMIS";
                overlayTitle.className = "text-4xl font-black text-white mb-6 tracking-widest uppercase";
                return;
            }

            const winnerColor = loserColor === 'w' ? 'b' : 'w';
            const defeatedKingEl = document.getElementById(`king-${loserColor}`);
            const isAiWinner = mpActive ? (winnerColor !== myColor) : (gameMode === 'pvai' && winnerColor !== playerColor);

            playSound('defeat');

            if (defeatedKingEl) {
                defeatedKingEl.classList.add('defeated-king');
            }

            overlay.classList.remove('hidden', 'bg-neutral-950/0');
            overlay.classList.add('animate-checkmate-overlay');

            if (isAiWinner) {
                overlayIcon.classList.add('hidden');
                overlayTitle.innerText = isTimeout ? "ZEIT ABGELAUFEN!" : (mpActive ? "NIEDERLAGE" : "GAME OVER");
                overlayTitle.className = "text-4xl font-black text-red-600 mb-6 tracking-widest uppercase drop-shadow-[0_0_25px_rgba(220,38,38,0.9)]";
            } else {
                overlayIcon.classList.remove('hidden');
                
                if (activeCampaignLevel) {
                    userProgress.completedLevels[activeCampaignLevel.id] = true;
                    if (activeCampaignLevel.id >= userProgress.unlockedLevel && activeCampaignLevel.id < campaignLevels.length) {
                        userProgress.unlockedLevel = activeCampaignLevel.id + 1;
                    }
                }

                const duration = 2.5 * 1000;
                const end = Date.now() + duration;
                (function frame() {
                    confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 } });
                    confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 } });
                    if (Date.now() < end) requestAnimationFrame(frame);
                }());

                overlayTitle.innerText = isTimeout ? "GEWONNEN (ZEIT)!" : "SIEG!";
                overlayIcon.innerHTML = '<i class="fa-solid fa-trophy text-yellow-400"></i>';
            }
        }

        // ===== KI: Stärke 1-10 =====
        const AI_CONFIG = {
            3:  { depth: 1, margin: 200 },
            4:  { depth: 2, margin: 120 },
            5:  { depth: 2, margin: 50 },
            6:  { depth: 3, margin: 30 },
            7:  { depth: 4, time: 800 },
            8:  { depth: 5, time: 1500 },
            9:  { depth: 6, time: 3000 },
            10: { depth: 9, time: 5000 }
        };
        const CP = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
        const MATE = 100000;
        let aiDeadline = 0, aiNodes = 0;

        const PST = {
            p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
            n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
            b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
            r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
            q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
            k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20]
        };

        function evalSide() {
            const b = game.board();
            let score = 0;
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const p = b[r][c];
                    if (!p) continue;
                    const idx = p.color === 'w' ? r * 8 + c : (7 - r) * 8 + c;
                    const v = CP[p.type] + PST[p.type][idx];
                    score += p.color === 'w' ? v : -v;
                }
            }
            return game.turn() === 'w' ? score : -score;
        }

        function orderMoves(moves) {
            for (const m of moves) {
                m._o = 0;
                if (m.captured) m._o += 10 * CP[m.captured] - CP[m.piece] / 10 + 1000;
                if (m.promotion) m._o += 900 + CP[m.promotion];
            }
            return moves.sort((a, b) => b._o - a._o);
        }

        function checkTime() {
            if (aiDeadline && (++aiNodes & 1023) === 0 && performance.now() > aiDeadline) throw 'timeout';
        }

        function quiesce(alpha, beta, qd) {
            checkTime();
            const stand = evalSide();
            if (qd <= 0) return stand;
            if (stand >= beta) return stand;
            if (stand > alpha) alpha = stand;
            const moves = orderMoves(game.moves({ verbose: true }).filter(m => m.captured || m.promotion));
            for (const m of moves) {
                game.move(m);
                const sc = -quiesce(-beta, -alpha, qd - 1);
                game.undo();
                if (sc >= beta) return sc;
                if (sc > alpha) alpha = sc;
            }
            return alpha;
        }

        function negamax(depth, alpha, beta, ply) {
            checkTime();
            const moves = game.moves({ verbose: true });
            if (moves.length === 0) return game.in_check() ? -MATE + ply : 0;
            if (game.in_draw() || game.in_threefold_repetition()) return 0;
            if (depth <= 0) return quiesce(alpha, beta, 4);
            orderMoves(moves);
            let best = -Infinity;
            for (const m of moves) {
                game.move(m);
                const sc = -negamax(depth - 1, -beta, -alpha, ply + 1);
                game.undo();
                if (sc > best) best = sc;
                if (best > alpha) alpha = best;
                if (alpha >= beta) break;
            }
            return best;
        }

        function scoreRootMoves(moves, depth) {
            aiDeadline = 0;
            return moves.map(m => {
                game.move(m);
                const sc = -negamax(depth - 1, -Infinity, Infinity, 1);
                game.undo();
                return { m, sc };
            });
        }

        function searchTimed(moves, maxDepth, ms) {
            orderMoves(moves);
            let best = moves[0];
            const baseLen = game.history().length;
            aiNodes = 0;
            aiDeadline = performance.now() + ms;
            try {
                for (let d = 1; d <= maxDepth; d++) {
                    let alpha = -Infinity, iterBest = null;
                    for (const m of moves) {
                        game.move(m);
                        const sc = -negamax(d - 1, -Infinity, -alpha, 1);
                        game.undo();
                        if (sc > alpha) { alpha = sc; iterBest = m; }
                    }
                    best = iterBest || best;
                    moves.splice(moves.indexOf(best), 1); moves.unshift(best);
                    if (alpha > MATE - 100) break;
                }
            } catch (e) {
                if (e !== 'timeout') throw e;
                while (game.history().length > baseLen) game.undo();
            }
            aiDeadline = 0;
            return best;
        }

        function pickAIMove() {
            const moves = game.moves({ verbose: true });
            const lvl = aiDifficulty;
            if (lvl <= 1) return moves[Math.floor(Math.random() * moves.length)];
            if (lvl === 2) {
                const caps = moves.filter(m => m.captured);
                if (caps.length && Math.random() > 0.4) return caps[Math.floor(Math.random() * caps.length)];
                return moves[Math.floor(Math.random() * moves.length)];
            }
            const cfg = AI_CONFIG[Math.min(lvl, 10)];
            if (cfg.time) return searchTimed(moves, cfg.depth, cfg.time);
            const scored = scoreRootMoves(moves, cfg.depth);
            const top = Math.max(...scored.map(x => x.sc));
            const pool = scored.filter(x => x.sc >= top - cfg.margin);
            return pool[Math.floor(Math.random() * pool.length)].m;
        }

        function makeAIMove() {
            if (isGameOverState() || mpActive || game.turn() === playerColor) return;
            if (game.moves().length === 0) { handleGameOver(); return; }
            let mv = null;
            try { mv = pickAIMove(); } catch (e) { console.error(e); mv = game.moves({ verbose: true })[0]; }
            if (mv) executeMove(mv); else handleGameOver();
        }

        function updateUI() {
            renderBoard();
            updateCapturedPiecesAndScore();
            updateMoveHistory();
            updatePlayerBadges();
            updateTimerUI();
        }

        function updatePlayerBadges() {
            const topTurnBadge = document.getElementById('topTurnBadge');
            const bottomTurnBadge = document.getElementById('bottomTurnBadge');
            const topPlayerName = document.getElementById('topPlayerName');
            const bottomPlayerName = document.getElementById('bottomPlayerName');
            const topPlayerTag = document.getElementById('topPlayerTag');
            const bottomPlayerTag = document.getElementById('bottomPlayerTag');
            const topPlayerIcon = document.getElementById('topPlayerIcon');
            const currentTurn = game.turn();

            if (mpActive) {
                topPlayerName.innerText = "Gegner";
                topPlayerIcon.className = "fa-solid fa-user text-neutral-300";
                bottomPlayerName.innerText = "Du";
                topPlayerTag.innerText = myColor === 'w' ? "Schwarz" : "Weiß";
                bottomPlayerTag.innerText = myColor === 'w' ? "Weiß" : "Schwarz";
                const myTurn = currentTurn === myColor;
                bottomTurnBadge.classList.toggle('hidden', !myTurn);
                topTurnBadge.classList.toggle('hidden', myTurn);
            } else if (gameMode === 'pvai') {
                topPlayerName.innerText = activeCampaignLevel ? activeCampaignLevel.title : `KI (Stufe ${aiDifficulty})`;
                topPlayerIcon.className = "fa-solid fa-robot text-neutral-300";
                bottomPlayerName.innerText = "Spieler 1";
                topPlayerTag.innerText = "Schwarz";
                bottomPlayerTag.innerText = "Weiß";

                if (currentTurn === 'w') {
                    bottomTurnBadge.classList.remove('hidden');
                    topTurnBadge.classList.add('hidden');
                } else {
                    topTurnBadge.classList.remove('hidden');
                    bottomTurnBadge.classList.add('hidden');
                }
            } else {
                topPlayerName.innerText = "Spieler 2";
                topPlayerIcon.className = "fa-solid fa-user text-neutral-300";
                bottomPlayerName.innerText = "Spieler 1";
                topPlayerTag.innerText = "Schwarz";
                bottomPlayerTag.innerText = "Weiß";

                if (currentTurn === 'w') {
                    bottomTurnBadge.classList.remove('hidden');
                    topTurnBadge.classList.add('hidden');
                } else {
                    topTurnBadge.classList.remove('hidden');
                    bottomTurnBadge.classList.add('hidden');
                }
            }
        }

        function updateCapturedPiecesAndScore() {
            const history = game.history({ verbose: true });
            const capturedByWhite = [];
            const capturedByBlack = [];

            history.forEach(m => {
                if (m.captured) {
                    if (m.color === 'w') capturedByWhite.push(m.captured);
                    else capturedByBlack.push(m.captured);
                }
            });

            let whiteScore = capturedByWhite.reduce((acc, p) => acc + PIECE_VALUES[p], 0);
            let blackScore = capturedByBlack.reduce((acc, p) => acc + PIECE_VALUES[p], 0);

            const whiteDiff = whiteScore - blackScore;
            const blackDiff = blackScore - whiteScore;

            const fl = mpActive && myColor === 'b';
            document.getElementById('topCaptured').innerHTML = (fl ? capturedByBlack.map(p => PIECE_UNICODE['w'][p]) : capturedByWhite.map(p => PIECE_UNICODE['b'][p])).join(' ');
            document.getElementById('bottomCaptured').innerHTML = (fl ? capturedByWhite.map(p => PIECE_UNICODE['b'][p]) : capturedByBlack.map(p => PIECE_UNICODE['w'][p])).join(' ');
            const topD = fl ? blackDiff : whiteDiff, botD = fl ? whiteDiff : blackDiff;
            document.getElementById('topScore').innerText = topD > 0 ? `+${topD}` : '0';
            document.getElementById('bottomScore').innerText = botD > 0 ? `+${botD}` : '0';
        }

        function updateMoveHistory() {
            const moveHistoryEl = document.getElementById('moveHistory');
            const moveCountBadge = document.getElementById('moveCountBadge');
            const history = game.history();

            moveCountBadge.innerText = `${history.length} Züge`;

            if (history.length === 0) {
                moveHistoryEl.innerHTML = '<div class="text-neutral-500 text-xs italic text-center py-4">Noch keine Züge gemacht.</div>';
                return;
            }

            let html = '';
            for (let i = 0; i < history.length; i += 2) {
                const moveNum = Math.floor(i / 2) + 1;
                html += `
                    <div class="flex items-center px-2 py-1 rounded ${moveNum % 2 === 0 ? 'bg-neutral-800/40' : 'bg-neutral-700/30'}">
                        <span class="w-8 text-neutral-500 text-xs">${moveNum}.</span>
                        <span class="w-24 text-white font-medium">${history[i]}</span>
                        <span class="w-24 text-neutral-400">${history[i + 1] || ''}</span>
                    </div>
                `;
            }
            moveHistoryEl.innerHTML = html;
            moveHistoryEl.scrollTop = moveHistoryEl.scrollHeight;
        }

        function resetGame() {
            stopTimer();
            if (!mpActive) { mpGameOver = false; }
            game.reset();
            selectedSquare = null;
            possibleMoves = [];
            const overlay = document.getElementById('gameOverlay');
            overlay.classList.add('hidden');
            overlay.classList.remove('animate-checkmate-overlay', 'bg-neutral-950/90');
            
            const overlayTitle = document.getElementById('overlayTitle');
            const overlayIcon = document.getElementById('overlayIcon');
            overlayTitle.className = "text-3xl font-extrabold text-white mb-2 tracking-wide";
            overlayIcon.className = "w-20 h-20 rounded-full bg-white/10 text-white flex items-center justify-center text-4xl mb-4 border border-white/20 shadow-2xl animate-bounce";
            overlayIcon.innerHTML = '<i class="fa-solid fa-trophy"></i>';

            updateUI();
        }
    
