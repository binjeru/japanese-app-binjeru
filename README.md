# Binjeru – Japanisch mit Geschichten

Eine Lern-App, in der **Geschichten im Mittelpunkt** stehen: hören, mitlesen, unbekannte Wörter antippen – und nur die Wörter, die du wirklich lernen willst, landen in einer ruhigen Lernkartei.
Reines HTML, CSS und JavaScript, ohne Installation und ohne Abhängigkeiten.

## Starten

`index.html` im Browser öffnen. Fertig. (Die Tests laufen über `tests.html`.)

Online unter https://binjeru.github.io/japanese-app-binjeru/. Ein Service Worker (`sw.js`) holt dort bei jedem Laden die aktuellen Dateien – nach einem Update genügt also einfaches Neuladen – und hält die zuletzt geladene Version für den Offline-Betrieb bereit.

Für die Sprachausgabe braucht der Browser eine japanische Stimme – in Edge und Chrome meist vorhanden, unter Windows sonst über *Einstellungen → Zeit und Sprache → Sprache → Japanisch* nachinstallieren.

## Bereiche

- **Heute** – aktuelle Geschichte weiterhören, fällige Karten, wie viele neue Karten heute sinnvoll sind
- **Geschichten** – Bibliothek: jede Geschichte als kleiner Wandteppich mit einem Holzschnitt, der sich von unten nach oben „webt“, je mehr ihrer Wörter sitzen – als bekannt markiert oder in der Lernkartei ab Fach 4 (bei 100 % mit 完-Stempel); darunter, wie viele offene Wörter schon in der Lernkartei oder auf der Merkliste liegen; Player mit Szenen, Hör- und Lesemodus, Tempo 0,75×/1×/1,25×, Satz wiederholen, Furigana/Romaji/Übersetzung zuschaltbar; Schalter 漢字 zeigt in Kana geschriebene Wörter mit ihrer Kanji-Schreibweise (auch gebeugte Formen; nur Kanji aus Heisigs 2200, Originaltexte bleiben unverändert). Wort antippen → Lesung, Bedeutung, Grundform, Beispielsatz, Aussprache, „Zur Merkliste“
- **Wortschatz-Check** – nach einer Geschichte: Wort zeigen, überlegen, aufdecken; „Gewusst“ = bekannt, „Nicht gewusst“ = Merkliste
- **Merkliste** – gesammelte Wörter mit Beispielsatz und Herkunft; nach Häufigkeitsrang sortiert; höchstens 12 Karten pro Tag in Fach 1 (Rückfälle zählen mit)
- **Lernkartei** – 5 Fächer wie eine echte Lernkartei: *Kennenlernen*, *Aufbau*, *Festigen*, *Vertiefen*, *Langzeit*. In jedem Fach mit Furigana und automatischer Aussprache; der Beispielsatz erscheint erst nach dem Aufdecken, damit er nicht als Gedankenstütze dient. Jeden Tag zuerst die **Tagesabfrage** – erst danach sind Geschichten und neue Wörter freigeschaltet. Von jeder Karte zurück zur Stelle in der Geschichte
- **Shadowing** – Sätze hören und in der Pause laut nachsprechen: Quelle wählen (Fach 1–5, alle Lernkarten, Merkliste oder eine Geschichte), einzelne Sätze an- oder abwählen, Wiederholungen pro Satz (1–10), Pause (2–8 s, mindestens Satzlänge + 0,5 s) und Tempo einstellen. Die Sätze laufen in Schleife, bis man stoppt – auch bei ausgeschaltetem Bildschirm (Pausen sind Stille im selben Audio-Element statt Timer; Steuerung über den Sperrbildschirm). Text, Furigana und Übersetzung zuschaltbar; Sätze ohne Aufnahme (Browser-Stimme) nur bei eingeschaltetem Bildschirm. Zähler, wie oft jeder Satz gehört wurde (heute / insgesamt)
- **Kanji** – eigenständige Heisig-Kartei („Die Kanji lernen und behalten 1“, 2200 Rahmen): Rahmen strikt in Heisigs Reihenfolge freischalten, Schlüsselwort und Merkgeschichte als Vorschlag aus dem eigenen Anki-Deck übernehmen oder selbst schreiben (die Vorschläge liegen nur im privaten Daten-Repo als `kanji-vorschlaege.json`, nicht in der App), Strichfolge als Animation (Strich für Strich, der aktuelle rot); Abfrage vom Schlüsselwort zum Kanji – mit dem Finger auf die Zeichenfläche zeichnen (die App vergleicht Strichzahl, Form, Lage, Richtung und Reihenfolge grob mit KanjiVG und schlägt eine Bewertung vor) oder auf Papier schreiben und aufdecken. Neue Rahmen pro Tag einstellbar, bereits Gelerntes übernehmbar. In den Wortdetails der Geschichten steht nur zur Info, welche Rahmen die Kanji eines Wortes haben
- **Profil** – Kacheln mit Statistik (die meisten führen per Klick in ihre Rubrik), bekannte/aktive/gemerkte Wörter, Hörstatistik, Themen, Sicherung (Export/Import), Abgleich über GitHub, Kana-Übung
- **Top 2000** (über das Profil) – die 2000 häufigsten lernbaren Wörter des Japanischen mit Lesung und Bedeutung, eingefärbt nach Lernstand (gefestigt, Lernkartei, Merkliste, in Geschichten noch offen, noch in keiner Geschichte); als Raster in Blöcken zu 250 mit Filter oder als **Wandteppich**: ein Holzschnitt unter 2000 Fäden in Rangfolge, das Motiv ist kaum zu erahnen – gefestigte Wörter zeigen ihren Faden in voller Farbe, Wörter in der Lernkartei als Ahnung (Motiv wählbar). Wörter, die in keiner Geschichte vorkommen, lassen sich direkt als bekannt markieren

