        let zahl1 = 0; let zahl2 = 0; let richtigeAntwort = 0; let istGesperrt = false;
        let score = 0; let aktuelleAufgaben = 0; let benoetigteAufgaben = 5; 

        const richtigSound = new Audio("https://cdn.freesound.org/previews/391/391539_5235550-lq.mp3"); 
        const bossSound = new Audio("https://myinstants.com/media/sounds/wither-spawn.mp3");
        const kaufSound = new Audio("https://myinstants.com/media/sounds/apple-pay-sound.mp3");
        
        // Definition der 6 Songs (1 Standard + 5 Neue)
        const songs = {
            1: { name: "Chill musik", audio: new Audio("https://cdn.pixabay.com/audio/2024/06/04/audio_49ec61a598.mp3"), kosten: 5 },
            2: { name: "Chill musik2", audio: new Audio("https://data.freetouse.com/music/tracks/a5b2e60b-03b4-463e-98cb-dcdb04e5e1aa/file/mp3"), kosten: 10 },
            3: { name: "Zelda Theme", audio: new Audio("https://nu.vgmtreasurechest.com/soundtracks/the-legend-of-zelda-breath-of-the-wild/burcmdgs/6-26.%20Main%20Theme%20%28Live%20ver.%29.mp3"), kosten: 15 },
            4: { name: "Plants-vs.-Zombies", audio: new Audio("https://vgmtreasurechest.com/soundtracks/plants-vs.-zombies/vkmdgugx/02.%20Crazy%20Dave%20%28Intro%20Theme%29.mp3"), kosten: 20 },
            5: { name: "Minecraft", audio: new Audio("https://lambda.vgmtreasurechest.com/soundtracks/minecraft/ikyqfeel/1-08.%20Minecraft.mp3"), kosten: 35 },
            6: { name: "Undertale", audio: new Audio("https://jetta.vgmtreasurechest.com/soundtracks/undertale-last-breath-byzerjox-soundtrack-2020/kgbmgwql/An%20Enigmatic%20Encounter.mp3"), kosten: 50 }
        };

        // Konfiguration für Loops & Lautstärke
        for (let id in songs) {
            songs[id].audio.loop = true;
            songs[id].audio.volume = 1;
        }

        // Definition der 12 Hintergründe (2 Standard/Bisherige + 10 Neue)
        const farben = {
            "lila": { name: "Dunkles Lila", code: "#2d142c", kosten: 1 },
            "blau": { name: "Tiefsee Blau", code: "#0f2027", kosten: 2 },
            "smaragd": { name: "Smaragd Grün", code: "#0a3d30", kosten: 4 },
            "rot": { name: "Mitternacht Rot", code: "#3a0606", kosten: 8 },
            "orange": { name: "Cyberpunk Orange", code: "#4c230a", kosten: 15 },
            "gold": { name: "Goldener Glanz", code: "#3d310a", kosten: 25 },
            "violett": { name: "Deep Violet", code: "#200b3b", kosten: 30 },
            "royal": { name: "Royal Blau", code: "#0a1c3d", kosten: 35 },
            "grau": { name: "Carbon Grau", code: "#22252a", kosten: 40 },
            "braun": { name: "Schoko Braun", code: "#2c1c16", kosten: 45 },
            "türkis": { name: "Dunkel Türkis", code: "#08363b", kosten: 50 },
            "magenta": { name: "Neon Magenta", code: "#3b0827", kosten: 55 }
        };

        let besitz = {
            hintergruende: {},
            musik: {}
        };
        // Initialisiere leere Listen falls keine im LocalStorage
        for (let key in farben) besitz.hintergruende[key] = false;
        for (let id in songs) besitz.musik[id] = false;

        let aktiverHintergrund = "standard";
        let aktiverSongId = null;

        // Speicher laden
        if (localStorage.getItem("matheQuiz_mega_score") !== null) {
            score = parseInt(localStorage.getItem("matheQuiz_mega_score"));
            besitz = JSON.parse(localStorage.getItem("matheQuiz_mega_besitz"));
            aktiverHintergrund = localStorage.getItem("matheQuiz_mega_aktiverHintergrund");
            aktiverSongId = localStorage.getItem("matheQuiz_mega_aktiverSongId");
            
            if (aktiverHintergrund !== "standard" && farben[aktiverHintergrund]) {
                document.body.style.backgroundColor = farben[aktiverHintergrund].code;
            }
            document.getElementById("scoreWert").innerText = score;

            // Song reaktivieren falls einer an war
            if (aktiverSongId && songs[aktiverSongId] && besitz.musik[aktiverSongId]) {
                songs[aktiverSongId].audio.play().catch(e => console.log("Autoplay blockiert"));
            }
        }

        // Render Shop Items dynamically
        renderShop();
        neueAufgabe();

        function renderShop() {
            let hgListe = document.getElementById("hintergrundShopListe");
            hgListe.innerHTML = "";
            for (let key in farben) {
                hgListe.innerHTML += `
                    <div class="shop-item">
                        <div style="text-align: left;">
                            <strong>${farben[key].name}</strong><br><span style="font-size: 11px; color: #aaa;">Kostet: ${farben[key].kosten} Klicks</span>
                        </div>
                        <button class="item-kaufen-btn" id="bg_${key}" onclick="kaufeHintergrund('${key}')">Kaufen</button>
                    </div>`;
            }

            let mListe = document.getElementById("musikShopListe");
            mListe.innerHTML = "";
            for (let id in songs) {
                mListe.innerHTML += `
                    <div class="shop-item">
                        <div style="text-align: left;">
                            <strong>${songs[id].name}</strong><br><span style="font-size: 11px; color: #aaa;">Kostet: ${songs[id].kosten} Klicks</span>
                        </div>
                        <button class="item-kaufen-btn" id="mus_${id}" onclick="kaufeMusik('${id}')">Kaufen</button>
                    </div>`;
            }
        }

        function neueAufgabe() {
            istGesperrt = false;
            zahl1 = Math.floor(Math.random() * 12) + 1;
            zahl2 = Math.floor(Math.random() * 12) + 1;
            richtigeAntwort = zahl1 * zahl2;
            document.getElementById("aufgabeText").innerText = zahl1 + "  ×  " + zahl2;
            let inputFeld = document.getElementById("antwortInput");
            inputFeld.value = ""; inputFeld.disabled = false; document.getElementById("feedback").innerText = ""; inputFeld.focus();
        }

        function pruefeAutomatisch() {
            if (istGesperrt) return;
            let inputFeld = document.getElementById("antwortInput");
            let userAntwort = parseInt(inputFeld.value);
            let feedbackElement = document.getElementById("feedback");

            // Geheimer Cheat-Code Check
            if (userAntwort === 524262) {
                oeffneCheat();
                inputFeld.value = "";
                return;
            }

            if (userAntwort === richtigeAntwort) {
                istGesperrt = true; inputFeld.disabled = true;
                feedbackElement.innerText = "✓ Richtig!"; feedbackElement.className = "richtig";
                richtigSound.currentTime = 0; richtigSound.play();
                aktuelleAufgaben++;

                if (aktuelleAufgaben >= benoetigteAufgaben) {
                    aktuelleAufgaben = 0; benoetigteAufgaben = benoetigteAufgaben * 1; 
                    bossSound.currentTime = 0; bossSound.play();
                    animiereMuenze();
                } else {
                    anzeigeAktualisieren();
                }
                setTimeout(neueAufgabe, 1000);
            }
        }

        function animiereMuenze() {
            let prozent = (aktuelleAufgaben / benoetigteAufgaben) * 100;
            document.getElementById("bossBar").style.width = prozent + "%";
            document.getElementById("bossBarText").innerText = aktuelleAufgaben + " / " + benoetigteAufgaben + " Aufgaben";

            let wrapper = document.createElement("div"); wrapper.classList.add("fliegende-muenze-wrapper");
            let fliegendeMuenze = document.createElement("div"); fliegendeMuenze.classList.add("muenz-modell");
            wrapper.appendChild(fliegendeMuenze); document.body.appendChild(wrapper);

            setTimeout(() => {
                wrapper.remove(); score++; document.getElementById("scoreWert").innerText = score;
                let scoreBox = document.getElementById("scoreAnzeige"); scoreBox.classList.add("wackeln");
                setTimeout(() => scoreBox.classList.remove("wackeln"), 300);
                shopButtonsAktualisieren();
                anzeigeAktualisieren();
            }, 1000);
        }

        function oeffneShop() {
            document.getElementById("shopOverlay").style.display = "flex";
            shopButtonsAktualisieren();
        }
        function schliesseShop() {
            document.getElementById("shopOverlay").style.display = "none";
            document.getElementById("antwortInput").focus();
        }

        function oeffneCheat() {
            document.getElementById("cheatOverlay").style.display = "flex";
        }
        function schliesseCheat() {
            document.getElementById("cheatOverlay").style.display = "none";
            document.getElementById("antwortInput").focus();
        }

        function cheatAddCoins() {
            score += 1000;
            kaufSound.play();
            anzeigeAktualisieren();
            shopButtonsAktualisieren();
        }

        function cheatResetScore() {
            score = 0;
            aktuelleAufgaben = 0;
            benoetigteAufgaben = 5;
            
            // Stoppe jegliche Musik
            stoppeAlleMusik();
            aktiverSongId = null;
            
            // Setze Hintergrund zurück
            aktiverHintergrund = "standard";
            document.body.style.backgroundColor = "#121212";
            
            // Setze Besitz zurück
            for (let key in farben) besitz.hintergruende[key] = false;
            for (let id in songs) besitz.musik[id] = false;
            
            anzeigeAktualisieren();
            shopButtonsAktualisieren();
            schliesseCheat();
        }

        function stoppeAlleMusik() {
            for (let id in songs) {
                songs[id].audio.pause();
                songs[id].audio.currentTime = 0;
            }
        }

        function kaufeHintergrund(name) {
            let data = farben[name];
            if (!besitz.hintergruende[name]) {
                if (score >= data.kosten) {
                    score -= data.kosten;
                    besitz.hintergruende[name] = true;
                    aktiverHintergrund = name;
                    document.body.style.backgroundColor = data.code;
                    kaufSound.play();
                }
            } else {
                if (aktiverHintergrund === name) {
                    aktiverHintergrund = "standard";
                    document.body.style.backgroundColor = "#121212";
                } else {
                    aktiverHintergrund = name;
                    document.body.style.backgroundColor = data.code;
                }
            }
            anzeigeAktualisieren();
            shopButtonsAktualisieren();
        }

        function kaufeMusik(id) {
            let data = songs[id];
            if (!besitz.musik[id]) {
                if (score >= data.kosten) {
                    score -= data.kosten;
                    besitz.musik[id] = true;
                    
                    stoppeAlleMusik();
                    aktiverSongId = id;
                    songs[id].audio.play();
                    kaufSound.play();
                }
            } else {
                if (aktiverSongId === id) {
                    stoppeAlleMusik();
                    aktiverSongId = null;
                } else {
                    stoppeAlleMusik();
                    aktiverSongId = id;
                    songs[id].audio.play();
                }
            }
            anzeigeAktualisieren();
            shopButtonsAktualisieren();
        }

        function shopButtonsAktualisieren() {
            for (let key in farben) {
                let btn = document.getElementById("bg_" + key);
                if (!btn) continue;
                if (!besitz.hintergruende[key]) {
                    btn.disabled = (score < farben[key].kosten);
                    btn.innerText = "Kaufen";
                    btn.className = "item-kaufen-btn";
                } else {
                    btn.disabled = false;
                    btn.innerText = (aktiverHintergrund === key) ? "Aktiviert" : "Aktivieren";
                    btn.className = "item-kaufen-btn aktiviert";
                }
            }

            for (let id in songs) {
                let btn = document.getElementById("mus_" + id);
                if (!btn) continue;
                if (!besitz.musik[id]) {
                    btn.disabled = (score < songs[id].kosten);
                    btn.innerText = "Kaufen";
                    btn.className = "item-kaufen-btn";
                } else {
                    btn.disabled = false;
                    btn.innerText = (aktiverSongId === id) ? "Musik: AN" : "Aktivieren";
                    btn.className = "item-kaufen-btn aktiviert";
                }
            }
        }

        function ueberspringen() { neueAufgabe(); }
        
        function anzeigeAktualisieren() {
            document.getElementById("scoreWert").innerText = score;
            let prozent = (aktuelleAufgaben / benoetigteAufgaben) * 100;
            document.getElementById("bossBar").style.width = prozent + "%";
            document.getElementById("bossBarText").innerText = aktuelleAufgaben + " / " + benoetigteAufgaben + " Aufgaben";

            localStorage.setItem("matheQuiz_mega_score", score);
            localStorage.setItem("matheQuiz_mega_besitz", JSON.stringify(besitz));
            localStorage.setItem("matheQuiz_mega_aktiverHintergrund", aktiverHintergrund);
            localStorage.setItem("matheQuiz_mega_aktiverSongId", aktiverSongId || "");
        }
    
