        class Game2048 {
            constructor() {
                this.gridSize = 4;
                this.board = [];
                this.score = 0;
                this.bestScore = parseInt(localStorage.getItem('2048-best-score')) || 0;
                this.won = false;
                this.keepPlaying = false;
                this.tileIdCounter = 0;

                this.tileContainer = document.getElementById('tile-container');
                this.scoreEl = document.getElementById('score');
                this.bestScoreEl = document.getElementById('best-score');
                this.overlay = document.getElementById('overlay');
                this.overlayTitle = document.getElementById('overlay-title');
                this.overlayMsg = document.getElementById('overlay-msg');
                this.keepGoingBtn = document.getElementById('keep-going-btn');
                this.tryAgainBtn = document.getElementById('try-again-btn');

                this.init();
            }

            init() {
                this.setupEventListeners();
                this.restart();
            }

            restart() {
                this.board = Array(this.gridSize).fill(null).map(() => Array(this.gridSize).fill(null));
                this.score = 0;
                this.won = false;
                this.keepPlaying = false;
                this.tileContainer.innerHTML = '';
                this.hideOverlay();
                this.updateScore(0);
                this.bestScoreEl.textContent = this.bestScore;

                // Spawn initial 2 tiles
                this.addRandomTile();
                this.addRandomTile();
                this.render();
            }

            setupEventListeners() {
                // Keyboard Navigation
                window.addEventListener('keydown', (e) => {
                    let handled = false;
                    switch(e.key) {
                        case 'ArrowUp': case 'w': case 'W': handled = this.move(0); break;
                        case 'ArrowRight': case 'd': case 'D': handled = this.move(1); break;
                        case 'ArrowDown': case 's': case 'S': handled = this.move(2); break;
                        case 'ArrowLeft': case 'a': case 'A': handled = this.move(3); break;
                    }
                    if (handled) e.preventDefault();
                });

                // Touch Swipe Gestures
                let startX = 0, startY = 0;
                const gameContainer = document.getElementById('grid-background');

                window.addEventListener('touchstart', (e) => {
                    if (e.touches.length > 1) return;
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                }, { passive: true });

                window.addEventListener('touchend', (e) => {
                    if (!startX || !startY) return;
                    let endX = e.changedTouches[0].clientX;
                    let endY = e.changedTouches[0].clientY;

                    let diffX = endX - startX;
                    let diffY = endY - startY;

                    if (Math.max(Math.abs(diffX), Math.abs(diffY)) > 30) { // Swipe threshold
                        if (Math.abs(diffX) > Math.abs(diffY)) {
                            this.move(diffX > 0 ? 1 : 3); // Right or Left
                        } else {
                            this.move(diffY > 0 ? 2 : 0); // Down or Up
                        }
                    }
                    startX = 0;
                    startY = 0;
                }, { passive: true });

                // UI Button Listeners
                document.getElementById('restart-btn').addEventListener('click', () => this.restart());
                this.tryAgainBtn.addEventListener('click', () => this.restart());
                this.keepGoingBtn.addEventListener('click', () => {
                    this.keepPlaying = true;
                    this.hideOverlay();
                });
            }

            addRandomTile() {
                const emptyCells = [];
                for (let r = 0; r < this.gridSize; r++) {
                    for (let c = 0; c < this.gridSize; c++) {
                        if (!this.board[r][c]) {
                            emptyCells.push({ r, c });
                        }
                    }
                }

                if (emptyCells.length > 0) {
                    const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
                    const value = Math.random() < 0.9 ? 2 : 4;
                    this.board[randomCell.r][randomCell.c] = {
                        id: ++this.tileIdCounter,
                        value: value,
                        r: randomCell.r,
                        c: randomCell.c,
                        merged: false,
                        isNew: true
                    };
                }
            }

            // Direction: 0: Up, 1: Right, 2: Down, 3: Left
            move(direction) {
                if (this.isGameOver() && !this.keepPlaying) return false;

                let moved = false;
                const vector = this.getVector(direction);
                const traversals = this.buildTraversals(vector);

                // Clear previous merge flags
                this.board.forEach(row => row.forEach(tile => {
                    if (tile) {
                        tile.merged = false;
                        tile.isNew = false;
                    }
                }));

                traversals.r.forEach(r => {
                    traversals.c.forEach(c => {
                        const tile = this.board[r][c];
                        if (tile) {
                            const positions = this.findFarthestPosition({ r, c }, vector);
                            const next = positions.next;

                            // Check if merge is possible
                            if (this.withinBounds(next) && 
                                this.board[next.r][next.c] && 
                                this.board[next.r][next.c].value === tile.value && 
                                !this.board[next.r][next.c].merged) {

                                const targetTile = this.board[next.r][next.c];
                                const mergedValue = tile.value * 2;

                                const mergedTile = {
                                    id: ++this.tileIdCounter,
                                    value: mergedValue,
                                    r: next.r,
                                    c: next.c,
                                    merged: true
                                };

                                this.board[r][c] = null;
                                this.board[next.r][next.c] = mergedTile;

                                // Update position for smooth animation
                                tile.r = next.r;
                                tile.c = next.c;

                                this.updateScore(this.score + mergedValue);

                                if (mergedValue === 2048 && !this.won) {
                                    this.won = true;
                                    setTimeout(() => this.showWinOverlay(), 250);
                                }

                                moved = true;
                            } else if (positions.farthest.r !== r || positions.farthest.c !== c) {
                                this.board[r][c] = null;
                                this.board[positions.farthest.r][positions.farthest.c] = tile;
                                tile.r = positions.farthest.r;
                                tile.c = positions.farthest.c;
                                moved = true;
                            }
                        }
                    });
                });

                if (moved) {
                    this.addRandomTile();
                    this.render();

                    if (!this.movesAvailable()) {
                        setTimeout(() => this.showGameOverOverlay(), 250);
                    }
                }

                return moved;
            }

            getVector(direction) {
                const map = {
                    0: { r: -1, c: 0 },  // Up
                    1: { r: 0, c: 1 },   // Right
                    2: { r: 1, c: 0 },   // Down
                    3: { r: 0, c: -1 }   // Left
                };
                return map[direction];
            }

            buildTraversals(vector) {
                const traversals = { r: [], c: [] };
                for (let pos = 0; pos < this.gridSize; pos++) {
                    traversals.r.push(pos);
                    traversals.c.push(pos);
                }

                if (vector.r === 1) traversals.r.reverse();
                if (vector.c === 1) traversals.c.reverse();

                return traversals;
            }

            findFarthestPosition(cell, vector) {
                let previous;
                do {
                    previous = cell;
                    cell = { r: previous.r + vector.r, c: previous.c + vector.c };
                } while (this.withinBounds(cell) && !this.board[cell.r][cell.c]);

                return {
                    farthest: previous,
                    next: cell
                };
            }

            withinBounds(position) {
                return position.r >= 0 && position.r < this.gridSize &&
                       position.c >= 0 && position.c < this.gridSize;
            }

            movesAvailable() {
                // Check for empty cells
                for (let r = 0; r < this.gridSize; r++) {
                    for (let c = 0; c < this.gridSize; c++) {
                        if (!this.board[r][c]) return true;
                    }
                }

                // Check for adjacent matching values
                for (let r = 0; r < this.gridSize; r++) {
                    for (let c = 0; c < this.gridSize; c++) {
                        const tile = this.board[r][c];
                        if (tile) {
                            for (let dir = 0; dir < 4; dir++) {
                                const vector = this.getVector(dir);
                                const neighbor = { r: r + vector.r, c: c + vector.c };
                                if (this.withinBounds(neighbor) && this.board[neighbor.r][neighbor.c]) {
                                    if (this.board[neighbor.r][neighbor.c].value === tile.value) {
                                        return true;
                                    }
                                }
                            }
                        }
                    }
                }

                return false;
            }

            isGameOver() {
                return !this.movesAvailable();
            }

            updateScore(amount) {
                this.score = amount;
                this.scoreEl.textContent = this.score;
                if (this.score > this.bestScore) {
                    this.bestScore = this.score;
                    this.bestScoreEl.textContent = this.bestScore;
                    localStorage.setItem('2048-best-score', this.bestScore);
                }
            }

            render() {
                const containerRect = this.tileContainer.getBoundingClientRect();
                const padding = 12; // Gap inside grid
                const cellSize = (containerRect.width - (padding * 2) - (12 * 3)) / 4; // 12px grid gap

                // Synchronize DOM elements
                const existingTiles = Array.from(this.tileContainer.children);
                const currentTileIds = new Set();

                for (let r = 0; r < this.gridSize; r++) {
                    for (let c = 0; c < this.gridSize; c++) {
                        const tile = this.board[r][c];
                        if (tile) {
                            currentTileIds.add(`tile-${tile.id}`);
                            let tileEl = document.getElementById(`tile-${tile.id}`);

                            const left = c * (cellSize + 12);
                            const top = r * (cellSize + 12);

                            if (!tileEl) {
                                // Create new DOM Element
                                tileEl = document.createElement('div');
                                tileEl.id = `tile-${tile.id}`;
                                tileEl.style.width = `${cellSize}px`;
                                tileEl.style.height = `${cellSize}px`;
                                tileEl.style.transform = `translate(${left}px, ${top}px)`;

                                const inner = document.createElement('div');
                                inner.className = 'tile-inner';
                                inner.textContent = tile.value;

                                tileEl.appendChild(inner);
                                this.tileContainer.appendChild(tileEl);
                            } else {
                                // Update existing DOM Element Position
                                tileEl.style.transform = `translate(${left}px, ${top}px)`;
                                const inner = tileEl.querySelector('.tile-inner');
                                inner.textContent = tile.value;
                            }

                            // Class formatting for styling & merging
                            const valClass = tile.value <= 2048 ? `tile-${tile.value}` : 'tile-super';
                            tileEl.className = `tile ${valClass} ${tile.merged ? 'tile-merged' : ''}`;
                        }
                    }
                }

                // Remove old tiles
                existingTiles.forEach(el => {
                    if (!currentTileIds.has(el.id)) {
                        el.remove();
                    }
                });
            }

            showWinOverlay() {
                this.overlayTitle.textContent = 'Gewonnen!';
                this.overlayMsg.textContent = 'Du hast den 2048-Stein erreicht!';
                this.keepGoingBtn.classList.remove('hidden');
                this.showOverlay();
            }

            showGameOverOverlay() {
                this.overlayTitle.textContent = 'Game Over!';
                this.overlayMsg.textContent = 'Keine Spielzüge mehr möglich.';
                this.keepGoingBtn.classList.add('hidden');
                this.showOverlay();
            }

            showOverlay() {
                this.overlay.classList.remove('opacity-0', 'pointer-events-none');
                this.overlay.classList.add('opacity-100', 'pointer-events-auto');
            }

            hideOverlay() {
                this.overlay.classList.remove('opacity-100', 'pointer-events-auto');
                this.overlay.classList.add('opacity-0', 'pointer-events-none');
            }
        }

        // Initialize game on load
        window.onload = () => {
            const game = new Game2048();

            // Handle window resizing for fluid canvas positioning
            window.addEventListener('resize', () => {
                game.render();
            });
        };
    
