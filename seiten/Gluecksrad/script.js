        let wheelMode = 'equal'; // 'equal' or 'percent'
        let wheelOptions = ["1", "2", "3", "4", "5", "6"];
        let wheelPercentages = [16, 17, 17, 17, 17, 16]; // used in percent mode
        let wheelColors = []; 
        let currentRotationAngle = 0; 
        let isSpinningWheel = false;

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        function playSound(type) {
            if (!audioCtx) return;
            if (audioCtx.state === 'suspended') audioCtx.resume();
            
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            if (type === 'win') {
                const now = audioCtx.currentTime;
                [523.25, 659.25, 783.99, 1046.50].forEach((freq, index) => {
                    const o = audioCtx.createOscillator();
                    const g = audioCtx.createGain();
                    o.type = 'sine';
                    o.frequency.setValueAtTime(freq, now + index * 0.08);
                    g.gain.setValueAtTime(0.2, now + index * 0.08);
                    g.gain.linearRampToValueAtTime(0.01, now + index * 0.08 + 0.25);
                    o.connect(g);
                    g.connect(audioCtx.destination);
                    o.start(now + index * 0.08);
                    o.stop(now + index * 0.08 + 0.25);
                });
            } else if (type === 'tick') {
                osc.type = 'square';
                osc.frequency.setValueAtTime(400, audioCtx.currentTime);
                gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
                gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.03);
            }
        }

        function getRandomColor(index) {
            const hue = Math.floor(Math.random() * 360);
            const saturation = 75 + Math.floor(Math.random() * 20);
            const lightness = 45 + Math.floor(Math.random() * 15);
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        }

        function generateRandomColors() {
            wheelColors = [];
            for (let i = 0; i < wheelOptions.length; i++) {
                wheelColors.push(getRandomColor(i));
            }
        }

        function switchMode(mode) {
            if (isSpinningWheel) return;
            wheelMode = mode;

            const equalBtn = document.getElementById('modeEqualBtn');
            const percentBtn = document.getElementById('modePercentBtn');
            const countInput = document.getElementById('wheelCountInput');
            const countLabel = document.getElementById('countLabel');

            if (mode === 'equal') {
                equalBtn.className = "px-5 py-2 rounded-xl text-xs font-bold transition-all bg-amber-500 text-slate-950 shadow-md";
                percentBtn.className = "px-5 py-2 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-white";
                document.getElementById('percentSumWarning').classList.add('hidden');
                
                countInput.max = "999";
                countLabel.textContent = "Anzahl (1–999):";
            } else {
                percentBtn.className = "px-5 py-2 rounded-xl text-xs font-bold transition-all bg-indigo-600 text-slate-100 shadow-md";
                equalBtn.className = "px-5 py-2 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-white";

                countInput.max = "10";
                countLabel.textContent = "Anzahl (1–10):";
                if (wheelOptions.length > 10) {
                    wheelOptions = wheelOptions.slice(0, 10);
                }

                if (wheelPercentages.length !== wheelOptions.length) {
                    const equalVal = Math.floor(100 / wheelOptions.length);
                    wheelPercentages = wheelOptions.map(() => equalVal);
                    let sum = wheelPercentages.reduce((a, b) => a + b, 0);
                    if (wheelOptions.length > 0) {
                        wheelPercentages[wheelOptions.length - 1] += (100 - sum);
                    }
                }
                checkPercentSum();
            }
            initWheelInputs();
        }

        function checkPercentSum() {
            if (wheelMode !== 'percent') return true;
            let sum = wheelPercentages.reduce((a, b) => a + Number(b), 0);
            document.getElementById('currentSumText').textContent = sum;
            const warning = document.getElementById('percentSumWarning');
            if (sum !== 100) {
                warning.classList.remove('hidden');
                return false;
            } else {
                warning.classList.add('hidden');
                return true;
            }
        }

        function initWheelInputs() {
            const container = document.getElementById('wheelInputsContainer');
            container.innerHTML = '';
            document.getElementById('wheelCountInput').value = wheelOptions.length;

            if (wheelColors.length !== wheelOptions.length) {
                generateRandomColors();
            }

            wheelOptions.forEach((opt, index) => {
                const div = document.createElement('div');
                div.className = "flex items-center space-x-2";
                const color = wheelColors[index];

                let extraInputHtml = '';
                if (wheelMode === 'percent') {
                    const pct = wheelPercentages[index] !== undefined ? wheelPercentages[index] : 0;
                    extraInputHtml = `
                        <div class="flex items-center space-x-1 flex-shrink-0">
                            <input type="number" min="1" max="100" value="${pct}" oninput="updateWheelPercent(${index}, this.value)" class="w-14 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-amber-400 focus:outline-none focus:border-amber-500 text-center font-bold" placeholder="%">
                            <span class="text-xs text-slate-400">%</span>
                        </div>
                    `;
                }

                div.innerHTML = `
                    <span id="badge-${index}" class="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-slate-950 shadow-md" style="background-color: ${color}">${index + 1}</span>
                    <input type="text" value="${opt}" oninput="updateWheelOption(${index}, this.value)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500" placeholder="Zahl ${index + 1}">
                    ${extraInputHtml}
                `;
                container.appendChild(div);
            });
            drawWheel(currentRotationAngle);
        }

        function changeWheelCountByInput(val) {
            if (isSpinningWheel) return;
            let count = parseInt(val);
            const maxVal = wheelMode === 'percent' ? 10 : 999;
            if (isNaN(count) || count < 1) count = 1;
            if (count > maxVal) count = maxVal;
            
            document.getElementById('wheelCountInput').value = count;

            while (wheelOptions.length < count) {
                wheelOptions.push(`${wheelOptions.length + 1}`);
            }
            while (wheelOptions.length > count) {
                wheelOptions.pop();
            }

            if (wheelMode === 'percent') {
                const equalVal = Math.floor(100 / count);
                wheelPercentages = wheelOptions.map(() => equalVal);
                if (count > 0) {
                    wheelPercentages[count - 1] += (100 - (equalVal * count));
                }
                checkPercentSum();
            }

            generateRandomColors();
            initWheelInputs();
        }

        function updateWheelOption(index, val) {
            wheelOptions[index] = val;
            drawWheel(currentRotationAngle);
        }

        function updateWheelPercent(index, val) {
            wheelPercentages[index] = parseFloat(val) || 0;
            checkPercentSum();
            drawWheel(currentRotationAngle);
        }

        function randomizeWheelOptions() {
            if (isSpinningWheel) return;
            
            let count = wheelOptions.length;
            if (wheelMode === 'percent' || count < 2 || count > (wheelMode === 'percent' ? 10 : 20)) {
                count = Math.floor(Math.random() * 5) + 4;
            }

            wheelOptions = [];
            for (let i = 0; i < count; i++) {
                wheelOptions.push(`${i + 1}`);
            }

            if (wheelMode === 'percent') {
                const equalVal = Math.floor(100 / count);
                wheelPercentages = wheelOptions.map(() => equalVal);
                wheelPercentages[count - 1] += (100 - (equalVal * count));
                checkPercentSum();
            }

            generateRandomColors();
            initWheelInputs();
        }

        function getSegmentAngles() {
            const numSegments = wheelOptions.length;
            let segments = [];
            let currentAngle = 0;

            for (let i = 0; i < numSegments; i++) {
                let arcSize;
                if (wheelMode === 'percent') {
                    const pct = wheelPercentages[i] !== undefined ? wheelPercentages[i] : (100 / numSegments);
                    arcSize = (pct / 100) * 2 * Math.PI;
                } else {
                    arcSize = (2 * Math.PI) / numSegments;
                }

                segments.push({
                    index: i,
                    start: currentAngle,
                    end: currentAngle + arcSize,
                    arc: arcSize
                });
                currentAngle += arcSize;
            }
            return segments;
        }

        function drawWheel(angle) {
            const canvas = document.getElementById('wheelCanvas');
            const ctx = canvas.getContext('2d');
            const radius = canvas.width / 2;
            const segments = getSegmentAngles();

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.translate(radius, radius);
            ctx.rotate(angle);

            segments.forEach(seg => {
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, radius - 4, seg.start, seg.end);
                ctx.closePath();

                ctx.fillStyle = wheelColors[seg.index] || getRandomColor(seg.index);
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.strokeStyle = '#09090b';
                ctx.stroke();

                if (wheelOptions.length <= 40) {
                    ctx.save();
                    ctx.rotate(seg.start + seg.arc / 2);
                    ctx.textAlign = "right";
                    ctx.fillStyle = "#ffffff";
                    ctx.font = "bold " + (wheelOptions.length > 20 ? "9px" : "13px") + " Inter, sans-serif";
                    let labelText = wheelOptions[seg.index].substring(0, 10);
                    if (wheelMode === 'percent') {
                        labelText += ` (${wheelPercentages[seg.index]}%)`;
                    }
                    ctx.fillText(labelText, radius - 20, 5);
                    ctx.restore();
                }
            });

            ctx.restore();

            ctx.beginPath();
            ctx.arc(radius, radius, 22, 0, 2 * Math.PI);
            ctx.fillStyle = "#09090b";
            ctx.fill();
            ctx.lineWidth = 4;
            ctx.strokeStyle = "#facc15";
            ctx.stroke();
        }

        function spinWheel() {
            if (isSpinningWheel) return;
            if (wheelMode === 'percent' && !checkPercentSum()) {
                return;
            }

            isSpinningWheel = true;

            const btn = document.getElementById('spinButton');
            btn.disabled = true;
            btn.classList.add('opacity-70', 'cursor-not-allowed');

            document.getElementById('wheelMessageBox').classList.add('hidden');

            const segments = getSegmentAngles();
            
            let winningIndex = 0;
            if (wheelMode === 'percent') {
                const randVal = Math.random() * 100;
                let acc = 0;
                for (let i = 0; i < wheelPercentages.length; i++) {
                    acc += Number(wheelPercentages[i]);
                    if (randVal <= acc) {
                        winningIndex = i;
                        break;
                    }
                }
            } else {
                winningIndex = Math.floor(Math.random() * wheelOptions.length);
            }

            const winningSeg = segments[winningIndex];
            const randomOffset = (Math.random() * 0.8 + 0.1) * winningSeg.arc;
            const segmentCenterAngle = winningSeg.start + randomOffset;
            const targetRotation = (3 * Math.PI / 2) - segmentCenterAngle;

            const extraRounds = (6 + Math.floor(Math.random() * 4)) * 2 * Math.PI;
            const normalizedCurrent = currentRotationAngle % (2 * Math.PI);
            let targetNormalized = targetRotation % (2 * Math.PI);
            if (targetNormalized < 0) targetNormalized += 2 * Math.PI;

            let delta = targetNormalized - normalizedCurrent;
            if (delta <= 0) delta += 2 * Math.PI;

            const totalDelta = delta + extraRounds;
            const startAngle = currentRotationAngle;
            const duration = 4000;
            const startTime = performance.now();

            let lastTickSegment = -1;

            function animateWheel(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                const easeProgress = 1 - Math.pow(1 - progress, 3);
                currentRotationAngle = startAngle + (totalDelta * easeProgress);

                drawWheel(currentRotationAngle);

                const currentNormalized = (3 * Math.PI / 2 - currentRotationAngle) % (2 * Math.PI);
                const positiveNormalized = (currentNormalized + 2 * Math.PI) % (2 * Math.PI);
                
                let currentSegmentIdx = 0;
                for (let s of segments) {
                    if (positiveNormalized >= s.start && positiveNormalized < s.end) {
                        currentSegmentIdx = s.index;
                        break;
                    }
                }
                
                if (currentSegmentIdx !== lastTickSegment) {
                    playSound('tick');
                    lastTickSegment = currentSegmentIdx;
                }

                if (progress < 1) {
                    requestAnimationFrame(animateWheel);
                } else {
                    isSpinningWheel = false;
                    btn.disabled = false;
                    btn.classList.remove('opacity-70', 'cursor-not-allowed');

                    const winner = wheelOptions[winningIndex];

                    showWinnerModal(winner);
                    playSound('win');
                    triggerConfetti();
                }
            }

            requestAnimationFrame(animateWheel);
        }

        function showWinnerModal(winner) {
            const modal = document.getElementById('winnerModal');
            const modalContent = document.getElementById('winnerModalContent');
            const modalText = document.getElementById('winnerModalText');
            
            modalText.textContent = `${winner}!`;
            
            modal.classList.remove('opacity-0', 'pointer-events-none');
            modalContent.classList.remove('scale-95');
            modalContent.classList.add('scale-100');
        }

        function closeWinnerModal() {
            const modal = document.getElementById('winnerModal');
            const modalContent = document.getElementById('winnerModalContent');
            
            modal.classList.add('opacity-0', 'pointer-events-none');
            modalContent.classList.remove('scale-100');
            modalContent.classList.add('scale-95');
        }

        function triggerConfetti() {
            confetti({
                particleCount: 90,
                spread: 80,
                origin: { y: 0.6 },
                colors: ['#facc15', '#eab308', '#ca8a04', '#ffffff']
            });
        }

        window.addEventListener('DOMContentLoaded', () => {
            initWheelInputs();
        });
    