**Abgleich zwischen Handy und Computer:** Der Lernstand kann automatisch über ein *privates* GitHub-Repo
(hier `binjeru/binjeru-daten`, Datei `lernstand.json`) abgeglichen werden. Dafür auf
[github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new) ein
Fine-grained Token erstellen: *Only select repositories* → `binjeru-daten`, *Permissions* → *Contents: Read and write*.
Token im Profil unter „Abgleich über GitHub“ eintragen – auf jedem Gerät einmal. Das Token bleibt nur im Browser
des Geräts; öffentliche Repos lehnt die App ab, weil der Lernstand eigene Heisig-Schlüsselwörter und Geschichten enthält.
Abgeglichen wird beim Öffnen der App, beim Zurückwechseln und einige Sekunden nach jeder Änderung. Wurde auf beiden
Geräten seit dem letzten Abgleich gelernt, fragt die App im Profil, welcher Stand gelten soll.

Tastatur: Player `Leertaste` Play/Pause, `←`/`→` Satz, `R` Satz wiederholen · Check/Lernkartei `Leertaste` aufdecken, `1` Noch nicht, `2` Gewusst · `Esc` schließt die Wortdetails.

## Aufbau

```
data/        Inhalte: Wörterbuch (dictionary.js), Geschichten (stories.js), Kana (kana.js)
js/util.js       Hilfsfunktionen (Furigana, Romaji, …), meldet den Service Worker an
sw.js            Service Worker: immer zuerst frisch vom Server, Reserve für offline
js/content.js    bereitet Geschichten auf: Satz-IDs, Wortvorkommen, Häufigkeiten
js/scheduler.js  Wiederholungsplanung – reine Funktionen, getestet in js/scheduler.test.js
js/store.js      Datenschicht (localStorage): Merkliste, Karten, Wiederholungshistorie, Fortschritt
js/sync.js       Abgleich des Lernstands über ein privates GitHub-Repo (Contents-API)
js/own-stories.js eigene Geschichten aus dem Daten-Repo: Kopie im Browser, Abgleich, Übernehmen, Löschen
js/speech.js     Sprachausgabe (Platzhalter bis echte Aufnahmen vorliegen)
js/strokes.js    lädt und animiert Strichfolgen (KanjiVG)
js/kanji-draw.js Zeichenfläche der Kanji-Abfrage und grober Abgleich mit den KanjiVG-Strichen
js/heisig.js     Heisig-Kartei: Reihenfolge, Freischalten, Wiederholung (ohne UI)
js/kanji-view.js Oberfläche der Kanji-Rubrik
js/top-words.js  Top 2000: Liste laden, Lernstand zuordnen, Raster und Wandteppich
js/shadow.js     Shadowing: Satzauswahl, Wiedergabe-Schleife mit Nachsprech-Pausen, Zähler
js/player.js     Geschichtenplayer + Wortdetails
js/app.js        Navigation und übrige Ansichten
```

