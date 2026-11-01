    // Streamer Daten nach Kategorien getrennt
    const streamersData = {
      rl: [
        {
          id: "squishy",
          name: "SquishyMuffinz",
          twitch: "squishymuffinz",
          youtube: "https://www.youtube.com/@SquishyMuffinz",
          rlRank: "Supersonic Legend",
          status: "unknown" // 'live', 'offline', 'unknown'
        },
        {
          id: "appjack",
          name: "ApparentlyJack",
          twitch: "apparentlyjack",
          youtube: "https://www.youtube.com/@ApparentlyJack",
          rlRank: "Supersonic Legend",
          status: "unknown"
        },
        {
          id: "vatira",
          name: "Vatira",
          twitch: "vatira",
          youtube: null,
          rlRank: "Supersonic Legend",
          status: "unknown"
        },
        {
          id: "zen",
          name: "Zen",
          twitch: "zenrll",
          youtube: "https://www.youtube.com/@ZenRL",
          rlRank: "Supersonic Legend",
          status: "unknown"
        },
        {
          id: "feer",
          name: "Feer",
          twitch: "feer",
          youtube: "https://www.youtube.com/@FeerRL",
          rlRank: "Grand Champion III",
          status: "unknown"
        },
        {
          id: "johnnyboi",
          name: "JohnnyBoi_i",
          twitch: "johnnyboi_i",
          youtube: "https://www.youtube.com/@JohnnyBoi_i",
          rlRank: "Grand Champion II",
          status: "unknown"
        }
      ],
      mc: [
        {
          id: "basti",
          name: "BastiGHG",
          twitch: "bastighg",
          youtube: "https://www.youtube.com/@BastiGHG",
          mcName: "BastiGHG",
          status: "unknown"
        },
        {
          id: "papaplatte",
          name: "Papaplatte",
          twitch: "papaplatte",
          youtube: "https://www.youtube.com/@Papaplatte",
          mcName: "Papaplatte",
          status: "unknown"
        },
        {
          id: "trymacs",
          name: "Trymacs",
          twitch: "trymacs",
          youtube: "https://www.youtube.com/@Trymacs",
          mcName: "Trymacs",
          status: "unknown"
        },
        {
          id: "rewinside",
          name: "Rewinside",
          twitch: "rewinside",
          youtube: "https://www.youtube.com/@rewinside",
          mcName: "rewinside",
          status: "unknown"
        },
        {
          id: "letstutes",
          name: "LetsTutes",
          twitch: "letstutes",
          youtube: "https://www.youtube.com/@LetsTutes",
          mcName: "LetsTutes",
          status: "unknown"
        },
        {
          id: "varion",
          name: "Varion",
          twitch: "varion",
          youtube: "https://www.youtube.com/@Varion",
          mcName: "Varion",
          status: "unknown"
        }
      ]
    };

    // Aktueller Modus (Standard: Rocket League, umschaltbar zu Minecraft)
    let currentMode = "rl";

    // Modus festlegen (Nur RL oder Nur MC)
    function setMode(mode) {
      currentMode = mode;
      
      const btnRl = document.getElementById('btn-rl');
      const btnMc = document.getElementById('btn-mc');

      const activeClass = "bg-zinc-800 text-white shadow-sm";
      const inactiveClass = "text-zinc-400 hover:text-zinc-200";

      if (mode === 'rl') {
        btnRl.className = `px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 ${activeClass}`;
        btnMc.className = `px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 ${inactiveClass}`;
      } else {
        btnMc.className = `px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 ${activeClass}`;
        btnRl.className = `px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 ${inactiveClass}`;
      }

      renderHeaderTitle();
      renderList();
    }

    // Header Titel rendern (Rocket League Name vs Minecraft Text)
    function renderHeaderTitle() {
      const container = document.getElementById('category-title');
      if (currentMode === 'rl') {
        container.innerHTML = `
          <span class="text-lg font-black tracking-wider uppercase text-zinc-100">Rocket League</span>
        `;
      } else {
        container.innerHTML = `
          <span class="text-lg font-black tracking-wider uppercase text-zinc-100">Minecraft</span>
        `;
      }
    }

    // Avatar URL für Minecraft / Rocket League generieren
    function getAvatarUrl(streamer) {
      if (currentMode === 'mc' && streamer.mcName) {
        return `https://mc-heads.net/avatar/${encodeURIComponent(streamer.mcName)}/64`;
      }
      return `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(streamer.twitch)}`;
    }

    function handleAvatarError(img, streamerId) {
      const streamer = streamersData[currentMode].find(s => s.id === streamerId);
      if (!streamer) return;

      if (currentMode === 'mc' && streamer.mcName && !img.dataset.triedMinotar) {
        img.dataset.triedMinotar = "true";
        img.src = `https://minotar.net/helm/${encodeURIComponent(streamer.mcName)}/64`;
        return;
      }
      if (!img.dataset.fallbackDone) {
        img.dataset.fallbackDone = "true";
        img.src = `https://mc-heads.net/avatar/MHF_Steve/64`;
      }
    }

    // Automatische Twitch GQL Status-Abfrage (Läuft im Hintergrund ohne manuellen Button)
    async function fetchLiveStatus() {
      const allStreamers = [...streamersData.rl, ...streamersData.mc];
      const usernames = allStreamers.map(s => s.twitch);

      const CLIENT_ID = 'kimne78kx3ncx6brl4h56w85hj18p7';
      const GQL_ENDPOINT = 'https://gql.twitch.tv/gql';

      const query = usernames.map((name, idx) => `
        u${idx}: user(login: "${name.toLowerCase()}") {
          stream {
            id
          }
        }
      `).join('\n');

      try {
        const response = await fetch(GQL_ENDPOINT, {
          method: 'POST',
          headers: {
            'Client-ID': CLIENT_ID,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query: `query { ${query} }` })
        });

        if (!response.ok) throw new Error("Netzwerkfehler");

        const data = await response.json();
        
        if (data && data.data) {
          usernames.forEach((name, idx) => {
            const userData = data.data[`u${idx}`];
            const isLive = !!(userData && userData.stream && userData.stream.id);
            const status = isLive ? 'live' : 'offline';

            // Status in beiden Listen aktualisieren
            const rlItem = streamersData.rl.find(s => s.twitch.toLowerCase() === name.toLowerCase());
            if (rlItem) rlItem.status = status;

            const mcItem = streamersData.mc.find(s => s.twitch.toLowerCase() === name.toLowerCase());
            if (mcItem) mcItem.status = status;
          });
        }
      } catch (err) {
        console.warn("Status konnte nicht ermittelt werden (Netzwerk/CORS):", err);
        // Falls Fehler auftritt -> Status bleibt/wird 'unknown' (Ausrufezeichen wird angezeigt)
        allStreamers.forEach(s => {
          if (s.status !== 'live') {
            s.status = 'unknown';
          }
        });
      }

      // Sortierung: Live Streamer stehen immer ganz oben
      sortStreamers();
      renderList();
    }

    function sortStreamers() {
      ['rl', 'mc'].forEach(key => {
        streamersData[key].sort((a, b) => {
          if (a.status === 'live' && b.status !== 'live') return -1;
          if (a.status !== 'live' && b.status === 'live') return 1;
          return 0;
        });
      });
    }

    // Render-Funktion für die Listenzeilen über die volle Breite
    function renderList() {
      const container = document.getElementById('streamer-list');
      const items = streamersData[currentMode];

      container.innerHTML = items.map(streamer => {
        const avatarUrl = getAvatarUrl(streamer);

        // Status Indikator Badge oben links am Avatar
        let statusBadge = '';
        if (streamer.status === 'live') {
          // Pulsierender Roter Punkt bei Live
          statusBadge = `
            <div class="absolute -top-1 -left-1 w-3.5 h-3.5 flex items-center justify-center z-10" title="LIVE">
              <span class="live-dot-pulse absolute w-full h-full rounded-full bg-red-500"></span>
              <span class="relative w-2.5 h-2.5 rounded-full bg-red-500 border border-zinc-950"></span>
            </div>
          `;
        } else if (streamer.status === 'unknown') {
          // Ausrufezeichen wenn nichts herausgefunden werden konnte
          statusBadge = `
            <div class="absolute -top-1.5 -left-1.5 w-4 h-4 bg-amber-500 text-zinc-950 font-bold text-[10px] rounded-full flex items-center justify-center border border-zinc-950 z-10" title="Status unbekannt">
              !
            </div>
          `;
        }

        return `
          <div class="w-full flex items-center justify-between p-3.5 sm:p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/70 hover:border-zinc-700/80 transition-all duration-200">
            
            <!-- Linke Seite: Avatar & Streamer Details -->
            <div class="flex items-center space-x-4 min-w-0">
              
              <!-- Avatar Container mit Status Badge -->
              <div class="relative flex-shrink-0">
                <img 
                  src="${avatarUrl}" 
                  alt="${streamer.name}" 
                  onerror="handleAvatarError(this, '${streamer.id}')"
                  class="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-zinc-800 object-cover border border-zinc-800 shadow-sm"
                />
                ${statusBadge}
              </div>

              <!-- Streamer Name & Ingame Rang -->
              <div class="min-w-0 flex-1">
                <h2 class="font-semibold text-sm sm:text-base text-zinc-100 truncate tracking-tight">
                  ${streamer.name}
                </h2>
                
                <!-- Nur bei Rocket League: Rang direkt unter dem Namen -->
                ${currentMode === 'rl' ? `
                  <div class="text-xs text-zinc-400 font-medium mt-0.5">
                    ${streamer.rlRank}
                  </div>
                ` : ''}
              </div>

            </div>

            <!-- Rechte Seite: Twitch & YouTube Plattform Buttons -->
            <div class="flex items-center space-x-2 flex-shrink-0 ml-4">
              
              <!-- Twitch Button -->
              <a 
                href="https://twitch.tv/${streamer.twitch}" 
                target="_blank" 
                rel="noopener noreferrer"
                class="p-2 sm:px-3 sm:py-1.5 rounded-lg bg-purple-950/40 border border-purple-800/40 text-purple-300 hover:bg-purple-900/70 hover:text-white transition-colors text-xs font-medium flex items-center space-x-1.5"
                title="Twitch Kanal"
              >
                <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M11.571 4.714h1.715v5.143H11.571zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
                </svg>
                <span class="hidden sm:inline">Twitch</span>
              </a>

              <!-- YouTube Button -->
              ${streamer.youtube ? `
                <a 
                  href="${streamer.youtube}" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  class="p-2 sm:px-3 sm:py-1.5 rounded-lg bg-red-950/40 border border-red-800/40 text-red-300 hover:bg-red-900/70 hover:text-white transition-colors text-xs font-medium flex items-center space-x-1.5"
                  title="YouTube Kanal"
                >
                  <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                  <span class="hidden sm:inline">YouTube</span>
                </a>
              ` : ''}

            </div>

          </div>
        `;
      }).join('');
    }

    // Beim Laden der Seite ausführen & Timer für automatische Minutentakt-Abfrage starten
    window.onload = function() {
      setMode('rl');
      fetchLiveStatus();

      // Automatisch jede Minute (60.000 Millisekunden) im Hintergrund abfragen
      setInterval(fetchLiveStatus, 60000);
    };
  
