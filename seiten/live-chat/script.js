        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
        import { getFirestore, doc, setDoc, getDoc, getDocs, onSnapshot, updateDoc, collection, deleteDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

        const fallbackConfig = {
            apiKey: "AIzaSyATCaZy2CJ7Ig3Eed841bo30ZRPH0kVtVM",
            authDomain: "livetextapp-d5fb8.firebaseapp.com",
            projectId: "livetextapp-d5fb8",
            storageBucket: "livetextapp-d5fb8.firebasestorage.app",
            messagingSenderId: "968443356315",
            appId: "1:968443356315:web:ad21cd26d2ddd5d078923e"
        };

        let app;
        let db;
        let isOnline = false;

        try {
            app = initializeApp(fallbackConfig);
            db = getFirestore(app);
            isOnline = true;
            updateConnectionStatus(true);
        } catch (e) {
            console.error("Firebase Initialisierungsfehler:", e);
            updateConnectionStatus(false);
        }

        function updateConnectionStatus(online) {
            const statusEl = document.getElementById('connection-status');
            const textEl = document.getElementById('status-text');
            if (online) {
                statusEl.className = "flex items-center space-x-2 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-medium text-emerald-700";
                statusEl.querySelector('span').className = "w-2 h-2 rounded-full bg-emerald-500";
                textEl.textContent = "Online";
            } else {
                statusEl.className = "flex items-center space-x-2 px-3 py-1 bg-rose-50 border border-rose-200 rounded-full text-xs font-medium text-rose-700";
                statusEl.querySelector('span').className = "w-2 h-2 rounded-full bg-rose-500";
                textEl.textContent = "Offline / Fehler";
            }
        }

        let currentRoomId = null;
        let currentUser = {
            id: 'user_' + Math.random().toString(36).substring(2, 9),
            name: 'Gast-' + Math.floor(Math.random() * 9000 + 1000)
        };
        let userDisplayNames = {};
        let userSpeakingStatus = {};
        let userVolumes = {}; // Speichert die individuelle Lautstärke pro User (0 = Stumm)

        const usernameInput = document.getElementById('username-input');

        const savedUsername = localStorage.getItem('saved_collab_username');
        if (savedUsername) {
            usernameInput.value = savedUsername;
            currentUser.name = savedUsername;
        }

        function showConfirmModal(title, message, onConfirm) {
            const modal = document.getElementById('custom-modal');
            document.getElementById('modal-title').textContent = title;
            document.getElementById('modal-message').textContent = message;
            modal.classList.remove('hidden');

            const confirmBtn = document.getElementById('modal-confirm-btn');
            const cancelBtn = document.getElementById('modal-cancel-btn');

            const handleConfirm = () => {
                modal.classList.add('hidden');
                cleanup();
                onConfirm();
            };

            const handleCancel = () => {
                modal.classList.add('hidden');
                cleanup();
            };

            const cleanup = () => {
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
            };

            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
        }

        function getSavedRooms() {
            try {
                return JSON.parse(localStorage.getItem('saved_collab_rooms')) || [];
            } catch (e) {
                return [];
            }
        }

        function saveRoomsToStorage(rooms) {
            localStorage.setItem('saved_collab_rooms', JSON.stringify(rooms));
        }

        function addRoomToHistory(roomId) {
            let rooms = getSavedRooms();
            const existingIndex = rooms.findIndex(r => r.id === roomId);
            let isFav = false;

            if (existingIndex !== -1) {
                isFav = rooms[existingIndex].favorite;
                rooms.splice(existingIndex, 1);
            }

            rooms.unshift({ id: roomId, favorite: isFav, timestamp: Date.now() });

            const favorites = rooms.filter(r => r.favorite);
            const nonFavorites = rooms.filter(r => !r.favorite).slice(0, 2);
            
            rooms = [...favorites, ...nonFavorites];
            saveRoomsToStorage(rooms);
            renderRecentRoomsUI();
        }

        function toggleFavorite(roomId) {
            let rooms = getSavedRooms();
            const room = rooms.find(r => r.id === roomId);
            if (room) {
                room.favorite = !room.favorite;
            } else {
                rooms.unshift({ id: roomId, favorite: true, timestamp: Date.now() });
            }
            saveRoomsToStorage(rooms);
            renderRecentRoomsUI();
            updateRoomFavButtonState();
        }

        function renderRecentRoomsUI() {
            const rooms = getSavedRooms();
            const listEl = document.getElementById('recent-rooms-list');
            
            if (rooms.length === 0) {
                listEl.innerHTML = '<div class="text-xs text-slate-400 py-1">Keine gespeicherten Räume</div>';
                return;
            }

            listEl.innerHTML = rooms.map(r => `
                <div class="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 hover:border-indigo-300 transition-all">
                    <button onclick="window.selectRoomCode('${r.id}')" class="text-xs font-mono font-bold text-indigo-600 hover:underline flex items-center space-x-1.5">
                        <i class="fa-solid fa-door-open text-slate-400"></i>
                        <span>${r.id}</span>
                    </button>
                    <button onclick="window.toggleFavRoom('${r.id}')" class="text-xs p-1 ${r.favorite ? 'text-amber-400' : 'text-slate-300 hover:text-amber-400'}" title="Favorit umschalten">
                        <i class="fa-solid fa-star"></i>
                    </button>
                </div>
            `).join('');
        }

        window.selectRoomCode = (id) => {
            document.getElementById('room-id-input').value = id;
        };

        window.toggleFavRoom = (id) => {
            toggleFavorite(id);
        };

        function updateRoomFavButtonState() {
            if (!currentRoomId) return;
            const rooms = getSavedRooms();
            const room = rooms.find(r => r.id === currentRoomId);
            const favBtn = document.getElementById('toggle-room-fav-btn');
            if (room && room.favorite) {
                favBtn.className = "text-amber-400 hover:text-amber-500 p-1 text-xs transition-colors";
            } else {
                favBtn.className = "text-slate-300 hover:text-amber-400 p-1 text-xs transition-colors";
            }
        }

        document.getElementById('toggle-recent-modal-btn').addEventListener('click', () => {
            const container = document.getElementById('recent-rooms-container');
            container.classList.toggle('hidden');
            renderRecentRoomsUI();
        });

        document.getElementById('toggle-room-fav-btn').addEventListener('click', () => {
            if (currentRoomId) {
                toggleFavorite(currentRoomId);
            }
        });

        let textUnsubscribe = null;
        let presenceUnsubscribe = null;
        let signalUnsubscribe = null;
        let chatUnsubscribe = null;
        let localChange = false;
        let presenceInterval = null;

        const lobbyView = document.getElementById('lobby-view');
        const editorView = document.getElementById('editor-view');
        const roomIdInput = document.getElementById('room-id-input');
        const createRoomBtn = document.getElementById('create-room-btn');
        const joinRoomBtn = document.getElementById('join-room-btn');
        const lobbyError = document.getElementById('lobby-error');
        const mainEditor = document.getElementById('main-editor');
        const currentRoomBadge = document.getElementById('current-room-badge');
        const leaveRoomBtn = document.getElementById('leave-room-btn');
        const clearTextBtn = document.getElementById('clear-text-btn');
        const exportTxtBtn = document.getElementById('export-txt-btn');
        const copyRoomBtn = document.getElementById('copy-room-btn');
        const userBadge = document.getElementById('user-badge');
        const displayUsername = document.getElementById('display-username');
        const activeUsersList = document.getElementById('active-users-list');
        const activeUsersCount = document.getElementById('active-users-count');

        // Malen Elements & Toggle
        const canvasContainer = document.getElementById('canvas-container');
        const closeCanvasBtn = document.getElementById('close-canvas-btn');
        const openCanvasBtn = document.getElementById('open-canvas-btn');
        const canvas = document.getElementById('paint-canvas');

        function toggleCanvasVisibility(show) {
            if (show) {
                canvasContainer.classList.remove('hidden');
                if (openCanvasBtn) openCanvasBtn.classList.add('hidden');
                setTimeout(resizeCanvas, 50);
            } else {
                canvasContainer.classList.add('hidden');
                if (openCanvasBtn) openCanvasBtn.classList.remove('hidden');
            }
        }

        closeCanvasBtn.addEventListener('click', () => {
            toggleCanvasVisibility(false);
        });

        if (openCanvasBtn) {
            openCanvasBtn.addEventListener('click', () => {
                toggleCanvasVisibility(true);
            });
        }

        // Chat Elements & Toggle
        const chatSidebarContainer = document.getElementById('chat-sidebar-container');
        const chatContentBox = document.getElementById('chat-content-box');
        const openChatBtnBottom = document.getElementById('open-chat-btn-bottom');
        const openChatContainer = document.getElementById('open-chat-container');
        const closeChatBtn = document.getElementById('close-chat-btn');

        // Anwesenden-Liste Toggle
        const toggleUsersBtn = document.getElementById('toggle-users-btn');
        const toggleUsersIcon = document.getElementById('toggle-users-icon');

        // Hilfsfunktion zur Prüfung, ob BEIDE (Chat und Anwesend-Liste) eingeklappt sind
        function updateSidebarWidthState() {
            const isChatHidden = chatContentBox.classList.contains('hidden');
            const isUsersHidden = activeUsersList.classList.contains('hidden');

            if (isChatHidden && isUsersHidden) {
                // Sehr schmal machen wenn beides zu ist
                chatSidebarContainer.classList.remove('md:w-72');
                chatSidebarContainer.classList.add('md:w-12');
                // Texte und Indikatoren optional ausblenden im Schmalmodus
                document.querySelector('.sidebar-title-text').classList.add('hidden');
                activeUsersCount.classList.add('hidden');
                document.getElementById('sidebar-footer-text').classList.add('hidden');
            } else {
                // Wieder normale Breite
                chatSidebarContainer.classList.remove('md:w-12');
                chatSidebarContainer.classList.add('md:w-72');
                document.querySelector('.sidebar-title-text').classList.remove('hidden');
                activeUsersCount.classList.remove('hidden');
                document.getElementById('sidebar-footer-text').classList.remove('hidden');
            }
        }

        if (toggleUsersBtn && toggleUsersIcon) {
            toggleUsersBtn.addEventListener('click', () => {
                const isHidden = activeUsersList.classList.toggle('hidden');
                if (isHidden) {
                    toggleUsersIcon.className = "fa-solid fa-chevron-up";
                    toggleUsersBtn.title = "Anwesenden-Liste ausklappen";
                } else {
                    toggleUsersIcon.className = "fa-solid fa-chevron-down";
                    toggleUsersBtn.title = "Anwesenden-Liste einklappen";
                }
                updateSidebarWidthState();
            });
        }

        // Chat ausblenden
        closeChatBtn.addEventListener('click', () => {
            chatContentBox.classList.add('hidden');
            if (openChatContainer) {
                openChatContainer.classList.remove('hidden');
            }
            if (openChatBtnBottom) {
                openChatBtnBottom.classList.remove('hidden');
            }
            activeUsersList.classList.remove('max-h-36', 'shrink-0', 'border-b');
            activeUsersList.classList.add('flex-1', 'min-h-0');
            updateSidebarWidthState();
        });

        // Chat einblenden
        const handleOpenChat = () => {
            chatContentBox.classList.remove('hidden');
            if (openChatContainer) {
                openChatContainer.classList.add('hidden');
            }
            if (openChatBtnBottom) {
                openChatBtnBottom.classList.add('hidden');
            }
            activeUsersList.classList.add('max-h-36', 'shrink-0', 'border-b');
            activeUsersList.classList.remove('flex-1', 'min-h-0');
            updateSidebarWidthState();
        };

        if (openChatBtnBottom) openChatBtnBottom.addEventListener('click', handleOpenChat);

        const ctx = canvas.getContext('2d');
        const brushColor = document.getElementById('brush-color');
        const clearCanvasBtn = document.getElementById('clear-canvas-btn');
        let isDrawing = false;
        let localDrawing = false;

        function resizeCanvas() {
            if (canvasContainer.classList.contains('hidden')) return;
            const rect = canvas.parentElement.getBoundingClientRect();
            if (canvas.width !== rect.width || canvas.height !== rect.height) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvas.width;
                tempCanvas.height = canvas.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(canvas, 0, 0);

                canvas.width = rect.width;
                canvas.height = rect.height;
                ctx.drawImage(tempCanvas, 0, 0);
            }
        }

        function showError(msg) {
            lobbyError.textContent = msg;
            lobbyError.classList.remove('hidden');
            setTimeout(() => lobbyError.classList.add('hidden'), 4000);
        }

        function setupUser() {
            const enteredName = usernameInput.value.trim();
            if (enteredName) {
                currentUser.name = enteredName;
                localStorage.setItem('saved_collab_username', enteredName);
            } else {
                localStorage.removeItem('saved_collab_username');
            }
            displayUsername.textContent = currentUser.name;
            userBadge.classList.remove('hidden');
            userBadge.classList.add('flex');
        }

        createRoomBtn.addEventListener('click', async () => {
            if (!isOnline) {
                showError("Keine Verbindung zur Cloud möglich.");
                return;
            }
            setupUser();
            const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
            
            try {
                const roomRef = doc(db, 'rooms', newRoomId);
                await setDoc(roomRef, {
                    content: "",
                    drawing: "",
                    createdAt: serverTimestamp(),
                    host: currentUser.id
                });
                await enterRoom(newRoomId);
            } catch (err) {
                console.error(err);
                showError("Fehler beim Erstellen des Raumes.");
            }
        });

        joinRoomBtn.addEventListener('click', async () => {
            if (!isOnline) {
                showError("Keine Verbindung zur Cloud möglich.");
                return;
            }
            const roomId = roomIdInput.value.trim().toUpperCase();
            if (!roomId) {
                showError("Bitte gib einen Raum-Code ein.");
                return;
            }
            setupUser();

            try {
                const roomRef = doc(db, 'rooms', roomId);
                const snap = await getDoc(roomRef);
                if (!snap.exists()) {
                    showError("Raum existiert nicht!");
                    return;
                }

                const presenceSnap = await getDocs(collection(db, 'rooms', roomId, 'presence'));
                const now = Date.now();
                let activeCount = 0;
                presenceSnap.forEach(d => {
                    if (d.id === currentUser.id) return;
                    const data = d.data();
                    if (!data.lastSeen) {
                        activeCount++;
                    } else {
                        const lastSeenTime = data.lastSeen.toMillis ? data.lastSeen.toMillis() : now;
                        if (now - lastSeenTime < 25000) {
                            activeCount++;
                        }
                    }
                });

                if (activeCount >= 10) {
                    showError("Dieser Raum ist voll (maximal 10 Personen erlaubt).");
                    return;
                }

                await enterRoom(roomId);
            } catch (err) {
                console.error(err);
                showError("Fehler beim Beitreten des Raumes.");
            }
        });

        async function enterRoom(roomId) {
            currentRoomId = roomId;
            currentRoomBadge.textContent = roomId;
            addRoomToHistory(roomId);
            updateRoomFavButtonState();

            lobbyView.classList.add('hidden');
            editorView.classList.remove('hidden');

            setTimeout(resizeCanvas, 50);

            const roomRef = doc(db, 'rooms', roomId);
            
            textUnsubscribe = onSnapshot(roomRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (!localChange && mainEditor.value !== data.content) {
                        mainEditor.value = data.content || '';
                    }
                    localChange = false;

                    if (!localDrawing && data.drawing) {
                        const img = new Image();
                        img.onload = () => {
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                            ctx.drawImage(img, 0, 0);
                        };
                        img.src = data.drawing;
                    }
                    localDrawing = false;
                }
            });

            await updatePresence();
            presenceInterval = setInterval(updatePresence, 10000);

            const presenceCol = collection(db, 'rooms', roomId, 'presence');
            presenceUnsubscribe = onSnapshot(presenceCol, (snapshot) => {
                let users = [];
                const now = Date.now();
                
                snapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    const userId = docSnap.id;
                    let isUserActive = true;
                    
                    if (data.lastSeen) {
                        const lastSeenTime = data.lastSeen.toMillis ? data.lastSeen.toMillis() : now;
                        if (now - lastSeenTime >= 25000) {
                            isUserActive = false;
                        }
                    }

                    if (isUserActive) {
                        users.push({
                            id: userId,
                            name: data.name || 'Gast',
                            isMuted: data.isMuted !== undefined ? data.isMuted : true,
                            isSpeaking: data.isSpeaking || false
                        });
                    }
                });

                users.sort((a, b) => a.id.localeCompare(b.id));

                const nameCounts = {};
                userDisplayNames = {};
                const formattedUsers = users.map(u => {
                    const baseName = u.name;
                    let displayName = baseName;
                    if (!nameCounts[baseName]) {
                        nameCounts[baseName] = 1;
                    } else {
                        nameCounts[baseName]++;
                        displayName = `${baseName} (${nameCounts[baseName]})`;
                    }
                    userDisplayNames[u.id] = displayName;
                    return { ...u, displayName };
                });

                activeUsersCount.textContent = formattedUsers.length;

                activeUsersList.innerHTML = formattedUsers.map(u => {
                    const isSelf = u.id === currentUser.id;
                    const isSpeaking = isSelf ? (userSpeakingStatus[u.id] || false) : u.isSpeaking;
                    const isMutedByVol = userVolumes[u.id] === 0;

                    let voiceStatusIcon = '';
                    if (u.isMuted) {
                        voiceStatusIcon = `<i class="fa-solid fa-volume-xmark text-slate-400 text-xs select-none" title="Voice Chat aus"></i>`;
                    } else if (isMutedByVol) {
                        voiceStatusIcon = `<span class="text-xs text-slate-400 select-none" title="Stummgeschaltet">🔇</span>`;
                    } else if (isSpeaking) {
                        voiceStatusIcon = `<span class="text-xs text-slate-400 select-none animate-pulse" title="Spricht">🔊</span>`;
                    } else {
                        voiceStatusIcon = `<span class="text-xs text-slate-400 select-none" title="Aktiv">🔉</span>`;
                    }

                    const settingsButton = !isSelf ? `
                        <button onclick="window.openUserSettingsModal('${u.id}')" class="text-slate-400 hover:text-indigo-600 px-1 text-xs transition-colors" title="Einstellungen / Lautstärke">
                            <i class="fa-solid fa-sliders"></i>
                        </button>
                    ` : '';

                    return `
                        <div class="flex flex-col p-1.5 bg-white rounded-lg border border-slate-200 shadow-xs">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center space-x-1.5 truncate pr-2">
                                    <div class="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></div>
                                    <span class="text-xs font-medium text-slate-700 truncate">${escapeHtml(u.displayName)}</span>
                                </div>
                                <div class="flex items-center space-x-1 shrink-0">
                                    ${settingsButton}
                                    ${voiceStatusIcon}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            });

            setupVoiceChatSignaling();
            setupSMSChat();
        }

        let activeSettingsUserId = null;
        let userGainNodes = {};
        let userAudioCtxs = {};

        window.openUserSettingsModal = (userId) => {
            activeSettingsUserId = userId;
            const displayName = userDisplayNames[userId] || 'Benutzer';
            document.getElementById('settings-user-name').textContent = `Einstellungen: ${displayName}`;
            
            const currentVol = userVolumes[userId] !== undefined ? userVolumes[userId] : 100;
            const slider = document.getElementById('settings-volume-slider');
            const volText = document.getElementById('settings-volume-text');
            
            slider.value = currentVol;
            volText.textContent = currentVol === 0 ? 'Mute' : `${currentVol}%`;
            
            document.getElementById('user-settings-modal').classList.remove('hidden');
        };

        const settingsSlider = document.getElementById('settings-volume-slider');
        if (settingsSlider) {
            settingsSlider.addEventListener('input', (e) => {
                if (!activeSettingsUserId) return;
                const vol = parseInt(e.target.value, 10);
                window.setUserVolume(activeSettingsUserId, vol);
            });
        }

        const closeSettingsModal = () => {
            document.getElementById('user-settings-modal').classList.add('hidden');
            activeSettingsUserId = null;
        };

        document.getElementById('close-settings-modal-btn')?.addEventListener('click', closeSettingsModal);

        window.setUserVolume = (userId, value) => {
            const vol = parseInt(value, 10);
            userVolumes[userId] = vol;

            if (userGainNodes[userId]) {
                userGainNodes[userId].gain.value = vol / 100;
                if (userAudioCtxs[userId] && userAudioCtxs[userId].state === 'suspended') {
                    userAudioCtxs[userId].resume();
                }
            }

            const audioEl = document.getElementById(`audio-${userId}`);
            if (audioEl) {
                audioEl.volume = Math.min(1, vol / 100);
                audioEl.muted = (vol === 0);
            }

            const volTxt = document.getElementById('settings-volume-text');
            if (volTxt && activeSettingsUserId === userId) {
                volTxt.textContent = vol === 0 ? 'Mute' : `${vol}%`;
            }
        };

        async function updatePresence() {
            if (!currentRoomId) return;
            try {
                const userPresenceRef = doc(db, 'rooms', currentRoomId, 'presence', currentUser.id);
                await setDoc(userPresenceRef, {
                    id: currentUser.id,
                    name: currentUser.name,
                    isMuted: !isVoiceActive,
                    isSpeaking: !!userSpeakingStatus[currentUser.id],
                    lastSeen: serverTimestamp()
                }, { merge: true });
            } catch(e) {}
        }

        const chatForm = document.getElementById('chat-form');
        const chatInput = document.getElementById('chat-input');
        const chatMessagesList = document.getElementById('chat-messages-list');

        function setupSMSChat() {
            if (!currentRoomId) return;
            const chatCol = collection(db, 'rooms', currentRoomId, 'chat');

            chatUnsubscribe = onSnapshot(chatCol, (snapshot) => {
                let msgs = [];
                snapshot.forEach(docSnap => {
                    msgs.push({ id: docSnap.id, ...docSnap.data() });
                });

                msgs.sort((a, b) => {
                    const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : Date.now();
                    const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : Date.now();
                    return ta - tb;
                });

                renderChatMessages(msgs);
            });
        }

        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if (!text || !currentRoomId || !isOnline) return;

            chatInput.value = '';
            const myDisplayName = userDisplayNames[currentUser.id] || currentUser.name;

            try {
                await addDoc(collection(db, 'rooms', currentRoomId, 'chat'), {
                    senderId: currentUser.id,
                    senderName: myDisplayName,
                    text: text,
                    createdAt: serverTimestamp()
                });
            } catch(e) {}
        });

        function renderChatMessages(msgs) {
            chatMessagesList.innerHTML = msgs.map(m => {
                const isMe = m.senderId === currentUser.id;
                const displayName = userDisplayNames[m.senderId] || m.senderName || 'Gast';
                return `
                    <div data-msg-id="${m.id}" class="chat-msg flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full">
                        <span class="text-[9px] text-slate-400 px-1 mb-0.5">${escapeHtml(displayName)}</span>
                        <div class="px-2.5 py-1.5 rounded-xl text-xs max-w-[85%] break-words shadow-xs ${isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-200 text-slate-800 rounded-bl-none'}">
                            ${escapeHtml(m.text || '')}
                        </div>
                    </div>
                `;
            }).join('');

            pruneOffscreenChat();
        }

        async function pruneOffscreenChat() {
            while (chatMessagesList.scrollHeight > chatMessagesList.clientHeight && chatMessagesList.children.length > 0) {
                const oldestChild = chatMessagesList.firstChild;
                const msgId = oldestChild.getAttribute('data-msg-id');
                chatMessagesList.removeChild(oldestChild);

                if (msgId && currentRoomId && isOnline) {
                    try {
                        await deleteDoc(doc(doc(db, 'rooms', currentRoomId, 'chat', msgId)));
                    } catch(e) {}
                }
            }
        }

        let localVoiceStream = null;
        let isVoiceActive = false;
        let audioContext = null;
        let analyser = null;
        let animFrameId = null;
        const peerConnections = {};
        const rtcConfig = {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        };

        const voiceChatBtn = document.getElementById('voice-chat-btn');
        const voiceText = document.getElementById('voice-text');
        const audioContainer = document.getElementById('audio-container');

        voiceChatBtn.addEventListener('click', async () => {
            if (!isVoiceActive) {
                try {
                    localVoiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    isVoiceActive = true;
                    
                    voiceChatBtn.className = "px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium rounded-lg transition-all flex items-center space-x-1.5 border border-emerald-200";
                    voiceText.textContent = "Voice Chat an";

                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const source = audioContext.createMediaStreamSource(localVoiceStream);
                    analyser = audioContext.createAnalyser();
                    analyser.fftSize = 256;
                    source.connect(analyser);

                    const bufferLength = analyser.frequencyBinCount;
                    const dataArray = new Uint8Array(bufferLength);
                    const THRESHOLD = 15;

                    function checkVolume() {
                        if (!isVoiceActive) return;
                        analyser.getByteFrequencyData(dataArray);
                        let sum = 0;
                        for (let i = 0; i < bufferLength; i++) {
                            sum += dataArray[i];
                        }
                        const average = sum / bufferLength;

                        const currentlySpeaking = average > THRESHOLD;
                        if (userSpeakingStatus[currentUser.id] !== currentlySpeaking) {
                            userSpeakingStatus[currentUser.id] = currentlySpeaking;
                            updatePresence();
                        }

                        animFrameId = requestAnimationFrame(checkVolume);
                    }

                    checkVolume();

                    await updatePresence();
                    broadcastVoiceOffer();
                } catch (e) {
                    showError("Zugriff auf Mikrofon verweigert oder nicht unterstützt.");
                }
            } else {
                stopVoiceChat();
            }
        });

        function stopVoiceChat() {
            if (animFrameId) {
                cancelAnimationFrame(animFrameId);
                animFrameId = null;
            }
            if (audioContext) {
                audioContext.close();
                audioContext = null;
            }
            if (localVoiceStream) {
                localVoiceStream.getTracks().forEach(track => track.stop());
                localVoiceStream = null;
            }
            isVoiceActive = false;
            userSpeakingStatus[currentUser.id] = false;
            voiceChatBtn.className = "px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-all flex items-center space-x-1.5 border border-slate-300";
            voiceText.textContent = "Voice Chat aus";

            updatePresence();

            Object.keys(peerConnections).forEach(peerId => {
                peerConnections[peerId].close();
                delete peerConnections[peerId];
            });
            Object.keys(userAudioCtxs).forEach(peerId => {
                try { userAudioCtxs[peerId].close(); } catch(e) {}
            });
            userGainNodes = {};
            userAudioCtxs = {};
            audioContainer.innerHTML = '';
        }

        function createPeerConnection(targetUserId) {
            if (peerConnections[targetUserId]) return peerConnections[targetUserId];

            const pc = new RTCPeerConnection(rtcConfig);
            peerConnections[targetUserId] = pc;

            if (localVoiceStream) {
                localVoiceStream.getTracks().forEach(track => pc.addTrack(track, localVoiceStream));
            }

            pc.ontrack = (event) => {
                let audioEl = document.getElementById(`audio-${targetUserId}`);
                if (!audioEl) {
                    audioEl = document.createElement('audio');
                    audioEl.id = `audio-${targetUserId}`;
                    audioEl.autoplay = true;
                    audioContainer.appendChild(audioEl);
                }
                audioEl.srcObject = event.streams[0];
                
                try {
                    if (!userAudioCtxs[targetUserId]) {
                        const AudioCtx = window.AudioContext || window.webkitAudioContext;
                        const ctx = new AudioCtx();
                        const source = ctx.createMediaStreamSource(event.streams[0]);
                        const gainNode = ctx.createGain();
                        
                        const currentVol = userVolumes[targetUserId] !== undefined ? userVolumes[targetUserId] : 100;
                        gainNode.gain.value = currentVol / 100;
                        
                        source.connect(gainNode);
                        gainNode.connect(ctx.destination);
                        
                        userGainNodes[targetUserId] = gainNode;
                        userAudioCtxs[targetUserId] = ctx;
                        
                        audioEl.muted = true;
                    }
                } catch(err) {
                    console.warn("WebAudio GainNode Fehler:", err);
                }

                window.setUserVolume(targetUserId, userVolumes[targetUserId] !== undefined ? userVolumes[targetUserId] : 100);
            };

            pc.onicecandidate = (event) => {
                if (event.candidate && currentRoomId) {
                    addDoc(collection(db, 'rooms', currentRoomId, 'signals'), {
                        sender: currentUser.id,
                        receiver: targetUserId,
                        type: 'candidate',
                        candidate: JSON.stringify(event.candidate)
                    });
                }
            };

            return pc;
        }

        async function broadcastVoiceOffer() {
            if (!currentRoomId) return;
            const signalCol = collection(db, 'rooms', currentRoomId, 'signals');
            await addDoc(signalCol, {
                sender: currentUser.id,
                receiver: 'ALL',
                type: 'ping'
            });
        }

        function setupVoiceChatSignaling() {
            if (!currentRoomId) return;
            const signalsCol = collection(db, 'rooms', currentRoomId, 'signals');

            signalUnsubscribe = onSnapshot(signalsCol, (snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        if (data.sender === currentUser.id) return;

                        if (data.receiver === currentUser.id || data.receiver === 'ALL') {
                            if (data.type === 'ping' && isVoiceActive) {
                                const pc = createPeerConnection(data.sender);
                                const offer = await pc.createOffer();
                                await pc.setLocalDescription(offer);
                                await addDoc(signalsCol, {
                                    sender: currentUser.id,
                                    receiver: data.sender,
                                    type: 'offer',
                                    sdp: JSON.stringify(offer)
                                });
                            } else if (data.type === 'offer') {
                                const pc = createPeerConnection(data.sender);
                                await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(data.sdp)));
                                const answer = await pc.createAnswer();
                                await pc.setLocalDescription(answer);
                                await addDoc(signalsCol, {
                                    sender: currentUser.id,
                                    receiver: data.sender,
                                    type: 'answer',
                                    sdp: JSON.stringify(answer)
                                });
                            } else if (data.type === 'answer') {
                                const pc = peerConnections[data.sender];
                                if (pc) {
                                    await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(data.sdp)));
                                }
                            } else if (data.type === 'candidate') {
                                const pc = peerConnections[data.sender];
                                if (pc) {
                                    await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(data.candidate)));
                                }
                            }
                        }
                    }
                });
            });
        }

        mainEditor.addEventListener('input', async () => {
            if (!currentRoomId || !isOnline) return;
            localChange = true;
            const roomRef = doc(db, 'rooms', currentRoomId);
            try {
                await updateDoc(roomRef, {
                    content: mainEditor.value,
                    updatedAt: serverTimestamp()
                });
            } catch (e) {}
        });

        function getMousePos(e) {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
            const clientY = e.clientY || (e.touches ? e.touches[0].clientY : 0);
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        }

        function startDrawing(e) {
            isDrawing = true;
            const pos = getMousePos(e);
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            e.preventDefault();
        }

        function draw(e) {
            if (!isDrawing) return;
            const pos = getMousePos(e);
            ctx.strokeStyle = brushColor.value;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
            e.preventDefault();
        }

        async function stopDrawing() {
            if (!isDrawing) return;
            isDrawing = false;
            localDrawing = true;

            if (currentRoomId && isOnline) {
                const roomRef = doc(db, 'rooms', currentRoomId);
                try {
                    await updateDoc(roomRef, {
                        drawing: canvas.toDataURL(),
                        updatedAt: serverTimestamp()
                    });
                } catch(e) {}
            }
        }

        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseleave', stopDrawing);

        canvas.addEventListener('touchstart', startDrawing);
        canvas.addEventListener('touchmove', draw);
        canvas.addEventListener('touchend', stopDrawing);

        clearCanvasBtn.addEventListener('click', async () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            localDrawing = true;
            if (currentRoomId && isOnline) {
                const roomRef = doc(db, 'rooms', currentRoomId);
                await updateDoc(roomRef, { drawing: '' });
            }
        });

        async function leaveCurrentRoom() {
            stopVoiceChat();
            if (presenceInterval) clearInterval(presenceInterval);
            if (textUnsubscribe) textUnsubscribe();
            if (presenceUnsubscribe) presenceUnsubscribe();
            if (signalUnsubscribe) signalUnsubscribe();
            if (chatUnsubscribe) chatUnsubscribe();

            if (currentRoomId && isOnline) {
                try {
                    const userPresenceRef = doc(db, 'rooms', currentRoomId, 'presence', currentUser.id);
                    await deleteDoc(userPresenceRef);
                } catch(e) {}
            }

            currentRoomId = null;
            mainEditor.value = '';
            chatMessagesList.innerHTML = '';
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            editorView.classList.add('hidden');
            lobbyView.classList.remove('hidden');
            roomIdInput.value = '';
            renderRecentRoomsUI();
        }

        leaveRoomBtn.addEventListener('click', leaveCurrentRoom);

        clearTextBtn.addEventListener('click', () => {
            showConfirmModal("Text leeren", "Möchtest du wirklich den gesamten Text im Editor löschen?", async () => {
                mainEditor.value = '';
                if (currentRoomId && isOnline) {
                    const roomRef = doc(db, 'rooms', currentRoomId);
                    await updateDoc(roomRef, { content: '' });
                }
            });
        });

        exportTxtBtn.addEventListener('click', () => {
            const blob = new Blob([mainEditor.value], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `notiz-${currentRoomId || 'dokument'}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        });

        copyRoomBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(currentRoomId);
            copyRoomBtn.innerHTML = '<i class="fa-solid fa-check text-emerald-600"></i>';
            setTimeout(() => { copyRoomBtn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 1500);
        });

        function escapeHtml(text) {
            return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }

        renderRecentRoomsUI();
    