**Wiederholungsplanung (Lernkartei mit 5 Fächern):**
- Neue Karten liegen in Fach 1 und dürfen am selben Tag beliebig oft geübt werden – das zählt nicht.
- Ab dem nächsten Tag wird bei Fälligkeit abgefragt („do or die“): gewusst → ein Fach weiter, nicht gewusst → zurück in Fach 1.
- Abstände nach dem Eintritt ins Fach: Fach 1 täglich, Fach 2 nach 2 Tagen, Fach 3 nach 5, Fach 4 nach 14, Fach 5 nach 35 Tagen; in Fach 5 gewusst → bleibt dort, wieder in 90 Tagen (Abstufung ≈ ×2,5 wie bei SuperMemo/Anki).
- Reihenfolge der Tagesabfrage: Fach 1 zuerst, dann die übrigen; höchstens 50 Karten pro Tag (der Rest kommt am nächsten Tag).
- Freie Plätze für neue Karten: 12 minus heute aktivierte minus heutige Rückfälle aus Fach 2–5.
- Die Kanji-Kartei funktioniert genauso (eigenes Tageslimit, sperrt die Geschichten nicht).
- Jede Abfrage wird protokolliert (Grundlage für einen späteren Algorithmus wie FSRS).

## Quellen und Lizenzen

