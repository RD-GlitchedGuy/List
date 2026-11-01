        lucide.createIcons();

        // Audio Context & Global State
        let audioCtx = null;
        let tracks = []; // Array of track objects
        let isPlaying = false;
        let startTime = 0;
        let pauseOffset = 0;
        let ppx = 40; // pixels per second zoom factor

        let selectedMarker = null; // { trackId, markerId }
        let isDraggingPlayhead = false;

        // DOM Elements
        const addTrackBtn = document.getElementById('addTrackBtn');
        const trackFileInput = document.getElementById('trackFileInput');
        const exportBtn = document.getElementById('exportBtn');
        const exportText = document.getElementById('exportText');
        const playBtn = document.getElementById('playBtn');
        const stopBtn = document.getElementById('stopBtn');
        const masterGainSlider = document.getElementById('masterGainSlider');
        const masterGainVal = document.getElementById('masterGainVal');
        const zoomSlider = document.getElementById('zoomSlider');
        const zoomInBtn = document.getElementById('zoomInBtn');
        const zoomOutBtn = document.getElementById('zoomOutBtn');
        const zoomVal = document.getElementById('zoomVal');
        const currentTimeEl = document.getElementById('currentTime');
        const maxTimeEl = document.getElementById('maxTime');
        const trackCountEl = document.getElementById('trackCount');

        const trackControlsColumn = document.getElementById('trackControlsColumn');
        const tracksRowsContainer = document.getElementById('tracksRowsContainer');
        const emptyState = document.getElementById('emptyState');

        const rulerCanvas = document.getElementById('rulerCanvas');
        const rulerCanvasWrapper = document.getElementById('rulerCanvasWrapper');
        const rulerScrollContainer = document.getElementById('rulerScrollContainer');
        const timelineScrollContainer = document.getElementById('timelineScrollContainer');
        const timelineWrapper = document.getElementById('timelineWrapper');

        const playheadIndicator = document.getElementById('playheadIndicator');
        const playheadHandle = document.getElementById('playheadHandle');

        // Marker Form DOM Elements
        const selectedMarkerTime = document.getElementById('selectedMarkerTime');
        const nodeEditorForm = document.getElementById('nodeEditorForm');
        const nodeTrackLabel = document.getElementById('nodeTrackLabel');
        const nodeRampInput = document.getElementById('nodeRampInput');
        const nodeBassSlider = document.getElementById('nodeBassSlider');
        const nodeBassVal = document.getElementById('nodeBassVal');
        const nodeGainSlider = document.getElementById('nodeGainSlider');
        const nodeGainVal = document.getElementById('nodeGainVal');
        const nodeFilterSlider = document.getElementById('nodeFilterSlider');
        const nodeFilterVal = document.getElementById('nodeFilterVal');
        const deleteNodeBtn = document.getElementById('deleteNodeBtn');

        // Synchronize Horizontal Scroll between Ruler and Timeline Workspace
        timelineScrollContainer.addEventListener('scroll', () => {
            rulerScrollContainer.scrollLeft = timelineScrollContainer.scrollLeft;
        });

        // Initialize Web Audio Context
        function initAudioContext() {
            if (!audioCtx) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                audioCtx = new AudioContext();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
        }

        // Add Track File Trigger
        addTrackBtn.addEventListener('click', () => {
            initAudioContext();
            trackFileInput.click();
        });

        trackFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                Array.from(e.target.files).forEach(file => loadAudioFileAsTrack(file));
                trackFileInput.value = '';
            }
        });

        // Global Drag & Drop Files onto Track Workspace
        window.addEventListener('dragover', (e) => e.preventDefault());
        window.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length > 0) {
                initAudioContext();
                Array.from(e.dataTransfer.files).forEach(file => {
                    if (file.type.startsWith('audio/')) loadAudioFileAsTrack(file);
                });
            }
        });

        // Load Audio File and Create Track Model
        async function loadAudioFileAsTrack(file) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

                const newTrack = {
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    name: file.name.replace(/\.[^/.]+$/, ""),
                    buffer: audioBuffer,
                    offset: 0, // Start offset in seconds
                    volume: 1.0,
                    pan: 0,
                    bass: 0,
                    speed: 1.0,
                    muted: false,
                    soloed: false,
                    markers: [], // Array of { id, time, bass, gain, filter, ramp }
                    sourceNode: null
                };

                tracks.push(newTrack);
                updateTracksUI();

            } catch (err) {
                alert('Fehler beim Laden der Audiodatei: ' + err.message);
            }
        }

        // Calculate maximum duration of project
        function getMaxDuration() {
            let max = 0;
            tracks.forEach(t => {
                const end = t.offset + (t.buffer ? t.buffer.duration / t.speed : 0);
                if (end > max) max = end;
            });
            return Math.max(max, 30); // minimum 30s workspace width
        }

        function updateMaxDurationDisplay() {
            maxTimeEl.textContent = formatTime(getMaxDuration());
        }

        // Update Workspace & Multi-Track UI
        function updateTracksUI() {
            if (tracks.length === 0) {
                emptyState.style.display = 'flex';
                playBtn.disabled = true;
                stopBtn.disabled = true;
                exportBtn.disabled = true;
            } else {
                emptyState.style.display = 'none';
                playBtn.disabled = false;
                stopBtn.disabled = false;
                exportBtn.disabled = false;
            }

            trackCountEl.textContent = tracks.length;

            const maxDuration = getMaxDuration();
            const totalWidthPx = Math.max(maxDuration * ppx, timelineScrollContainer.clientWidth);

            // Update width of containers for scrolling
            timelineWrapper.style.width = `${totalWidthPx}px`;
            rulerCanvasWrapper.style.width = `${totalWidthPx}px`;

            renderTrackControlsAndRows(totalWidthPx);
            renderRuler(totalWidthPx);
            updateMaxDurationDisplay();
            updatePlayheadPosition();
        }

        // Render Track Control Cards (Left) and Waveform Rows (Right)
        function renderTrackControlsAndRows(totalWidthPx) {
            trackControlsColumn.innerHTML = '';
            tracksRowsContainer.innerHTML = '';

            if (tracks.length === 0) {
                tracksRowsContainer.appendChild(emptyState);
                return;
            }

            tracks.forEach((track) => {
                // 1. Left Control Panel Card
                const ctrlPanel = document.createElement('div');
                ctrlPanel.className = 'h-24 p-3 space-y-2 flex flex-col justify-between';
                ctrlPanel.innerHTML = `
                    <div class="flex items-center justify-between">
                        <input type="text" value="${track.name}" class="track-name-input bg-transparent text-xs font-medium text-white truncate border-b border-transparent hover:border-studio-border focus:border-white focus:outline-none w-32">
                        <div class="flex items-center space-x-1">
                            <button class="mute-btn px-1.5 py-0.5 text-[10px] font-mono rounded ${track.muted ? 'bg-red-900/80 text-red-200' : 'bg-studio-bg border border-studio-border text-studio-muted hover:text-white'}">M</button>
                            <button class="solo-btn px-1.5 py-0.5 text-[10px] font-mono rounded ${track.soloed ? 'bg-yellow-600/80 text-white' : 'bg-studio-bg border border-studio-border text-studio-muted hover:text-white'}">S</button>
                            <button class="delete-track-btn text-studio-muted hover:text-red-400 p-1"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                            <div class="flex justify-between text-studio-muted mb-0.5">
                                <span>Vol</span>
                                <span class="vol-val text-white font-mono">${Math.round(track.volume * 100)}%</span>
                            </div>
                            <input type="range" class="vol-slider w-full" min="0" max="2.0" value="${track.volume}" step="0.05">
                        </div>
                        <div>
                            <div class="flex justify-between text-studio-muted mb-0.5">
                                <span>Pan</span>
                                <span class="pan-val text-white font-mono">${track.pan}</span>
                            </div>
                            <input type="range" class="pan-slider w-full" min="-1" max="1" value="${track.pan}" step="0.1">
                        </div>
                    </div>

                    <div class="flex justify-between items-center text-[10px] text-studio-muted">
                        <span>Offset: <strong class="offset-val text-white font-mono">${track.offset.toFixed(1)}s</strong></span>
                        <span>Bass: <strong class="text-white font-mono">${track.bass > 0 ? '+' : ''}${track.bass}dB</strong></span>
                    </div>
                `;

                trackControlsColumn.appendChild(ctrlPanel);

                // 2. Right Track Timeline Row
                const timelineRow = document.createElement('div');
                timelineRow.className = 'h-24 relative bg-studio-bg overflow-hidden cursor-crosshair select-none';
                timelineRow.style.width = `${totalWidthPx}px`;

                // Draggable Waveform Block
                const waveBlock = document.createElement('div');
                waveBlock.className = 'waveform-block';
                const blockLeft = track.offset * ppx;
                const blockWidth = (track.buffer.duration / track.speed) * ppx;
                waveBlock.style.left = `${blockLeft}px`;
                waveBlock.style.width = `${blockWidth}px`;

                const canvas = document.createElement('canvas');
                canvas.className = 'w-full h-full block';
                waveBlock.appendChild(canvas);
                timelineRow.appendChild(waveBlock);

                // Markers Layer
                const markersContainer = document.createElement('div');
                markersContainer.className = 'absolute inset-0 pointer-events-none z-20';
                timelineRow.appendChild(markersContainer);

                tracksRowsContainer.appendChild(timelineRow);

                // Draw Waveform and Markers
                drawWaveform(canvas, track.buffer);
                renderTrackMarkers(track, timelineRow, markersContainer);

                // Event Listeners for Track Controls
                ctrlPanel.querySelector('.track-name-input').addEventListener('change', (e) => track.name = e.target.value);
                ctrlPanel.querySelector('.mute-btn').addEventListener('click', () => {
                    track.muted = !track.muted;
                    updateTracksUI();
                    if (isPlaying) refreshPlayback();
                });
                ctrlPanel.querySelector('.solo-btn').addEventListener('click', () => {
                    track.soloed = !track.soloed;
                    updateTracksUI();
                    if (isPlaying) refreshPlayback();
                });
                ctrlPanel.querySelector('.delete-track-btn').addEventListener('click', () => {
                    tracks = tracks.filter(t => t.id !== track.id);
                    updateTracksUI();
                    if (isPlaying) refreshPlayback();
                });

                ctrlPanel.querySelector('.vol-slider').addEventListener('input', (e) => {
                    track.volume = parseFloat(e.target.value);
                    ctrlPanel.querySelector('.vol-val').textContent = `${Math.round(track.volume * 100)}%`;
                    if (isPlaying) refreshPlayback();
                });

                ctrlPanel.querySelector('.pan-slider').addEventListener('input', (e) => {
                    track.pan = parseFloat(e.target.value);
                    ctrlPanel.querySelector('.pan-val').textContent = track.pan;
                    if (isPlaying) refreshPlayback();
                });

                // Dragging Track Waveform Block Horizontally
                let isDraggingBlock = false;
                let startX = 0;
                let startOffset = 0;

                waveBlock.addEventListener('mousedown', (e) => {
                    if (e.button !== 0) return; // Left click drag only
                    e.stopPropagation();
                    isDraggingBlock = true;
                    startX = e.clientX;
                    startOffset = track.offset;

                    const onMouseMove = (moveEvt) => {
                        if (!isDraggingBlock) return;
                        const deltaX = moveEvt.clientX - startX;
                        const deltaSec = deltaX / ppx;
                        track.offset = Math.max(0, startOffset + deltaSec);
                        waveBlock.style.left = `${track.offset * ppx}px`;
                        ctrlPanel.querySelector('.offset-val').textContent = `${track.offset.toFixed(1)}s`;
                    };

                    const onMouseUp = () => {
                        isDraggingBlock = false;
                        window.removeEventListener('mousemove', onMouseMove);
                        window.removeEventListener('mouseup', onMouseUp);
                        updateMaxDurationDisplay();
                        renderRuler(totalWidthPx);
                        if (isPlaying) refreshPlayback();
                    };

                    window.addEventListener('mousemove', onMouseMove);
                    window.addEventListener('mouseup', onMouseUp);
                });

                // Left Click on Track Timeline Row: Seek Playhead Position
                timelineRow.addEventListener('click', (e) => {
                    if (e.target.classList.contains('timeline-node')) return;
                    const rect = timelineRow.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const seekTime = clickX / ppx;
                    seekToTime(seekTime);
                });

                // RIGHT CLICK on Track Timeline Row: Create Automation Marker
                timelineRow.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    if (e.target.classList.contains('timeline-node')) return;

                    const rect = timelineRow.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const markerTime = Math.round((clickX / ppx) * 10) / 10;

                    const newMarker = {
                        id: Date.now() + Math.random(),
                        time: markerTime,
                        bass: 6,
                        gain: 1.0,
                        filter: 20000,
                        ramp: 'linear'
                    };

                    track.markers.push(newMarker);
                    track.markers.sort((a, b) => a.time - b.time);
                    selectedMarker = { trackId: track.id, markerId: newMarker.id };
                    
                    updateTracksUI();
                    updateMarkerEditorForm();
                    if (isPlaying) refreshPlayback();
                });

            });

            lucide.createIcons();
        }

        // Draw Waveform onto Canvas
        function drawWaveform(canvas, audioBuffer) {
            const width = canvas.width = canvas.parentElement.clientWidth;
            const height = canvas.height = canvas.parentElement.clientHeight;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#121215';
            ctx.fillRect(0, 0, width, height);

            const data = audioBuffer.getChannelData(0);
            const step = Math.ceil(data.length / width);
            const amp = height / 2;

            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < width; i++) {
                let min = 1.0;
                let max = -1.0;
                for (let j = 0; j < step; j++) {
                    const datum = data[(i * step) + j];
                    if (datum < min) min = datum;
                    if (datum > max) max = datum;
                }
                ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
            }
        }

        // Render Markers on Track Timeline
        function renderTrackMarkers(track, timelineRow, markersContainer) {
            markersContainer.innerHTML = '';

            track.markers.forEach((m) => {
                const nodeX = m.time * ppx;

                const nodeEl = document.createElement('div');
                const isSelected = selectedMarker && selectedMarker.trackId === track.id && selectedMarker.markerId === m.id;
                nodeEl.className = `timeline-node pointer-events-auto ${isSelected ? 'active' : ''}`;
                nodeEl.style.left = `${nodeX}px`;

                const labelEl = document.createElement('div');
                labelEl.className = 'node-label';
                labelEl.textContent = `${formatTime(m.time)} | ${m.bass > 0 ? '+' : ''}${m.bass}dB`;
                nodeEl.appendChild(labelEl);

                // RIGHT CLICK on Marker = DELETE
                nodeEl.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    track.markers = track.markers.filter(item => item.id !== m.id);
                    if (selectedMarker && selectedMarker.markerId === m.id) {
                        selectedMarker = null;
                        updateMarkerEditorForm();
                    }
                    updateTracksUI();
                    if (isPlaying) refreshPlayback();
                });

                // LEFT CLICK on Marker = SELECT & DRAG
                nodeEl.addEventListener('mousedown', (e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();

                    selectedMarker = { trackId: track.id, markerId: m.id };
                    updateTracksUI();
                    updateMarkerEditorForm();

                    let isDragging = false;
                    const startX = e.clientX;

                    const onMouseMove = (moveEvt) => {
                        if (Math.abs(moveEvt.clientX - startX) > 2) isDragging = true;
                        if (isDragging) {
                            const rect = timelineRow.getBoundingClientRect();
                            const clickX = moveEvt.clientX - rect.left;
                            m.time = Math.max(0, Math.round((clickX / ppx) * 10) / 10);
                            nodeEl.style.left = `${m.time * ppx}px`;
                            labelEl.textContent = `${formatTime(m.time)} | ${m.bass > 0 ? '+' : ''}${m.bass}dB`;
                        }
                    };

                    const onMouseUp = () => {
                        window.removeEventListener('mousemove', onMouseMove);
                        window.removeEventListener('mouseup', onMouseUp);
                        if (isDragging) {
                            track.markers.sort((a, b) => a.time - b.time);
                            updateTracksUI();
                            if (isPlaying) refreshPlayback();
                        }
                    };

                    window.addEventListener('mousemove', onMouseMove);
                    window.addEventListener('mouseup', onMouseUp);
                });

                markersContainer.appendChild(nodeEl);
            });
        }

        // Render Global Ruler Canvas
        function renderRuler(totalWidthPx) {
            const width = rulerCanvas.width = totalWidthPx;
            const height = rulerCanvas.height = rulerScrollContainer.clientHeight;
            const ctx = rulerCanvas.getContext('2d');

            ctx.fillStyle = '#0a0a0c';
            ctx.fillRect(0, 0, width, height);

            ctx.fillStyle = '#71717a';
            ctx.strokeStyle = '#232328';
            ctx.font = '9px monospace';

            const maxDuration = getMaxDuration();
            const secStep = ppx < 20 ? 10 : (ppx < 50 ? 5 : 1);

            for (let sec = 0; sec <= maxDuration; sec += secStep) {
                const x = sec * ppx;
                ctx.beginPath();
                ctx.moveTo(x, height - 10);
                ctx.lineTo(x, height);
                ctx.stroke();

                ctx.fillText(`${sec}s`, x + 3, height - 4);
            }
        }

        // Ruler Left-Click & Drag to Seek Playhead
        rulerCanvas.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            const rect = rulerCanvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            seekToTime(clickX / ppx);

            isDraggingPlayhead = true;

            const onMouseMove = (moveEvt) => {
                if (!isDraggingPlayhead) return;
                const r = rulerCanvas.getBoundingClientRect();
                const x = moveEvt.clientX - r.left;
                seekToTime(x / ppx);
            };

            const onMouseUp = () => {
                isDraggingPlayhead = false;
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });

        // Playhead Top Handle Dragging
        playheadHandle.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            isDraggingPlayhead = true;

            const onMouseMove = (moveEvt) => {
                if (!isDraggingPlayhead) return;
                const rect = timelineWrapper.getBoundingClientRect();
                const x = moveEvt.clientX - rect.left;
                seekToTime(x / ppx);
            };

            const onMouseUp = () => {
                isDraggingPlayhead = false;
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });

        // Zoom Controls Logic & Mouse Wheel Zooming
        function setZoomLevel(newPpx) {
            ppx = Math.max(10, Math.min(200, newPpx));
            zoomSlider.value = ppx;
            zoomVal.textContent = `${ppx}px/s`;
            updateTracksUI();
        }

        zoomSlider.addEventListener('input', (e) => setZoomLevel(parseInt(e.target.value)));
        zoomInBtn.addEventListener('click', () => setZoomLevel(ppx + 10));
        zoomOutBtn.addEventListener('click', () => setZoomLevel(ppx - 10));

        // Ctrl + Wheel Horizontal Zooming in Timeline
        timelineScrollContainer.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const zoomFactor = e.deltaY < 0 ? 5 : -5;
                setZoomLevel(ppx + zoomFactor);
            }
        }, { passive: false });

        // Update Position of Red Playhead Zeiger
        function updatePlayheadPosition() {
            let currentPos = pauseOffset;
            if (isPlaying && audioCtx) {
                currentPos = pauseOffset + (audioCtx.currentTime - startTime);
            }
            const posX = currentPos * ppx;
            playheadIndicator.style.left = `${posX}px`;
            playheadHandle.textContent = formatTime(currentPos).substring(0, 5);
        }

        // Marker Form Controls Logic
        function updateMarkerEditorForm() {
            if (!selectedMarker) {
                selectedMarkerTime.textContent = 'Kein Punkt ausgewählt';
                nodeEditorForm.classList.add('opacity-40', 'pointer-events-none');
                return;
            }

            const track = tracks.find(t => t.id === selectedMarker.trackId);
            if (!track) return;

            const m = track.markers.find(item => item.id === selectedMarker.markerId);
            if (!m) {
                selectedMarker = null;
                updateMarkerEditorForm();
                return;
            }

            selectedMarkerTime.textContent = `Marker bei ${formatTime(m.time)}`;
            nodeTrackLabel.textContent = track.name;
            nodeEditorForm.classList.remove('opacity-40', 'pointer-events-none');

            nodeRampInput.value = m.ramp;
            nodeBassSlider.value = m.bass;
            nodeBassVal.textContent = `${m.bass > 0 ? '+' : ''}${m.bass} dB`;
            nodeGainSlider.value = m.gain;
            nodeGainVal.textContent = `${Math.round(m.gain * 100)}%`;
            nodeFilterSlider.value = m.filter;
            nodeFilterVal.textContent = m.filter >= 20000 ? 'Aus' : `${m.filter} Hz`;
        }

        nodeRampInput.addEventListener('change', (e) => {
            if (!selectedMarker) return;
            const track = tracks.find(t => t.id === selectedMarker.trackId);
            const m = track?.markers.find(item => item.id === selectedMarker.markerId);
            if (m) {
                m.ramp = e.target.value;
                if (isPlaying) refreshPlayback();
            }
        });

        nodeBassSlider.addEventListener('input', (e) => {
            if (!selectedMarker) return;
            const track = tracks.find(t => t.id === selectedMarker.trackId);
            const m = track?.markers.find(item => item.id === selectedMarker.markerId);
            if (m) {
                m.bass = parseInt(e.target.value);
                nodeBassVal.textContent = `${m.bass > 0 ? '+' : ''}${m.bass} dB`;
                updateTracksUI();
                if (isPlaying) refreshPlayback();
            }
        });

        nodeGainSlider.addEventListener('input', (e) => {
            if (!selectedMarker) return;
            const track = tracks.find(t => t.id === selectedMarker.trackId);
            const m = track?.markers.find(item => item.id === selectedMarker.markerId);
            if (m) {
                m.gain = parseFloat(e.target.value);
                nodeGainVal.textContent = `${Math.round(m.gain * 100)}%`;
                if (isPlaying) refreshPlayback();
            }
        });

        nodeFilterSlider.addEventListener('input', (e) => {
            if (!selectedMarker) return;
            const track = tracks.find(t => t.id === selectedMarker.trackId);
            const m = track?.markers.find(item => item.id === selectedMarker.markerId);
            if (m) {
                m.filter = parseInt(e.target.value);
                nodeFilterVal.textContent = m.filter >= 20000 ? 'Aus' : `${m.filter} Hz`;
                if (isPlaying) refreshPlayback();
            }
        });

        deleteNodeBtn.addEventListener('click', () => {
            if (!selectedMarker) return;
            const track = tracks.find(t => t.id === selectedMarker.trackId);
            if (track) {
                track.markers = track.markers.filter(item => item.id !== selectedMarker.markerId);
                selectedMarker = null;
                updateMarkerEditorForm();
                updateTracksUI();
                if (isPlaying) refreshPlayback();
            }
        });

        // Multi-Track Audio Playback Engine
        function playMultiTrack() {
            initAudioContext();
            if (tracks.length === 0) return;

            if (isPlaying) {
                pauseOffset += audioCtx.currentTime - startTime;
                stopTrackNodes();
                isPlaying = false;
                playBtn.innerHTML = '<i data-lucide="play" class="w-4 h-4 fill-current"></i>';
                lucide.createIcons();
                return;
            }

            startMultiTrackNodes(pauseOffset);
            startTime = audioCtx.currentTime;
            isPlaying = true;

            playBtn.innerHTML = '<i data-lucide="pause" class="w-4 h-4 fill-current"></i>';
            lucide.createIcons();
        }

        function stopTrackNodes() {
            tracks.forEach(track => {
                if (track.sourceNode) {
                    try { track.sourceNode.stop(); } catch(e) {}
                    track.sourceNode = null;
                }
            });
        }

        function stopMultiTrack() {
            stopTrackNodes();
            isPlaying = false;
            pauseOffset = 0;
            if (playBtn) {
                playBtn.innerHTML = '<i data-lucide="play" class="w-4 h-4 fill-current"></i>';
                lucide.createIcons();
            }
            currentTimeEl.textContent = '00:00.0';
            updatePlayheadPosition();
        }

        function seekToTime(targetTime) {
            const maxDuration = getMaxDuration();
            pauseOffset = Math.max(0, Math.min(maxDuration, targetTime));

            if (isPlaying) {
                stopTrackNodes();
                startMultiTrackNodes(pauseOffset);
                startTime = audioCtx.currentTime;
            } else {
                currentTimeEl.textContent = formatTime(pauseOffset);
                updatePlayheadPosition();
            }
        }

        function refreshPlayback() {
            if (!isPlaying) return;
            const currentPos = pauseOffset + (audioCtx.currentTime - startTime);
            pauseOffset = currentPos;
            stopTrackNodes();
            startMultiTrackNodes(pauseOffset);
            startTime = audioCtx.currentTime;
        }

        // Start Web Audio nodes for each track based on offset
        function startMultiTrackNodes(globalOffset) {
            const hasSolo = tracks.some(t => t.soloed);
            const masterGainVal = parseFloat(masterGainSlider.value);

            tracks.forEach(track => {
                if (track.muted || (hasSolo && !track.soloed)) return;

                const trackDuration = track.buffer.duration / track.speed;
                const trackStart = track.offset;
                const trackEnd = track.offset + trackDuration;

                if (globalOffset < trackEnd) {
                    const source = audioCtx.createBufferSource();
                    source.buffer = track.buffer;
                    source.playbackRate.value = track.speed;

                    const gainNode = audioCtx.createGain();
                    gainNode.gain.value = track.volume * masterGainVal;

                    const bassFilter = audioCtx.createBiquadFilter();
                    bassFilter.type = 'lowshelf';
                    bassFilter.frequency.value = 100;
                    bassFilter.gain.value = track.bass;

                    const lowpassFilter = audioCtx.createBiquadFilter();
                    lowpassFilter.type = 'lowpass';
                    lowpassFilter.frequency.value = 20000;

                    const pannerNode = audioCtx.createStereoPanner();
                    pannerNode.pan.value = track.pan;

                    source.connect(gainNode);
                    gainNode.connect(bassFilter);
                    bassFilter.connect(lowpassFilter);
                    lowpassFilter.connect(pannerNode);
                    pannerNode.connect(audioCtx.destination);

                    track.sourceNode = source;

                    applyTrackMarkers(audioCtx, track, gainNode, bassFilter, lowpassFilter, globalOffset);

                    let bufferOffset = 0;
                    let delayTime = 0;

                    if (globalOffset > trackStart) {
                        bufferOffset = (globalOffset - trackStart) * track.speed;
                    } else {
                        delayTime = trackStart - globalOffset;
                    }

                    source.start(audioCtx.currentTime + delayTime, bufferOffset);
                }
            });
        }

        function applyTrackMarkers(context, track, gainNode, bassFilter, lowpassFilter, globalOffset) {
            const now = context.currentTime;
            if (!track.markers || track.markers.length === 0) return;

            const sorted = [...track.markers].sort((a, b) => a.time - b.time);

            sorted.forEach(m => {
                const targetTime = now + (m.time - globalOffset);
                if (targetTime >= now) {
                    if (m.ramp === 'linear') {
                        bassFilter.gain.linearRampToValueAtTime(m.bass, targetTime);
                        gainNode.gain.linearRampToValueAtTime(m.gain * track.volume, targetTime);
                        lowpassFilter.frequency.linearRampToValueAtTime(m.filter, targetTime);
                    } else {
                        bassFilter.gain.setValueAtTime(m.bass, targetTime);
                        gainNode.gain.setValueAtTime(m.gain * track.volume, targetTime);
                        lowpassFilter.frequency.setValueAtTime(m.filter, targetTime);
                    }
                }
            });
        }

        playBtn.addEventListener('click', playMultiTrack);
        stopBtn.addEventListener('click', stopMultiTrack);

        masterGainSlider.addEventListener('input', (e) => {
            masterGainVal.textContent = `${Math.round(e.target.value * 100)}%`;
            if (isPlaying) refreshPlayback();
        });

        // Global Animation Loop
        function renderPlayheadLoop() {
            requestAnimationFrame(renderPlayheadLoop);

            if (isPlaying && audioCtx) {
                const currentPos = pauseOffset + (audioCtx.currentTime - startTime);
                const maxDur = getMaxDuration();
                if (currentPos >= maxDur) {
                    stopMultiTrack();
                } else {
                    currentTimeEl.textContent = formatTime(currentPos);
                    updatePlayheadPosition();
                }
            }
        }
        renderPlayheadLoop();

        // High-Quality Multi-Track WAV Export
        exportBtn.addEventListener('click', async () => {
            if (tracks.length === 0) return;

            exportBtn.disabled = true;
            exportText.textContent = 'Mische Spuren...';

            try {
                const sampleRate = 44100;
                const maxDuration = getMaxDuration();
                const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * maxDuration), sampleRate);

                const hasSolo = tracks.some(t => t.soloed);
                const masterGainVal = parseFloat(masterGainSlider.value);

                tracks.forEach(track => {
                    if (track.muted || (hasSolo && !track.soloed)) return;

                    const offSource = offlineCtx.createBufferSource();
                    offSource.buffer = track.buffer;
                    offSource.playbackRate.value = track.speed;

                    const offGain = offlineCtx.createGain();
                    offGain.gain.value = track.volume * masterGainVal;

                    const offBass = offlineCtx.createBiquadFilter();
                    offBass.type = 'lowshelf';
                    offBass.frequency.value = 100;
                    offBass.gain.value = track.bass;

                    const offFilter = offlineCtx.createBiquadFilter();
                    offFilter.type = 'lowpass';
                    offFilter.frequency.value = 20000;

                    const offPanner = offlineCtx.createStereoPanner();
                    offPanner.pan.value = track.pan;

                    offSource.connect(offGain);
                    offGain.connect(offBass);
                    offBass.connect(offFilter);
                    offFilter.connect(offPanner);
                    offPanner.connect(offlineCtx.destination);

                    if (track.markers && track.markers.length > 0) {
                        track.markers.forEach(m => {
                            if (m.ramp === 'linear') {
                                offBass.gain.linearRampToValueAtTime(m.bass, m.time);
                                offGain.gain.linearRampToValueAtTime(m.gain * track.volume * masterGainVal, m.time);
                                offFilter.frequency.linearRampToValueAtTime(m.filter, m.time);
                            } else {
                                offBass.gain.setValueAtTime(m.bass, m.time);
                                offGain.gain.setValueAtTime(m.gain * track.volume * masterGainVal, m.time);
                                offFilter.frequency.setValueAtTime(m.filter, m.time);
                            }
                        });
                    }

                    offSource.start(track.offset);
                });

                const renderedBuffer = await offlineCtx.startRendering();
                const wavBlob = audioBufferToWav(renderedBuffer);

                const url = URL.createObjectURL(wavBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'multi_track_mix.wav';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                }, 1000);

            } catch (err) {
                alert('Export-Fehler: ' + err.message);
            } finally {
                exportBtn.disabled = false;
                exportText.textContent = 'Export (.wav)';
            }
        });

        // WAV Encoding Functions
        function audioBufferToWav(buffer) {
            const numChannels = buffer.numberOfChannels;
            const sampleRate = buffer.sampleRate;
            const format = 1;
            const bitDepth = 16;

            let result;
            if (numChannels === 2) {
                result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
            } else {
                result = buffer.getChannelData(0);
            }

            return encodeWAV(result, numChannels, sampleRate, format, bitDepth);
        }

        function interleave(inputL, inputR) {
            const length = inputL.length + inputR.length;
            const result = new Float32Array(length);
            let index = 0;
            let inputIndex = 0;

            while (index < length) {
                result[index++] = inputL[inputIndex];
                result[index++] = inputR[inputIndex];
                inputIndex++;
            }
            return result;
        }

        function encodeWAV(samples, numChannels, sampleRate, format, bitDepth) {
            const bytesPerSample = bitDepth / 8;
            const blockAlign = numChannels * bytesPerSample;
            const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
            const view = new DataView(buffer);

            writeString(view, 0, 'RIFF');
            view.setUint32(4, 36 + samples.length * bytesPerSample, true);
            writeString(view, 8, 'WAVE');
            writeString(view, 12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, format, true);
            view.setUint16(22, numChannels, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate * blockAlign, true);
            view.setUint16(32, blockAlign, true);
            view.setUint16(34, bitDepth, true);
            writeString(view, 36, 'data');
            view.setUint32(40, samples.length * bytesPerSample, true);

            floatTo16BitPCM(view, 44, samples);

            return new Blob([view], { type: 'audio/wav' });
        }

        function floatTo16BitPCM(output, offset, input) {
            for (let i = 0; i < input.length; i++, offset += 2) {
                const s = Math.max(-1, Math.min(1, input[i]));
                output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            }
        }

        function writeString(view, offset, string) {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        }

        function formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            const ms = Math.floor((seconds % 1) * 10);
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
        }
    
