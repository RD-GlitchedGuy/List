        const DEFAULT_EVENTS = [
            {
                id: 'weihnachten',
                title: 'Weihnachten (Heiligabend)',
                month: 11,
                day: 24,
                category: 'holiday',
                theme: 'snow',
                glowColor: 'radial-gradient(circle, rgba(16, 185, 129, 0.4) 0%, rgba(225, 29, 72, 0.3) 50%, rgba(3, 7, 18, 0) 80%)',
                recurring: true,
                type: 'fixed',
                hasTime: false,
                color: 'from-emerald-700 via-teal-800 to-slate-950',
                badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
            },
            {
                id: 'silvester',
                title: 'Silvester / Neujahr',
                month: 11,
                day: 31,
                hour: 23,
                minute: 59,
                category: 'holiday',
                theme: 'fireworks',
                glowColor: 'radial-gradient(circle, rgba(139, 92, 246, 0.4) 0%, rgba(245, 158, 11, 0.3) 50%, rgba(3, 7, 18, 0) 80%)',
                recurring: true,
                type: 'fixed',
                hasTime: true,
                color: 'from-purple-700 via-indigo-800 to-slate-950',
                badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
            },
            {
                id: 'ostern',
                title: 'Ostersonntag',
                category: 'holiday',
                theme: 'spring',
                glowColor: 'radial-gradient(circle, rgba(245, 158, 11, 0.35) 0%, rgba(236, 72, 153, 0.25) 50%, rgba(3, 7, 18, 0) 80%)',
                recurring: true,
                type: 'easter_based',
                easterOffset: 0,
                hasTime: false,
                color: 'from-amber-600 via-yellow-700 to-slate-950',
                badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
            },
            {
                id: 'nikolaus',
                title: 'Nikolaustag',
                month: 11,
                day: 6,
                category: 'holiday',
                theme: 'snow',
                glowColor: 'radial-gradient(circle, rgba(244, 63, 94, 0.4) 0%, rgba(15, 23, 42, 0.2) 60%, rgba(3, 7, 18, 0) 80%)',
                recurring: true,
                type: 'fixed',
                hasTime: false,
                color: 'from-red-700 via-rose-800 to-slate-950',
                badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
            },
            {
                id: 'halloween',
                title: 'Halloween',
                month: 9,
                day: 31,
                category: 'holiday',
                theme: 'spooky',
                glowColor: 'radial-gradient(circle, rgba(249, 115, 22, 0.4) 0%, rgba(147, 51, 234, 0.3) 50%, rgba(3, 7, 18, 0) 80%)',
                recurring: true,
                type: 'fixed',
                hasTime: false,
                color: 'from-orange-700 via-purple-900 to-slate-950',
                badgeBg: 'bg-orange-500/20 text-orange-300 border-orange-500/30'
            },
            {
                id: 'valentinstag',
                title: 'Valentinstag',
                month: 1,
                day: 14,
                category: 'holiday',
                theme: 'love',
                glowColor: 'radial-gradient(circle, rgba(244, 63, 94, 0.4) 0%, rgba(236, 72, 153, 0.3) 50%, rgba(3, 7, 18, 0) 80%)',
                recurring: true,
                type: 'fixed',
                hasTime: false,
                color: 'from-pink-700 via-rose-800 to-slate-950',
                badgeBg: 'bg-pink-500/20 text-pink-300 border-pink-500/30'
            },
            {
                id: 'sommeranfang',
                title: 'Sommeranfang',
                month: 5,
                day: 21,
                category: 'season',
                theme: 'summer',
                glowColor: 'radial-gradient(circle, rgba(14, 165, 233, 0.35) 0%, rgba(245, 158, 11, 0.3) 50%, rgba(3, 7, 18, 0) 80%)',
                recurring: true,
                type: 'fixed',
                hasTime: false,
                color: 'from-sky-700 via-blue-800 to-slate-950',
                badgeBg: 'bg-sky-500/20 text-sky-300 border-sky-500/30'
            }
        ];

        // Global Application State & Caching
        let customEvents = [];
        let activeFilter = 'all';
        let searchQuery = '';
        let sortBy = 'time';
        let currentTheme = 'snow';
        let currentHeroId = null;

        const DOM = {};
        const eventNodeCache = new Map();
        let heroNodeRefs = null;

        // LocalStorage Management (Account/Device binding)
        function loadCustomEvents() {
            try {
                const stored = localStorage.getItem('countdown_custom_events');
                if (stored) {
                    customEvents = JSON.parse(stored);
                }
            } catch (e) {
                console.error("Fehler beim Laden der lokalen Events:", e);
                customEvents = [];
            }
        }

        function saveCustomEvents() {
            try {
                localStorage.setItem('countdown_custom_events', JSON.stringify(customEvents));
            } catch (e) {
                console.error("Fehler beim Speichern der lokalen Events:", e);
            }
        }

        function getAllEventsCombined() {
            return [...DEFAULT_EVENTS, ...customEvents];
        }

        function calculateEasterSunday(year) {
            const a = year % 19;
            const b = Math.floor(year / 100);
            const c = year % 100;
            const d = Math.floor(b / 4);
            const e = b % 4;
            const f = Math.floor((b + 8) / 25);
            const g = Math.floor((b - f + 1) / 3);
            const h = (19 * a + b - d - g + 15) % 30;
            const i = Math.floor(c / 4);
            const k = c % 4;
            const L = (32 + 2 * e + 2 * i - h - k) % 7;
            const m = Math.floor((a + 11 * h + 22 * L) / 451);
            const month = Math.floor((h + L - 7 * m + 114) / 31) - 1;
            const day = ((h + L - 7 * m + 114) % 31) + 1;
            return new Date(year, month, day, 0, 0, 0);
        }

        function resolveTargetDate(item) {
            const now = new Date();
            const currentYear = now.getFullYear();

            if (item.type === 'easter_based') {
                let easterThisYear = calculateEasterSunday(currentYear);
                if (item.easterOffset) {
                    easterThisYear.setDate(easterThisYear.getDate() + item.easterOffset);
                }
                if (easterThisYear.getTime() > now.getTime()) {
                    return easterThisYear.getTime();
                } else {
                    let easterNextYear = calculateEasterSunday(currentYear + 1);
                    if (item.easterOffset) {
                        easterNextYear.setDate(easterNextYear.getDate() + item.easterOffset);
                    }
                    return easterNextYear.getTime();
                }
            }

            // Custom or Fixed Date items
            if (item.dateString) {
                const parts = item.dateString.split('-');
                const targetMonth = parseInt(parts[1], 10) - 1;
                const targetDay = parseInt(parts[2], 10);
                const hours = item.hasTime ? (item.hour || 0) : 0;
                const minutes = item.hasTime ? (item.minute || 0) : 0;

                let target = new Date(currentYear, targetMonth, targetDay, hours, minutes, 0);
                if (target.getTime() < now.getTime()) {
                    if (item.recurring !== false) {
                        target.setFullYear(currentYear + 1);
                    }
                }
                return target.getTime();
            }

            const hours = item.hasTime ? (item.hour || 0) : 0;
            const minutes = item.hasTime ? (item.minute || 0) : 0;

            let target = new Date(currentYear, item.month, item.day, hours, minutes, 0);
            if (target.getTime() < now.getTime()) {
                target.setFullYear(currentYear + 1);
            }
            return target.getTime();
        }

        function calculateTelemetry(targetTimestamp) {
            const now = new Date();
            const target = new Date(targetTimestamp);
            const totalDiff = target.getTime() - now.getTime();

            if (totalDiff <= 0) {
                return { expired: true, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0, progress: "100.0" };
            }

            let months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
            let tempDate = new Date(now);
            tempDate.setMonth(tempDate.getMonth() + months);

            if (tempDate > target) {
                months--;
                tempDate = new Date(now);
                tempDate.setMonth(tempDate.getMonth() + months);
            }

            const diff = target.getTime() - tempDate.getTime();

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            const oneYearMs = 365 * 24 * 60 * 60 * 1000;
            const elapsed = oneYearMs - totalDiff;
            let progress = Math.min(100, Math.max(0, (elapsed / oneYearMs) * 100));

            return { expired: false, months, days, hours, minutes, seconds, progress: progress.toFixed(1) };
        }

        function formatGermanDate(timestamp, hasTime = false) {
            const date = new Date(timestamp);
            const options = {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            };
            if (hasTime) {
                options.hour = '2-digit';
                options.minute = '2-digit';
            }
            const formatted = new Intl.DateTimeFormat('de-DE', options).format(date);
            return hasTime ? `${formatted} Uhr` : formatted;
        }

        function updateThemeBackground(hero) {
            if (!DOM.themeGlow) return;

            if (hero && hero.glowColor) {
                DOM.themeGlow.style.background = hero.glowColor;
            } else {
                DOM.themeGlow.style.background = 'radial-gradient(circle, rgba(245, 158, 11, 0.3) 0%, rgba(3, 7, 18, 0) 80%)';
            }

            const targetTheme = hero && hero.theme ? hero.theme : 'snow';
            if (currentTheme !== targetTheme) {
                currentTheme = targetTheme;
                reinitParticlesForTheme(targetTheme);
            }
        }

        function renderHeroStructure(hero) {
            const container = DOM.heroSection;
            const formattedDate = formatGermanDate(hero.targetTime, hero.hasTime);

            container.innerHTML = `
                <div class="relative overflow-hidden rounded-3xl bg-gradient-to-r ${hero.color || 'from-amber-600 via-rose-700 to-slate-900'} py-6 sm:py-8 px-6 sm:px-10 border border-amber-500/30 shadow-2xl transition-all flex flex-col justify-center">
                    <div class="relative z-10 max-w-5xl mx-auto text-center sm:text-left w-full space-y-4">
                        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                                <div class="inline-flex items-center space-x-2 px-3 py-0.5 rounded-full ${hero.badgeBg || 'bg-amber-500/20 text-amber-300 border-amber-500/30'} border text-xs font-semibold uppercase tracking-wider mb-2">
                                    <span>Nächstes Ereignis</span>
                                </div>
                                <h2 class="text-2xl sm:text-4xl font-black font-heading text-white tracking-tight">${hero.title}</h2>
                            </div>
                            <p class="text-slate-200 text-xs sm:text-sm font-medium">
                                <span>${formattedDate}</span>
                            </p>
                        </div>

                        <!-- 5-Säulen Anzeige -->
                        <div class="grid grid-cols-5 gap-2 sm:gap-3 py-1">
                            <div class="py-2.5 px-2 text-center">
                                <span id="hero-val-months" class="block text-2xl sm:text-3xl font-black font-heading text-amber-400">0</span>
                                <span class="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-slate-300">Monate</span>
                            </div>
                            <div class="py-2.5 px-2 text-center">
                                <span id="hero-val-days" class="block text-2xl sm:text-3xl font-black font-heading text-amber-300">0</span>
                                <span class="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-slate-300">Tage</span>
                            </div>
                            <div class="py-2.5 px-2 text-center">
                                <span id="hero-val-hours" class="block text-2xl sm:text-3xl font-black font-heading text-white">0</span>
                                <span class="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-slate-300">Std</span>
                            </div>
                            <div class="py-2.5 px-2 text-center">
                                <span id="hero-val-minutes" class="block text-2xl sm:text-3xl font-black font-heading text-white">0</span>
                                <span class="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-slate-300">Min</span>
                            </div>
                            <div class="py-2.5 px-2 text-center">
                                <span id="hero-val-seconds" class="block text-2xl sm:text-3xl font-black font-heading text-rose-400">0</span>
                                <span class="text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-slate-300">Sek</span>
                            </div>
                        </div>

                        <!-- Progress Bar -->
                        <div class="space-y-1">
                            <div class="flex justify-between text-xs text-slate-200 font-bold">
                                <span>Fortschritt</span>
                                <span id="hero-val-progtext" class="text-amber-300 font-extrabold">0%</span>
                            </div>
                            <div class="w-full bg-slate-950/80 rounded-full h-2.5 overflow-hidden p-0.5 border border-white/10 shadow-inner">
                                <div id="hero-val-progbar" class="bg-gradient-to-r from-amber-400 via-rose-400 to-purple-400 h-full rounded-full transition-all duration-500" style="width: 0%"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            heroNodeRefs = {
                months: document.getElementById('hero-val-months'),
                days: document.getElementById('hero-val-days'),
                hours: document.getElementById('hero-val-hours'),
                minutes: document.getElementById('hero-val-minutes'),
                seconds: document.getElementById('hero-val-seconds'),
                progtext: document.getElementById('hero-val-progtext'),
                progbar: document.getElementById('hero-val-progbar')
            };
        }

        function updateHeroValues(hero) {
            if (!heroNodeRefs || currentHeroId !== hero.id) {
                currentHeroId = hero.id;
                renderHeroStructure(hero);
            }
            updateThemeBackground(hero);

            const telemetry = calculateTelemetry(hero.targetTime);
            heroNodeRefs.months.textContent = telemetry.months;
            heroNodeRefs.days.textContent = telemetry.days;
            heroNodeRefs.hours.textContent = telemetry.hours;
            heroNodeRefs.minutes.textContent = telemetry.minutes;
            heroNodeRefs.seconds.textContent = telemetry.seconds;
            heroNodeRefs.progtext.textContent = `${telemetry.progress}%`;
            heroNodeRefs.progbar.style.width = `${telemetry.progress}%`;
        }

        function createEventCardNode(item) {
            const formattedDate = formatGermanDate(item.targetTime, item.hasTime);
            const isCustom = item.isCustom;

            const div = document.createElement('div');
            div.className = "glass-panel hover:border-slate-700/80 rounded-2xl p-5 flex flex-col gap-4 transition-all duration-300 hover:-translate-y-0.5 shadow-lg relative";

            div.innerHTML = `
                <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div class="lg:w-1/3">
                        <div class="flex items-center space-x-2 mb-1">
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-lg ${item.badgeBg || 'bg-slate-800 text-slate-300'} border">
                                ${item.category === 'holiday' ? 'Feiertag' : item.category === 'season' ? 'Jahreszeit' : 'Persönlich'}
                            </span>
                            <span class="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-900 text-slate-400 border border-slate-800">
                                ${item.recurring !== false ? 'Jährlich' : 'Einmalig'}
                            </span>
                        </div>

                        <h3 class="text-xl font-bold font-heading text-white tracking-tight">${item.title}</h3>

                        <p class="text-xs text-slate-400 font-medium mt-0.5">
                            <span>${formattedDate}</span>
                        </p>
                    </div>

                    <div class="lg:w-2/3 flex items-center justify-between gap-4">
                        <div class="grid grid-cols-5 gap-2 text-center py-2.5 px-3 flex-grow">
                            <div>
                                <span data-field="months" class="block text-lg sm:text-xl font-black font-heading text-amber-400">0</span>
                                <span class="text-[9px] font-bold uppercase tracking-wider text-slate-400">Monate</span>
                            </div>
                            <div>
                                <span data-field="days" class="block text-lg sm:text-xl font-black font-heading text-white">0</span>
                                <span class="text-[9px] font-bold uppercase tracking-wider text-slate-400">Tage</span>
                            </div>
                            <div>
                                <span data-field="hours" class="block text-lg sm:text-xl font-black font-heading text-white">0</span>
                                <span class="text-[9px] font-bold uppercase tracking-wider text-slate-400">Std</span>
                            </div>
                            <div>
                                <span data-field="minutes" class="block text-lg sm:text-xl font-black font-heading text-white">0</span>
                                <span class="text-[9px] font-bold uppercase tracking-wider text-slate-400">Min</span>
                            </div>
                            <div>
                                <span data-field="seconds" class="block text-lg sm:text-xl font-black font-heading text-rose-400">0</span>
                                <span class="text-[9px] font-bold uppercase tracking-wider text-slate-400">Sek</span>
                            </div>
                        </div>

                        ${isCustom ? `
                            <button onclick="deleteCustomEvent('${item.id}')" class="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors" title="Event löschen">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        ` : ''}
                    </div>
                </div>

                <div class="w-full pt-1 border-t border-slate-800/60 space-y-1">
                    <div class="flex justify-between text-[11px] font-semibold text-slate-400 px-0.5">
                        <span>Fortschritt</span>
                        <span data-field="progtext" class="text-amber-400 font-bold">0%</span>
                    </div>
                    <div class="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800/80 p-0.5">
                        <div data-field="progbar" class="bg-gradient-to-r from-amber-400 via-rose-500 to-purple-500 h-full rounded-full transition-all duration-500" style="width: 0%"></div>
                    </div>
                </div>
            `;

            return {
                element: div,
                fields: {
                    months: div.querySelector('[data-field="months"]'),
                    days: div.querySelector('[data-field="days"]'),
                    hours: div.querySelector('[data-field="hours"]'),
                    minutes: div.querySelector('[data-field="minutes"]'),
                    seconds: div.querySelector('[data-field="seconds"]'),
                    progtext: div.querySelector('[data-field="progtext"]'),
                    progbar: div.querySelector('[data-field="progbar"]')
                }
            };
        }

        function rebuildGridStructure(events) {
            const grid = DOM.eventsGrid;
            grid.innerHTML = '';
            eventNodeCache.clear();

            if (events.length === 0) {
                grid.innerHTML = `
                    <div class="col-span-full py-10 text-center glass-panel rounded-2xl p-6">
                        <h3 class="text-base font-bold text-white mb-1 font-heading">Keine Ereignisse gefunden</h3>
                        <p class="text-xs text-slate-400">Passe deine Suche oder Filter an.</p>
                    </div>
                `;
                return;
            }

            const fragment = document.createDocumentFragment();
            events.forEach(item => {
                const nodeData = createEventCardNode(item);
                eventNodeCache.set(item.id, nodeData);
                fragment.appendChild(nodeData.element);
            });

            grid.appendChild(fragment);
            updateGridValues(events);
        }

        function updateGridValues(events) {
            events.forEach(item => {
                const cached = eventNodeCache.get(item.id);
                if (!cached) return;

                const telemetry = calculateTelemetry(item.targetTime);
                cached.fields.months.textContent = telemetry.months;
                cached.fields.days.textContent = telemetry.days;
                cached.fields.hours.textContent = telemetry.hours;
                cached.fields.minutes.textContent = telemetry.minutes;
                cached.fields.seconds.textContent = telemetry.seconds;
                cached.fields.progtext.textContent = `${telemetry.progress}%`;
                cached.fields.progbar.style.width = `${telemetry.progress}%`;
            });
        }

        function getFilteredAndSortedEvents() {
            const combined = getAllEventsCombined();
            let events = combined.map(e => ({
                ...e,
                targetTime: resolveTargetDate(e)
            }));

            DOM.countAll.textContent = events.length;
            DOM.countHoliday.textContent = events.filter(e => e.category === 'holiday').length;
            DOM.countSeason.textContent = events.filter(e => e.category === 'season').length;
            DOM.countCustom.textContent = events.filter(e => e.category === 'custom' || e.isCustom).length;

            if (activeFilter !== 'all') {
                if (activeFilter === 'custom') {
                    events = events.filter(e => e.category === 'custom' || e.isCustom);
                } else {
                    events = events.filter(e => e.category === activeFilter);
                }
            }

            if (searchQuery.trim() !== '') {
                const query = searchQuery.toLowerCase();
                events = events.filter(e => e.title.toLowerCase().includes(query));
            }

            events.sort((a, b) => {
                if (sortBy === 'time') return a.targetTime - b.targetTime;
                if (sortBy === 'name') return a.title.localeCompare(b.title);
                if (sortBy === 'category') return (a.category || '').localeCompare(b.category || '');
                return 0;
            });

            return events;
        }

        function tick() {
            const allResolved = getAllEventsCombined().map(e => ({
                ...e,
                targetTime: resolveTargetDate(e)
            })).sort((a, b) => a.targetTime - b.targetTime);

            if (allResolved.length > 0) {
                updateHeroValues(allResolved[0]);
            }

            const currentFiltered = getFilteredAndSortedEvents();
            updateGridValues(currentFiltered);
        }

        function setFilter(filter) {
            activeFilter = filter;
            document.querySelectorAll('.filter-tab').forEach(btn => {
                btn.className = 'filter-tab px-5 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap text-slate-400 hover:text-white transition-all';
            });
            const activeBtn = document.getElementById(`btn-filter-${filter}`);
            if (activeBtn) {
                activeBtn.className = 'filter-tab px-5 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap bg-amber-500 text-slate-950 transition-all';
            }
            rebuildGridStructure(getFilteredAndSortedEvents());
        }

        function handleSearch() {
            searchQuery = DOM.searchInput.value;
            rebuildGridStructure(getFilteredAndSortedEvents());
        }

        function handleSortChange() {
            sortBy = DOM.sortSelect.value;
            rebuildGridStructure(getFilteredAndSortedEvents());
        }

        // Modal Handling
        function openAddModal() {
            document.getElementById('add-modal').classList.remove('hidden');
        }

        function closeAddModal() {
            document.getElementById('add-modal').classList.add('hidden');
            document.getElementById('event-form').reset();
        }

        function handleFormSubmit(e) {
            e.preventDefault();
            const title = document.getElementById('form-title').value;
            const dateStr = document.getElementById('form-date').value;
            const category = document.getElementById('form-category').value;
            const timeStr = document.getElementById('form-time').value;
            const color = document.getElementById('form-color').value;

            let hour = 0;
            let minute = 0;
            let hasTime = false;

            if (timeStr) {
                const parts = timeStr.split(':');
                hour = parseInt(parts[0], 10);
                minute = parseInt(parts[1], 10);
                hasTime = true;
            }

            const newEvent = {
                id: 'custom_' + Date.now(),
                title: title,
                dateString: dateStr,
                category: category,
                isCustom: true,
                theme: 'snow',
                glowColor: 'radial-gradient(circle, rgba(245, 158, 11, 0.4) 0%, rgba(139, 92, 246, 0.2) 50%, rgba(3, 7, 18, 0) 80%)',
                recurring: true,
                hasTime: hasTime,
                hour: hour,
                minute: minute,
                color: color,
                badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
            };

            customEvents.push(newEvent);
            saveCustomEvents();
            closeAddModal();
            rebuildGridStructure(getFilteredAndSortedEvents());
        }

        function deleteCustomEvent(id) {
            customEvents = customEvents.filter(e => e.id !== id);
            saveCustomEvents();
            rebuildGridStructure(getFilteredAndSortedEvents());
        }

        // Export / Import Account Data
        function exportData() {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(customEvents, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", "countdown_events_backup.json");
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        }

        function importData(event) {
            const fileReader = new FileReader();
            if (event.target.files[0]) {
                fileReader.readAsText(event.target.files[0], "UTF-8");
                fileReader.onload = (e) => {
                    try {
                        const parsed = JSON.parse(e.target.result);
                        if (Array.isArray(parsed)) {
                            customEvents = parsed;
                            saveCustomEvents();
                            rebuildGridStructure(getFilteredAndSortedEvents());
                            alert("Events erfolgreich importiert!");
                        }
                    } catch (error) {
                        alert("Fehler beim Lesen der JSON-Datei.");
                    }
                };
            }
        }

        // Canvas Particles Background
        let canvas, ctx;
        let particles = [];
        let isWindowActive = true;

        function initCanvasEngine() {
            canvas = document.getElementById('bg-canvas');
            ctx = canvas.getContext('2d');

            function resize() {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }
            window.addEventListener('resize', resize, { passive: true });
            resize();

            reinitParticlesForTheme(currentTheme);
            
            document.addEventListener('visibilitychange', () => {
                isWindowActive = !document.hidden;
                if (isWindowActive) requestAnimationFrame(animateCanvas);
            });

            requestAnimationFrame(animateCanvas);
        }

        function reinitParticlesForTheme(theme) {
            if (!canvas) return;
            particles = [];
            const count = theme === 'snow' ? 60 : theme === 'fireworks' ? 55 : 40;
            for (let i = 0; i < count; i++) {
                particles.push(createParticleForTheme(theme));
            }
        }

        function createParticleForTheme(theme) {
            const w = canvas.width || window.innerWidth;
            const h = canvas.height || window.innerHeight;
            return {
                x: Math.random() * w,
                y: Math.random() * h,
                radius: Math.random() * 2.5 + 1,
                vx: (Math.random() - 0.5) * 0.5,
                vy: Math.random() * 0.8 + 0.4,
                alpha: Math.random() * 0.7 + 0.3,
                swing: Math.random() * 0.02,
                color: '255, 255, 255'
            };
        }

        function animateCanvas() {
            if (!isWindowActive) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.x += p.vx;
                p.y += p.vy;

                if (p.y > canvas.height) {
                    p.y = -5;
                    p.x = Math.random() * canvas.width;
                }

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
                ctx.fill();
            }
            requestAnimationFrame(animateCanvas);
        }

        document.addComponent = () => {};

        document.addEventListener('DOMContentLoaded', () => {
            DOM.heroSection = document.getElementById('hero-section');
            DOM.eventsGrid = document.getElementById('events-grid');
            DOM.themeGlow = document.getElementById('theme-glow');
            DOM.countAll = document.getElementById('count-all');
            DOM.countHoliday = document.getElementById('count-holiday');
            DOM.countSeason = document.getElementById('count-season');
            DOM.countCustom = document.getElementById('count-custom');
            DOM.searchInput = document.getElementById('search-input');
            DOM.sortSelect = document.getElementById('sort-select');

            loadCustomEvents();
            rebuildGridStructure(getFilteredAndSortedEvents());
            tick();

            setInterval(tick, 1000);
            initCanvasEngine();
        });
    