- **Häufigkeitsplätze** (`data/frequency.js`) und **Top 2000** (`data/top2000.js`): eine durchgehende Rangliste der lernbaren Wörter aus dem Leeds Internet Corpus (Serge Sharoff, University of Leeds), Liste von [hingston/japanese](https://github.com/hingston/japanese), CC BY 2.5 – Partikel, Hilfsverben und Wortbruchstücke mithilfe von JMdict herausgerechnet, sodass Merkliste, Wortdetails und Top 2000 dieselbe Nummer zeigen. Beide Dateien erzeugt `tools/build-top2000.ps1`.
- **Top 2000** (`data/top2000.js`): Reihenfolge aus derselben Leeds-Liste (CC BY 2.5), Lesungen und Bedeutungen aus JMdict (CC BY-SA 4.0; die Datei steht deshalb unter CC BY-SA 4.0), erzeugt mit `tools/build-top2000.ps1`. Partikel, Hilfsverben und Wortbruchstücke sind herausgefiltert; bei sehr häufigen mehrdeutigen Wörtern ist die Bedeutung von Hand festgelegt.
- **Kanji-Daten** (`data/kanji.js`): [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) der EDRDG, CC BY-SA 4.0 – Heisig-Nummern der 6. Auflage (2200 Zeichen, entspricht der deutschen Ausgabe bei Klostermann), Strichzahl, Lesungen.
- **Strichfolgen** (`data/strokes/`): [KanjiVG](https://kanjivg.tagaini.net) von Ulrich Apel, CC BY-SA 3.0.
  Kanji-Daten und Strichfolgen werden mit `tools/build-kanji.ps1` erzeugt; für diese Dateien gilt die jeweilige Share-Alike-Lizenz.
- **Bedeutungsvorschläge in der Werkstatt** (`data/werkstatt/jmdict-de.js`): deutsche Glossen aus [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) der EDRDG, CC BY-SA 4.0, erzeugt mit `tools/build-jmdict-de.ps1`. Wird nur von der Werkstatt geladen, nicht von der App.
- **Geschichten:** eigene Texte und Nacherzählungen gemeinfreier Märchen (z. B. Momotarō). 「手袋を買いに」 von 新美南吉 (Niimi Nankichi, 1913–1943) stammt aus [Aozora Bunko](https://www.aozora.gr.jp/cards/000121/card637.html) (gemeinfrei) und ist ungekürzt übernommen; Wortzerlegung und deutsche Übersetzung sind eigene Arbeit.
- **Sprachaufnahmen** (`data/audio/`): erzeugt mit [VOICEVOX](https://voicevox.hiroshiba.jp), Stimme **VOICEVOX:夜語トバリ** (ノーマル). Nutzung laut [Bedingungen der Stimme](https://yogataritobari.studio.site/#rules) mit dieser Nennung, nicht kommerziell.
- **Bilder der Geschichten** (`data/art/`): gemeinfreie Holzschnitte über [Wikimedia Commons](https://commons.wikimedia.org), verkleinert – Kitagawa Utamaro „Junge Frau, einen Brief lesend“ (Metropolitan Museum of Art, CC0) · Utagawa Toyoharu „Momotarō und seine Tierfreunde besiegen die Dämonen“ · Utagawa Hiroshige „Fuchsfeuer beim Kleiderbaum von Ōji“, „Reisfelder von Asakusa und Torinomachi-Fest“, „Pflaumengarten in Kameido“ (alle 1857) und „Mishima, Morgennebel“ (Met, CC0) und „Restaurant Kawachiya in Yanagibashi, Ryōgoku“ aus „Berühmte Restaurants von Edo“ (um 1835/40, Rijksmuseum, CC0) · Katsushika Hokusai „Gewitter unterhalb des Gipfels“. Die Nachweise stehen auch im Katalog (`art.credit`) und erscheinen beim Antippen/Überfahren des Bildes.
- **Schrift für Titel:** Shippori Mincho (Google Fonts, SIL Open Font License).
- Heisigs Schlüsselwörter und Geschichten sind urheberrechtlich geschützt und nicht enthalten.

## Sprachaufnahmen erzeugen

Die Geschichten werden Satz für Satz mit VOICEVOX vertont (eine MP3 pro Satz, `data/audio/<id>/<szene>-<satz>.mp3`). Der Player spielt die Aufnahme ab, wenn der Katalogeintrag ein `audio`-Feld hat, und nutzt sonst die Sprachausgabe des Browsers; einzelne Wörter in den Wortdetails spricht weiterhin der Browser.

1. VOICEVOX starten (die Engine läuft dann auf http://127.0.0.1:50021); ffmpeg muss installiert sein.
2. `powershell -ExecutionPolicy Bypass -File tools/build-audio.ps1 -Story <id>` – erzeugt nur neue oder geänderte Sätze (`manifest.json`). Standardstimme ist 118 (夜語トバリ ノーマル), andere mit `-Speaker <id>`.
3. Das Skript vergleicht VOICEVOX' Lesung mit den Lesungen im Wörterbuch und listet Abweichungen. Liest VOICEVOX ein Wort falsch, im Wörterbucheintrag `tts: "かな"` ergänzen und das Skript erneut starten.
4. Im Katalog (`data/stories/index.js`) beim Eintrag `audio: { path: "data/audio/<id>/", credit: "VOICEVOX:夜語トバリ" }` ergänzen.

## Werkstatt: neue Geschichten aufbereiten

`werkstatt.html` (Link auch im Profil) macht aus einem japanischen Text eine fertige Geschichtsdatei:

0. *Optional* **Geschichte mit Claude schreiben:** Wunsch, Niveau (N5–N3), Länge und Anzahl neuer Wörter wählen → **In Claude öffnen** (oder Auftrag kopieren). Der Auftrag enthält die bekannten und gerade gelernten Wörter aus dem Lernstand dieses Browsers. Claude antwortet mit einem Codeblock (`@feld: wert` für die Angaben, `#` für Szenen, je Zeile ein japanischer Satz, darunter `= Übersetzung`, am Ende eine Wortliste `~ Wort | Lesung | Bedeutung | Wortart` mit den Bedeutungen im Zusammenhang). Den Codeblock in das Antwortfeld einfügen → **Übernehmen und zerlegen** füllt Angaben, Text und Übersetzungen aus und zerlegt den Text; Bedeutungen aus Claudes Wortliste haben Vorrang vor JMdict, mehrteilige Ausdrücke (ある朝) bleiben zusammen.
1. Angaben zur Geschichte eintragen und den Text einfügen. Eine Zeile mit `#` am Anfang startet eine neue Szene; Ruby im Aozora-Format (`漢字《かんじ》`) wird als Lesung übernommen und dann entfernt.
2. **Text zerlegen:** Die Wortzerlegung übernimmt [kuromoji.js](https://github.com/takuyaa/kuromoji.js) (Apache-2.0, wird vom CDN geladen – Internetverbindung nötig). Verbformen werden zu lernfreundlichen Einheiten zusammengefasst (行き+まし+た → 行きました mit Grundform 行く); Ausdrücke, die schon im Wörterbuch stehen, werden wiederverwendet; für neue Wörter schlägt die Werkstatt deutsche Bedeutungen aus JMdict vor (bitte prüfen – JMdict deckt nicht alle Wörter ab und ist manchmal knapp).
3. **Prüfen:** Wort anklicken → Lesung, Grundform, Bedeutung, Wortart, Hinweis bearbeiten; Wörter verbinden/teilen, Sätze teilen/verbinden; zu jedem Satz die deutsche Übersetzung eintragen. Rot markiert, was noch fehlt. Der Entwurf wird im Browser gespeichert.
4. **In die App übernehmen:** speichert die Geschichte als `geschichten/<id>.json` im privaten Daten-Repo (gleiches Token wie der Abgleich). Die App holt eigene Geschichten nach jedem Abgleich, hält eine Kopie im Browser (offline nutzbar) und zeigt sie in der Bibliothek als „Eigene Geschichte“. Löschen im Profil unter „Eigene Geschichten“ – nur solange keine Wörter daraus in Lernkartei oder Merkliste liegen.
   *Alternativ* als mitgelieferte Geschichte exportieren: erzeugt `data/stories/<id>.js` und den Katalogeintrag für `data/stories/index.js`. Datei einbinden wie unten beschrieben.

Am besten über den lokalen Server öffnen: `powershell -ExecutionPolicy Bypass -File tools/serve.ps1`, dann http://localhost:8123/werkstatt.html.

## Geschichten hinzufügen

Jede Geschichte ist eine eigene Datei und wird erst geladen, wenn sie gebraucht wird:

1. Metadaten (Titel, Beschreibung, Niveau, Thema, Quelle) in `data/stories/index.js` eintragen.
2. Den Text als `data/stories/<id>.js` anlegen: `Content.register({ id, scenes: [...], dict: {...} })`.
   Wörter im Satz werden mit `|` getrennt (vorbereitete Wortsegmente), z. B. `"手紙|に|は|「|秘密|の|約束|」|と|書いて|ありました|。"`.
3. Jedes Wort braucht einen Wörterbucheintrag – entweder im gemeinsamen `data/dictionary.js` oder im `dict`-Abschnitt der Geschichte (siehe `momotaro.js`). Gebeugte Formen zeigen mit `base` auf ihre Grundform.
4. Die Datei in `tests.html` einbinden; die Tests melden fehlende Einträge. Danach `tools/build-top2000.ps1` laufen lassen, damit neue Wörter einen Häufigkeitsplatz bekommen.

Die Bibliothek zeigt zu jeder Geschichte, welcher Anteil der Wörter schon bekannt ist oder in der Lernkartei liegt.
