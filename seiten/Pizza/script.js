        const shopItems = [
            { id: 'flour', name: 'Mehl (10x)', cost: 60, icon: '🌾' },
            { id: 'water', name: 'Wasser (10x)', cost: 60, icon: '💧' },
            { id: 'sauce', name: 'Soße (10x)', cost: 70, icon: '🍅' },
            { id: 'cheese', name: 'Käse (10x)', cost: 70, icon: '🧀' },
            { id: 'salami', name: 'Salami (10x)', cost: 50, icon: '🥩' },
            { id: 'chili', name: 'Chili (10x)', cost: 30, icon: '🌶️' },
            { id: 'oven2', name: 'Ofen 2', cost: 1000, icon: '🔥' }
        ];

        let worldScale = 1;
        let storeOpen = false;
        let gameHour = 6;
        let gameMinute = 0;
        let clockTimer = 0;

        let dayStats = {
            pizzasSold: 0,
            earnedCoins: 0,
            missedCustomers: 0
        };

        let state = {
            coins: 50, score: 0,
            ingredients: { flour: 10, water: 10, sauce: 10, cheese: 10, salami: 20, chili: 10 },
            package: { type: null, count: 0 },
            mixers: [
                { state: 'idle', timer: 0, hasFlour: false, hasWater: false, soundTimer: 0 },
                { state: 'idle', timer: 0, hasFlour: false, hasWater: false, soundTimer: 0 }
            ],
            tableSlots: [
                { state: 'empty', salamiCount: 0, chiliCount: 0 },
                { state: 'empty', salamiCount: 0, chiliCount: 0 },
                { state: 'empty', salamiCount: 0, chiliCount: 0 }
            ],
            counterSlots: [null, null, null],
            ovens: [
                { state: 'empty', timer: 0, unlocked: true, pizzaType: null },
                { state: 'empty', timer: 0, unlocked: false, pizzaType: null }
            ],
            customers: []
        };

        let playerObj = { x: 475, y: 360, targetX: 475, targetY: 475, speed: 280, radius: 15 };
        let lastTime = 0;
        let gameRunning = false;
        let spawnTimer = 15000;

        let dragItem = null;
        const dragAvatar = document.getElementById('drag-avatar');

        const sfx = {};
        const lastSoundTime = {};

        function initAudio() {
            sfx.coin = new Tone.Synth({ oscillator: { type: "square" } }).toDestination();
            sfx.coin.volume.value = -10;
            sfx.error = new Tone.Synth({ oscillator: { type: "sawtooth" } }).toDestination();
            sfx.error.volume.value = -12;
            sfx.ding = new Tone.Synth({ oscillator: { type: "triangle" } }).toDestination();
            sfx.ding.volume.value = -8;
            sfx.burn = new Tone.NoiseSynth({ noise: { type: "brown" }, envelope: { attack: 0.01, decay: 1 } }).toDestination();
            sfx.burn.volume.value = -5;
            sfx.pop = new Tone.Synth({ oscillator: { type: "sine" } }).toDestination();
            sfx.pop.volume.value = -10;
            sfx.action = new Tone.Synth({ oscillator: { type: "square" } }).toDestination();
            sfx.action.volume.value = -10;
            sfx.mix = new Tone.Synth({ oscillator: { type: "triangle" } }).toDestination();
            sfx.mix.volume.value = -16;
        }

        function playSound(type) {
            if (!Tone.context || Tone.context.state !== 'running') return;
            const now = Tone.now();
            if (lastSoundTime[type] && (now - lastSoundTime[type]) < 0.05) return;
            lastSoundTime[type] = now;

            if (type === 'coin') {
                sfx.coin.triggerAttackRelease("C6", "16n", now);
                sfx.coin.triggerAttackRelease("E6", "16n", now + 0.1);
            } else if (type === 'error') {
                sfx.error.triggerAttackRelease("C3", "8n", now);
            } else if (type === 'ding') {
                sfx.ding.triggerAttackRelease("G5", "8n", now);
            } else if (type === 'burn') {
                sfx.burn.triggerAttackRelease("8n", now);
            } else if (type === 'pop') {
                sfx.pop.triggerAttackRelease("C5", "32n", now);
            } else if (type === 'action') {
                sfx.action.triggerAttackRelease("A5", "32n", now);
            }
        }

        function toggleStoreStatus() {
            const btn = document.getElementById('toggle-shop-btn');
            if (!storeOpen) {
                if (gameHour >= 6 && gameHour < 22) {
                    storeOpen = true;
                    btn.innerText = "GESCHÄFT: AUF";
                    btn.className = "pixel-btn px-4 py-2 text-xs bg-green-600 text-white font-bold opacity-80 cursor-not-allowed";
                    playSound('pop');
                } else {
                    showMessage("Geschäft öffnet erst um 06:00 Uhr!");
                }
            } else {
                showMessage("Geschäft kann während der Öffnungszeit nicht manuell geschlossen werden!");
            }
        }

        document.getElementById('world').addEventListener('pointerdown', (e) => {
            if (dragItem) return;
            const world = document.getElementById('world');
            const wRect = world.getBoundingClientRect();
            
            let clickX = (e.clientX - wRect.left) / worldScale;
            let clickY = (e.clientY - wRect.top) / worldScale;

            clickX = Math.max(30, Math.min(920, clickX));
            clickY = Math.max(30, Math.min(640, clickY));

            playerObj.targetX = clickX;
            playerObj.targetY = clickY;
        });

        function showMessage(text) {
            const msg = document.getElementById('msg-overlay');
            msg.innerText = text;
            msg.classList.remove('hidden');
            msg.style.opacity = '1';
            setTimeout(() => {
                msg.style.opacity = '0';
                setTimeout(() => msg.classList.add('hidden'), 300);
            }, 1000);
            playSound('error');
        }

        function showFloatingText(text, x, y) {
            const el = document.createElement('div');
            el.innerText = text;
            el.style.position = 'fixed';
            el.style.left = x + 'px';
            el.style.top = y + 'px';
            el.style.zIndex = '2000';
            el.style.color = '#FACC15';
            el.style.fontFamily = "'Press Start 2P', monospace";
            el.style.fontSize = '12px';
            el.style.fontWeight = 'bold';
            el.style.pointerEvents = 'none';
            el.style.transition = 'all 0.8s ease-out';
            document.body.appendChild(el);

            const coinUI = document.getElementById('ui-coins');
            const cRect = coinUI ? coinUI.getBoundingClientRect() : {left: 50, top: 20};

            setTimeout(() => {
                el.style.left = cRect.left + 'px';
                el.style.top = cRect.top + 'px';
                el.style.opacity = '0';
                el.style.transform = 'scale(0.8)';
            }, 50);

            setTimeout(() => {
                el.remove();
            }, 850);
        }

        const iconMap = {
            'flour': '🌾', 'water': '💧', 'sauce': '🍅', 'cheese': '🧀', 'salami': '🥩', 'chili': '🌶️',
            'dough-0': '⚪', 'dough-1': '⚪',
            'margherita_pizza_0': '🧀', 'margherita_pizza_1': '🧀', 'margherita_pizza_2': '🧀',
            'salami_pizza_0': '🍕', 'salami_pizza_1': '🍕', 'salami_pizza_2': '🍕',
            'diavola_pizza_0': '🌶️', 'diavola_pizza_1': '🌶️', 'diavola_pizza_2': '🌶️',
            'baked_margherita_1': '🧀', 'baked_margherita_2': '🧀',
            'baked_salami_1': '🍕', 'baked_salami_2': '🍕',
            'baked_diavola_1': '🌶️', 'baked_diavola_2': '🌶️',
            'counter_pizza_margherita': '🧀', 'counter_pizza_salami': '🍕', 'counter_pizza_diavola': '🌶️',
            'burned_pizza_1': '⬛', 'burned_pizza_2': '⬛',
            'package_item': '📦'
        };

        function startDrag(e, type, sourceZone) {
            if (sourceZone === 'station-storage') {
                if (state.ingredients[type] <= 0) {
                    showMessage("Lager leer!");
                    return;
                }
            }

            dragItem = { type, sourceZone };
            dragAvatar.innerText = iconMap[type] || '🗞️';
            dragAvatar.style.display = 'block';
            updateDragAvatarPos(e);
            playSound('pop');
            e.stopPropagation();
            e.preventDefault();
        }

        function startPackageDrag(e) {
            if (state.package.count <= 0) return;
            dragItem = { type: `package_${state.package.type}`, sourceZone: 'delivery-station' };
            dragAvatar.innerText = '📦';
            dragAvatar.style.display = 'block';
            updateDragAvatarPos(e);
            playSound('pop');
            e.stopPropagation();
            e.preventDefault();
        }

        function startRoller(e, slotIdx) {
            const ts = state.tableSlots[slotIdx].state;
            if (ts === 'dough') {
                startDrag(e, `roller-${slotIdx}`, 'table');
            }
            e.stopPropagation();
        }

        function startMixerPickup(e, mixerIdx) {
            const m = state.mixers[mixerIdx - 1];
            if (m.state === 'ready') {
                startDrag(e, `dough-${mixerIdx - 1}`, `station-mixer-${mixerIdx}`);
            }
            e.stopPropagation();
        }

        function startTablePizzaPickup(e, slotIdx) {
            const ts = state.tableSlots[slotIdx].state;
            if (ts === 'ready_salami' || ts === 'salami_1' || ts === 'salami_2') {
                startDrag(e, `salami_pizza_${slotIdx}`, `station-table-${slotIdx}`);
            } else if (ts === 'ready_diavola') {
                startDrag(e, `diavola_pizza_${slotIdx}`, `station-table-${slotIdx}`);
            } else if (ts === 'cheese') {
                startDrag(e, `margherita_pizza_${slotIdx}`, `station-table-${slotIdx}`);
            }
            e.stopPropagation();
        }

        function startOvenPickup(e, ovenIdx) {
            const o = state.ovens[ovenIdx - 1];
            const pType = o.pizzaType;
            if (o.state === 'ready') {
                startDrag(e, `baked_${pType}_${ovenIdx}`, `station-oven-${ovenIdx}`);
            } else if (o.state === 'burned') {
                startDrag(e, `burned_pizza_${ovenIdx}`, `station-oven-${ovenIdx}`);
            }
            e.stopPropagation();
        }

        function startCounterSlotPickup(e, slotIdx) {
            if (state.counterSlots[slotIdx] !== null) {
                const pType = state.counterSlots[slotIdx].type;
                state.counterSlots[slotIdx] = null;
                startDrag(e, `counter_pizza_${pType}`, `counter-slot-${slotIdx}`);
            }
            e.stopPropagation();
        }

        window.addEventListener('pointermove', e => {
            if (dragItem) updateDragAvatarPos(e);
        });

        function updateDragAvatarPos(e) {
            dragAvatar.style.left = e.clientX + 'px';
            dragAvatar.style.top = e.clientY + 'px';
        }

        window.addEventListener('pointerup', e => {
            if (!dragItem) return;
            dragAvatar.style.display = 'none';
            
            const targetEl = document.elementFromPoint(e.clientX, e.clientY);
            const dropZoneEl = targetEl ? targetEl.closest('.station') : null;
            
            if (dropZoneEl) {
                const targetZone = dropZoneEl.dataset.zone;
                handleDrop(dragItem, targetZone, targetEl, e);
            } else {
                cancelDrag();
            }
            dragItem = null;
        });

        function cancelDrag() {
            if (dragItem && dragItem.sourceZone && dragItem.sourceZone.startsWith('counter-slot-')) {
                const slotIdx = parseInt(dragItem.sourceZone.split('-')[2]);
                const pizzaType = dragItem.type.replace('counter_pizza_', '');
                state.counterSlots[slotIdx] = { type: pizzaType };
            }
            playSound('error');
        }

        function handleDrop(item, targetZone, exactTarget, e) {
            const { type, sourceZone } = item;

            if (targetZone === 'storage' && sourceZone === 'delivery-station') {
                if (type.startsWith('package_')) {
                    const ingType = type.replace('package_', '');
                    state.ingredients[ingType] += state.package.count;
                    state.package.count = 0;
                    state.package.type = null;
                    playSound('action');
                    return;
                }
            }

            if (targetZone === 'mixer-1' && state.mixers[0].state === 'idle') {
                if (type === 'flour' && !state.mixers[0].hasFlour) {
                    state.mixers[0].hasFlour = true;
                    consumeIngredient('flour', sourceZone);
                    checkMixerStart(0);
                    return;
                }
                if (type === 'water' && !state.mixers[0].hasWater) {
                    state.mixers[0].hasWater = true;
                    consumeIngredient('water', sourceZone);
                    checkMixerStart(0);
                    return;
                }
            }

            if (targetZone === 'mixer-2' && state.mixers[1].state === 'idle') {
                if (type === 'flour' && !state.mixers[1].hasFlour) {
                    state.mixers[1].hasFlour = true;
                    consumeIngredient('flour', sourceZone);
                    checkMixerStart(1);
                    return;
                }
                if (type === 'water' && !state.mixers[1].hasWater) {
                    state.mixers[1].hasWater = true;
                    consumeIngredient('water', sourceZone);
                    checkMixerStart(1);
                    return;
                }
            }

            if (targetZone === 'table') {
                const slotContainer = exactTarget.closest('.slot-container');
                if (slotContainer) {
                    const slots = Array.from(slotContainer.parentElement.children).filter(c => c.classList.contains('slot-container'));
                    const slotIdx = slots.indexOf(slotContainer);
                    if (slotIdx !== -1) {
                        const ts = state.tableSlots[slotIdx].state;
                        
                        if ((type === 'dough-0' || type === 'dough-1') && ts === 'empty') {
                            state.tableSlots[slotIdx].state = 'dough';
                            state.tableSlots[slotIdx].salamiCount = 0;
                            state.tableSlots[slotIdx].chiliCount = 0;
                            if (sourceZone.includes('mixer')) {
                                const mIdx = parseInt(sourceZone.slice(-1)) - 1;
                                clearMixerOutput(mIdx);
                            }
                            playSound('action');
                            return;
                        }
                        if (type.startsWith('roller-') && ts === 'dough') {
                            state.tableSlots[slotIdx].state = 'flat';
                            playSound('action');
                            return;
                        }
                        if (type === 'sauce' && ts === 'flat') {
                            state.tableSlots[slotIdx].state = 'sauce';
                            consumeIngredient('sauce', sourceZone);
                            playSound('action');
                            return;
                        }
                        if (type === 'cheese' && ts === 'sauce') {
                            state.tableSlots[slotIdx].state = 'cheese';
                            consumeIngredient('cheese', sourceZone);
                            playSound('action');
                            return;
                        }
                        if (type === 'salami' && (ts === 'cheese' || ts === 'salami_1' || ts === 'salami_2')) {
                            if (state.tableSlots[slotIdx].chiliCount > 0) {
                                showMessage("Bereits Chili drauf!");
                                return;
                            }
                            state.tableSlots[slotIdx].salamiCount++;
                            consumeIngredient('salami', sourceZone);
                            if (state.tableSlots[slotIdx].salamiCount === 1) state.tableSlots[slotIdx].state = 'salami_1';
                            else if (state.tableSlots[slotIdx].salamiCount === 2) state.tableSlots[slotIdx].state = 'salami_2';
                            else if (state.tableSlots[slotIdx].salamiCount >= 3) state.tableSlots[slotIdx].state = 'ready_salami';
                            playSound('action');
                            return;
                        }
                        if (type === 'chili' && ts === 'salami_1') {
                            state.tableSlots[slotIdx].chiliCount = 1;
                            consumeIngredient('chili', sourceZone);
                            state.tableSlots[slotIdx].state = 'ready_diavola';
                            playSound('action');
                            return;
                        }
                    }
                }
            }

            if (targetZone === 'oven-1' && state.ovens[0].state === 'empty') {
                if (type.startsWith('salami_pizza_') || type.startsWith('margherita_pizza_') || type.startsWith('diavola_pizza_')) {
                    const sIdx = parseInt(type.slice(-1));
                    let pizzaType = 'margherita';
                    if (type.startsWith('salami_pizza_')) pizzaType = 'salami';
                    else if (type.startsWith('diavola_pizza_')) pizzaType = 'diavola';

                    state.ovens[0].state = 'baking';
                    state.ovens[0].timer = 0;
                    state.ovens[0].pizzaType = pizzaType;
                    state.tableSlots[sIdx].state = 'empty';
                    state.tableSlots[sIdx].salamiCount = 0;
                    state.tableSlots[sIdx].chiliCount = 0;
                    playSound('action');
                    return;
                }
            }

            if (targetZone === 'oven-2' && state.ovens[1].unlocked && state.ovens[1].state === 'empty') {
                if (type.startsWith('salami_pizza_') || type.startsWith('margherita_pizza_') || type.startsWith('diavola_pizza_')) {
                    const sIdx = parseInt(type.slice(-1));
                    let pizzaType = 'margherita';
                    if (type.startsWith('salami_pizza_')) pizzaType = 'salami';
                    else if (type.startsWith('diavola_pizza_')) pizzaType = 'diavola';

                    state.ovens[1].state = 'baking';
                    state.ovens[1].timer = 0;
                    state.ovens[1].pizzaType = pizzaType;
                    state.tableSlots[sIdx].state = 'empty';
                    state.tableSlots[sIdx].salamiCount = 0;
                    state.tableSlots[sIdx].chiliCount = 0;
                    playSound('action');
                    return;
                }
            }

            if (targetZone === 'counter') {
                const counterSlotEl = exactTarget.closest('.counter-slot');
                const custDiv = exactTarget.closest('.customer');
                let pizzaType = null;
                if (type.includes('margherita')) pizzaType = 'margherita';
                else if (type.includes('salami')) pizzaType = 'salami';
                else if (type.includes('diavola')) pizzaType = 'diavola';
                else if (type.startsWith('counter_pizza_')) pizzaType = type.replace('counter_pizza_', '');

                // PRÜFUNG: Nur gebackene Pizzen aus dem Ofen oder vom Abstellplatz zulassen!
                const isBaked = sourceZone.includes('oven') || sourceZone.includes('counter-slot');

                if (!isBaked) {
                    showMessage("Die Pizza muss zuerst gebacken werden!");
                    cancelDrag();
                    return;
                }

                if (custDiv && pizzaType) {
                    serveCustomer(custDiv.dataset.id, pizzaType, e.clientX, e.clientY);
                    if (sourceZone.includes('oven')) {
                        const oIdx = parseInt(sourceZone.slice(-1)) - 1;
                        clearOvenOutput(oIdx);
                    }
                    return;
                } else if (counterSlotEl && pizzaType && sourceZone.includes('oven')) {
                    const cSlotIdx = parseInt(counterSlotEl.dataset.counterSlot);
                    if (state.counterSlots[cSlotIdx] === null) {
                        state.counterSlots[cSlotIdx] = { type: pizzaType };
                        const oIdx = parseInt(sourceZone.slice(-1)) - 1;
                        clearOvenOutput(oIdx);
                        playSound('action');
                        return;
                    }
                } else if (pizzaType && sourceZone.includes('oven')) {
                    const emptySlotIdx = state.counterSlots.indexOf(null);
                    if (emptySlotIdx !== -1) {
                        state.counterSlots[emptySlotIdx] = { type: pizzaType };
                        const oIdx = parseInt(sourceZone.slice(-1)) - 1;
                        clearOvenOutput(oIdx);
                        playSound('action');
                        return;
                    } else if (state.customers.length > 0) {
                        serveCustomer(state.customers[0].id, pizzaType, e.clientX, e.clientY);
                        const oIdx = parseInt(sourceZone.slice(-1)) - 1;
                        clearOvenOutput(oIdx);
                        return;
                    }
                } else if (counterSlotEl && type.startsWith('counter_pizza_')) {
                    const cSlotIdx = parseInt(counterSlotEl.dataset.counterSlot);
                    if (state.counterSlots[cSlotIdx] === null) {
                        state.counterSlots[cSlotIdx] = { type: pizzaType };
                        playSound('action');
                        return;
                    }
                }
            }

            if (targetZone === 'trash') {
                if (type.startsWith('baked_') || type.startsWith('burned_pizza_')) {
                    const oMatch = sourceZone.match(/\d+$/);
                    const oIdx = oMatch ? parseInt(oMatch[0]) - 1 : 0;
                    clearOvenOutput(oIdx);
                }
                if (type.startsWith('salami_pizza_') || type.startsWith('margherita_pizza_') || type.startsWith('diavola_pizza_')) {
                    const sIdx = parseInt(type.slice(-1));
                    state.tableSlots[sIdx].state = 'empty';
                    state.tableSlots[sIdx].salamiCount = 0;
                    state.tableSlots[sIdx].chiliCount = 0;
                }
                if (type.startsWith('dough-')) {
                    const mIdx = parseInt(type.slice(-1));
                    clearMixerOutput(mIdx);
                }
                if (['flour','water','sauce','cheese','salami','chili'].includes(type) && sourceZone === 'station-storage') {
                    consumeIngredient(type, sourceZone);
                }
                playSound('burn');
                return;
            }

            cancelDrag();
        }

        function consumeIngredient(id, source) {
            if (source === 'station-storage') {
                state.ingredients[id]--;
            }
        }

        function checkMixerStart(idx) {
            playSound('action');
            if (state.mixers[idx].hasFlour && state.mixers[idx].hasWater) {
                state.mixers[idx].state = 'mixing';
                state.mixers[idx].timer = 0;
                state.mixers[idx].soundTimer = 0;
            }
        }

        function clearMixerOutput(idx) {
            state.mixers[idx].state = 'idle';
            state.mixers[idx].hasFlour = false;
            state.mixers[idx].hasWater = false;
        }

        function clearOvenOutput(idx) {
            state.ovens[idx].state = 'empty';
            state.ovens[idx].timer = 0;
            state.ovens[idx].pizzaType = null;
        }

        function serveCustomer(id, servedType, clientX, clientY) {
            const idx = state.customers.findIndex(c => c.id === id);
            if (idx !== -1) {
                if (state.customers[idx].pizzaType === servedType) {
                    state.customers.splice(idx, 1);
                    const reward = 75;
                    state.coins += reward;
                    state.score += 25;
                    dayStats.pizzasSold++;
                    dayStats.earnedCoins += reward;
                    playSound('coin');
                    showFloatingText(`+${reward}¢`, clientX, clientY);
                } else {
                    showMessage("Das war die falsche Pizza!");
                }
            }
        }

        function openRecipeModal(pizzaType) {
            const titleEl = document.getElementById('recipe-title');
            const contentEl = document.getElementById('recipe-content');
            
            let name = "";
            let steps = [];

            if (pizzaType === 'margherita') {
                name = "Rezept: Margherita-Pizza (🧀)";
                steps = [
                    "1. Fülle 🌾 Mehl und 💧 Wasser in eine Rührmaschine und warte 10 Sekunden.",
                    "2. Nimm den Teig ⚪ heraus und lege ihn auf einen freien Platz am Arbeitstisch.",
                    "3. Rolle den Teig mit dem Roller (🛼) flach.",
                    "4. Gib Tomatensoße (🍅) auf den Teig.",
                    "5. Gib Käse (🧀) auf die Soße.",
                    "6. Schiebe die rohe Pizza in den Ofen und backe sie ab!"
                ];
            } else if (pizzaType === 'salami') {
                name = "Rezept: Salami-Pizza (🍕)";
                steps = [
                    "1. Fülle 🌾 Mehl und 💧 Wasser in die Rührmaschine und warte 10 Sekunden.",
                    "2. Nimm den Teig ⚪ und lege ihn auf den Arbeitstisch.",
                    "3. Rolle ihn mit dem Roller (🛼) aus.",
                    "4. Gib Tomatensoße (🍅) und danach Käse (🧀) hinzu.",
                    "5. Belege die Pizza mit genau 3x Salami (🥩).",
                    "6. Im Ofen backen und servieren!"
                ];
            } else if (pizzaType === 'diavola') {
                name = "Rezept: Diavola-Pizza (🌶️)";
                steps = [
                    "1. Fülle 🌾 Mehl und 💧 Wasser in die Rührmaschine und warte 10 Sekunden.",
                    "2. Nimm den Teig ⚪, lege ihn auf den Arbeitstisch und rolle ihn mit dem Roller (🛼) aus.",
                    "3. Gib Tomatensoße (🍅) und Käse (🧀) hinzu.",
                    "4. Belege die Pizza mit genau 1x Salami (🥩) und 1x Chili (🌶️).",
                    "5. Im Ofen backen und feurig scharf servieren!"
                ];
            }

            titleEl.innerText = name;
            contentEl.innerHTML = steps.map(s => `<div>${s}</div>`).join('');
            document.getElementById('recipe-modal').classList.remove('hidden');
            playSound('pop');
        }

        function closeRecipeModal() {
            document.getElementById('recipe-modal').classList.add('hidden');
            playSound('pop');
        }

        function openSummaryModal() {
            const content = document.getElementById('summary-content');
            content.innerHTML = `
                <div>🍕 Verkauft: <span class="text-green-400">${dayStats.pizzasSold} Pizzen</span></div>
                <div>💰 Verdiente Coins: <span class="text-yellow-400">+${dayStats.earnedCoins}¢</span></div>
                <div>👤 Verpasste Kunden: <span class="text-red-400">${dayStats.missedCustomers}</span></div>
            `;
            document.getElementById('summary-modal').classList.remove('hidden');
        }

        function closeSummaryModal() {
            document.getElementById('summary-modal').classList.add('hidden');
            dayStats = { pizzasSold: 0, earnedCoins: 0, missedCustomers: 0 };
            gameHour = 6;
            gameMinute = 0;
        }

        document.getElementById('station-pc').addEventListener('click', (e) => {
            e.stopPropagation();
            if (storeOpen) {
                showMessage("PC gesperrt (Geschäft offen)!");
                return;
            }
            renderShop();
            document.getElementById('shop-modal').classList.remove('hidden');
            playSound('pop');
        });

        function closeShop() {
            document.getElementById('shop-modal').classList.add('hidden');
            playSound('pop');
        }

        function renderShop() {
            const container = document.getElementById('shop-container');
            container.innerHTML = '';
            shopItems.forEach(item => {
                if (item.id === 'oven2' && state.ovens[1].unlocked) return;
                const disabled = state.coins < item.cost ? 'disabled' : '';
                container.innerHTML += `
                    <div class="flex flex-col items-center bg-zinc-800 p-3 border-2 border-black pixel-box w-28">
                        <div class="text-2xl mb-1">${item.icon}</div>
                        <div class="text-[8px] text-gray-300 mb-2 text-center">${item.name}</div>
                        <button onclick="buyItem('${item.id}', ${item.cost})" ${disabled}
                                class="pixel-btn bg-blue-500 text-white text-[9px] w-full py-2">
                            ${item.cost}¢
                        </button>
                    </div>
                `;
            });
        }

        window.buyItem = function(id, cost) {
            if (state.coins >= cost) {
                if (id === 'oven2') {
                    if (state.ovens[1].unlocked) return;
                    state.coins -= cost;
                    state.ovens[1].unlocked = true;
                    document.getElementById('station-oven-2').classList.remove('hidden');
                } else {
                    if (state.package.count > 0) {
                        if (state.package.type !== id) {
                            showMessage("Paket-Ablage ist mit einem anderen Artikel belegt!");
                            return;
                        }
                        if (state.package.count + 10 > 100) {
                            showMessage("Paket-Ablage ist voll (Max 100)!");
                            return;
                        }
                    }
                    state.coins -= cost;
                    state.package.type = id;
                    state.package.count += 10;
                }
                playSound('pop');
                renderShop();
                updateUI();
            }
        };

        function updateLogic(dt) {
            const dx = playerObj.targetX - playerObj.x;
            const dy = playerObj.targetY - playerObj.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 2) {
                const moveDist = playerObj.speed * (dt / 1000);
                const step = Math.min(dist, moveDist);
                playerObj.x += (dx / dist) * step;
                playerObj.y += (dy / dist) * step;
            }

            const MIXER_TIME = 10000;
            const OVEN_BAKE_TIME = 10000;
            const OVEN_BURN_TIME = 3000;

            for (let i = 0; i < 2; i++) {
                if (state.mixers[i].state === 'mixing') {
                    state.mixers[i].timer += dt;
                    state.mixers[i].soundTimer += dt;
                    if (state.mixers[i].soundTimer >= 500) {
                        state.mixers[i].soundTimer = 0;
                        if (Tone.context && Tone.context.state === 'running') {
                            sfx.mix.triggerAttackRelease("C3", "8n");
                        }
                    }
                    if (state.mixers[i].timer >= MIXER_TIME) {
                        state.mixers[i].state = 'ready';
                        playSound('ding');
                    }
                }
            }

            for (let i = 0; i < 2; i++) {
                if (!state.ovens[i].unlocked) continue;
                if (state.ovens[i].state === 'baking') {
                    state.ovens[i].timer += dt;
                    if (state.ovens[i].timer >= OVEN_BAKE_TIME) {
                        state.ovens[i].state = 'ready';
                        state.ovens[i].timer = 0;
                        playSound('ding');
                    }
                } else if (state.ovens[i].state === 'ready') {
                    state.ovens[i].timer += dt;
                    if (state.ovens[i].timer >= OVEN_BURN_TIME) {
                        state.ovens[i].state = 'burned';
                        playSound('burn');
                    }
                }
            }

            if (storeOpen) {
                clockTimer += dt;
                if (clockTimer >= 3000) {
                    clockTimer = 0;
                    gameMinute += 30;
                    if (gameMinute >= 60) {
                        gameMinute = 0;
                        gameHour++;
                    }
                    if (gameHour >= 22) {
                        gameHour = 22;
                        gameMinute = 0;
                        storeOpen = false;
                        const btn = document.getElementById('toggle-shop-btn');
                        btn.innerText = "GESCHÄFT: ZU";
                        btn.className = "pixel-btn px-4 py-2 text-xs bg-red-600 text-white font-bold";
                        state.customers = [];
                        openSummaryModal();
                    }
                }

                spawnTimer -= dt;
                if (spawnTimer <= 0) {
                    if (state.customers.length < 5 && Math.random() < 0.75) {
                        const rand = Math.random();
                        let pType = 'margherita';
                        if (rand < 0.33) pType = 'margherita';
                        else if (rand < 0.66) pType = 'salami';
                        else pType = 'diavola';

                        state.customers.push({
                            id: Math.random().toString(36).substr(2, 9),
                            patience: 35000,
                            maxPatience: 35000,
                            pizzaType: pType
                        });
                        if (Tone.context.state === 'running') sfx.ding.triggerAttackRelease("C6", "16n");
                    }
                    spawnTimer = 12000;
                }
            }

            for (let i = state.customers.length - 1; i >= 0; i--) {
                state.customers[i].patience -= dt;
                if (state.customers[i].patience <= 0) {
                    state.customers.splice(i, 1);
                    dayStats.missedCustomers++;
                    playSound('error');
                }
            }
        }

        function updateCustomersDOM() {
            const cCont = document.getElementById('customers-container');
            if (!cCont) return;

            const existingIds = Array.from(cCont.children).map(el => el.dataset.id);
            const stateIds = state.customers.map(c => c.id);

            if (JSON.stringify(existingIds) !== JSON.stringify(stateIds)) {
                let cHtml = '';
                state.customers.forEach(c => {
                    let pName = c.pizzaType === 'margherita' ? 'Margherita' : (c.pizzaType === 'salami' ? 'Salami' : 'Diavola');
                    let pIcon = c.pizzaType === 'margherita' ? '🧀' : (c.pizzaType === 'salami' ? '🍕' : '🌶️');
                    cHtml += `
                        <div class="customer w-36 h-16 bg-indigo-600 border-2 border-black flex flex-col items-center justify-between p-1.5 relative shrink-0 overflow-hidden cursor-pointer" data-id="${c.id}" onpointerdown="handleCustomerClick(event, '${c.pizzaType}')" title="Klicken für Rezept">
                            <div class="w-full h-1.5 bg-black border border-white shrink-0"><div class="h-full bg-green-500 progress-bar-fill" id="pbar-${c.id}" style="width:100%"></div></div>
                            <div class="flex items-center gap-1 text-[8px] text-white font-bold whitespace-nowrap">
                                <span>👤</span><span>${pName}</span>
                            </div>
                            <div class="bg-white text-black border border-black rounded px-1.5 py-0.2 text-[8px] flex items-center gap-1 shadow whitespace-nowrap">
                                <span>${pIcon}</span> <span>Bestellung</span>
                            </div>
                        </div>
                    `;
                });
                cCont.innerHTML = cHtml;
            }

            state.customers.forEach(c => {
                const bar = document.getElementById(`pbar-${c.id}`);
                if (bar) {
                    const p = (c.patience / c.maxPatience) * 100;
                    bar.style.width = p + '%';
                    bar.className = `h-full progress-bar-fill ${p < 30 ? 'bg-red-500' : p < 60 ? 'bg-yellow-500' : 'bg-green-500'}`;
                }
            });
        }

        function handleCustomerClick(e, pizzaType) {
            e.stopPropagation();
            if (dragItem === null) {
                openRecipeModal(pizzaType);
            }
        }

        function updateUI() {
            const mainContainer = document.querySelector('main');
            const cWidth = mainContainer.clientWidth;
            const cHeight = mainContainer.clientHeight;
            
            const worldWidth = 950;
            const worldHeight = 720;

            // Welt proportional an Bildschirm anpassen (Aspect Ratio bleibt erhalten)
            const scale = Math.min(cWidth / worldWidth, cHeight / worldHeight);
            worldScale = scale;
            let camX = (cWidth - worldWidth * scale) / 2;
            let camY = (cHeight - worldHeight * scale) / 2;

            const worldEl = document.getElementById('world');
            worldEl.style.transformOrigin = '0 0';
            worldEl.style.transform = `translate(${camX}px, ${camY}px) scale(${scale})`;

            document.getElementById('ui-coins').innerText = state.coins;
            document.getElementById('ui-score').innerText = state.score;
            document.getElementById('ui-clock').innerText = 
                (gameHour < 10 ? '0' : '') + gameHour + ':' + (gameMinute === 0 ? '00' : '30');

            ['flour','water','sauce','cheese','salami','chili'].forEach(id => {
                const stockEl = document.getElementById(`stock-${id}`);
                if (stockEl) stockEl.innerText = state.ingredients[id] + 'x';
            });

            const deliveryBox = document.getElementById('delivery-box');
            const deliveryCount = document.getElementById('delivery-count');
            if (state.package.count > 0) {
                deliveryBox.classList.remove('hidden');
                deliveryBox.innerText = iconMap[state.package.type] || '📦';
                deliveryCount.innerText = state.package.count + 'x';
            } else {
                deliveryBox.classList.add('hidden');
                deliveryCount.innerText = '';
            }

            for (let i = 0; i < 2; i++) {
                const idx = i + 1;
                const flourInd = document.getElementById(`ind-flour-${idx}`);
                const waterInd = document.getElementById(`ind-water-${idx}`);
                if (flourInd) flourInd.style.opacity = state.mixers[i].hasFlour ? '1' : '0.2';
                if (waterInd) waterInd.style.opacity = state.mixers[i].hasWater ? '1' : '0.2';

                const mBar = document.getElementById(`mixer-bar-${idx}`);
                const mDough = document.getElementById(`mixer-dough-${idx}`);
                
                if (mDough) mDough.classList.add('hidden');
                if (mBar) {
                    if (state.mixers[i].state === 'idle') { mBar.style.width = '0%'; mBar.className = 'h-full bg-yellow-400'; }
                    else if (state.mixers[i].state === 'mixing') { mBar.style.width = (state.mixers[i].timer / 10000 * 100) + '%'; }
                    else if (state.mixers[i].state === 'ready') { mBar.style.width = '100%'; mBar.className = 'h-full bg-green-500'; if (mDough) mDough.classList.remove('hidden'); }
                }
            }

            for (let i = 0; i < 3; i++) {
                const ts = state.tableSlots[i].state;
                const slotContainers = document.querySelectorAll('.slot-container');
                if (!slotContainers[i]) continue;
                const slotArea = slotContainers[i];
                const rollerBtn = slotArea.querySelector('.roller-btn');
                
                const dEl = document.getElementById(`t-dough-${i}`);
                const fEl = document.getElementById(`t-flat-${i}`);
                const sEl = document.getElementById(`t-sauce-${i}`);
                const cEl = document.getElementById(`t-cheese-${i}`);
                const salCont = document.getElementById(`t-salami-container-${i}`);
                const chiliEl = document.getElementById(`t-chili-${i}`);

                [dEl, fEl, sEl, cEl, salCont, chiliEl].forEach(el => { if (el) el.classList.add('hidden'); });
                if (rollerBtn) rollerBtn.style.display = 'none';

                if (ts === 'dough') {
                    if (dEl) dEl.classList.remove('hidden');
                    if (rollerBtn) rollerBtn.style.display = 'block';
                } else if (['flat', 'sauce', 'cheese', 'salami_1', 'salami_2', 'ready_salami', 'ready_diavola'].includes(ts)) {
                    if (fEl) fEl.classList.remove('hidden');
                    if (['sauce', 'cheese', 'salami_1', 'salami_2', 'ready_salami', 'ready_diavola'].includes(ts) && sEl) sEl.classList.remove('hidden');
                    if (['cheese', 'salami_1', 'salami_2', 'ready_salami', 'ready_diavola'].includes(ts) && cEl) cEl.classList.remove('hidden');
                    if (['salami_1', 'salami_2', 'ready_salami'].includes(ts) && salCont) {
                        salCont.classList.remove('hidden');
                    }
                    if (ts === 'ready_diavola') {
                        if (salCont) salCont.classList.remove('hidden');
                        if (chiliEl) chiliEl.classList.remove('hidden');
                    }
                }
            }

            for (let i = 0; i < 3; i++) {
                const cSlotEl = document.getElementById(`c-slot-${i}`);
                if (cSlotEl) {
                    if (state.counterSlots[i] !== null) {
                        cSlotEl.classList.remove('hidden');
                        let pType = state.counterSlots[i].type;
                        cSlotEl.innerText = pType === 'margherita' ? '🧀' : (pType === 'salami' ? '🍕' : '🌶️');
                    } else {
                        cSlotEl.classList.add('hidden');
                    }
                }
            }

            for (let i = 0; i < 2; i++) {
                if (!state.ovens[i].unlocked) continue;
                const idx = i + 1;
                const oBar = document.getElementById(`oven-bar-${idx}`);
                const oFire = document.getElementById(`oven-fire-${idx}`);
                const rawEl = document.getElementById(`o-raw-${idx}`);
                const bakedEl = document.getElementById(`o-baked-${idx}`);
                const burnedEl = document.getElementById(`o-burned-${idx}`);

                if (rawEl) rawEl.classList.add('hidden');
                if (bakedEl) bakedEl.classList.add('hidden');
                if (burnedEl) burnedEl.classList.add('hidden');

                if (state.ovens[i].state === 'empty') {
                    if (oBar) oBar.style.width = '0%'; 
                    if (oFire) oFire.className = "absolute inset-0 bg-red-950/40";
                } else if (state.ovens[i].state === 'baking') {
                    if (rawEl) rawEl.classList.remove('hidden');
                    if (oFire) oFire.className = "absolute inset-0 bg-orange-600/70";
                    if (oBar) {
                        oBar.style.width = ((state.ovens[i].timer / 10000) * 100) + '%';
                        oBar.className = 'h-full bg-yellow-400';
                    }
                } else if (state.ovens[i].state === 'ready') {
                    if (bakedEl) bakedEl.classList.remove('hidden');
                    if (oFire) oFire.className = "absolute inset-0 bg-orange-600/70";
                    if (oBar) {
                        oBar.style.width = (100 - ((state.ovens[i].timer / 3000) * 100)) + '%';
                        oBar.className = 'h-full bg-green-500';
                    }
                } else if (state.ovens[i].state === 'burned') {
                    if (burnedEl) burnedEl.classList.remove('hidden');
                    if (oFire) oFire.className = "absolute inset-0 bg-red-950/90";
                    if (oBar) {
                        oBar.style.width = '100%';
                        oBar.className = 'h-full bg-red-800';
                    }
                }
            }

            updateCustomersDOM();
        }

        function loop(time) {
            if (!lastTime) lastTime = time;
            const dt = time - lastTime;
            lastTime = time;

            if (gameRunning) {
                updateLogic(dt);
                updateUI();
            }

            requestAnimationFrame(loop);
        }

        window.addEventListener('resize', updateUI);
        window.addEventListener('orientationchange', () => setTimeout(updateUI, 200));
        updateUI();

        document.getElementById('start-btn').addEventListener('click', async () => {
            await Tone.start();
            initAudio();
            document.getElementById('start-screen').classList.add('hidden');
            gameRunning = true;
            requestAnimationFrame(loop);
        });

    
