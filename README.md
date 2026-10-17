# Binjeru – Japanisch mit Geschichten

Eine Lern-App, in der **Geschichten im Mittelpunkt** stehen: hören, mitlesen, unbekannte Wörter antippen – und nur die Wörter, die du wirklich lernen willst, landen in einer ruhigen Lernkartei.
Reines HTML, CSS und JavaScript, ohne Installation und ohne Abhängigkeiten.

## Starten

`index.html` im Browser öffnen. Fertig. (Die Tests laufen über `tests.html`.)

Für die Sprachausgabe braucht der Browser eine japanische Stimme – in Edge und Chrome meist vorhanden, unter Windows sonst über *Einstellungen → Zeit und Sprache → Sprache → Japanisch* nachinstallieren.

## Bereiche

- **Heute** – aktuelle Geschichte weiterhören, fällige Karten, wie viele neue Karten heute sinnvoll sind
- **Geschichten** – Bibliothek; Player mit Szenen, Hör- und Lesemodus, Tempo 0,75×/1×/1,25×, Satz wiederholen, Furigana/Romaji/Übersetzung zuschaltbar. Wort antippen → Lesung, Bedeutung, Grundform, Beispielsatz, Aussprache, „Zur Merkliste“
- **Wortschatz-Check** – nach einer Geschichte: Wort zeigen, überlegen, aufdecken; „Gewusst“ = bekannt, „Nicht gewusst“ = Merkliste
- **Merkliste** – gesammelte Wörter mit Beispielsatz und Herkunft; höchstens 12 neue Karten pro Tag aktivieren (weniger, wenn viele Wiederholungen anstehen)
- **Lernkartei** – 4 Fächer: *Kennenlernen* (Furigana, Aussprache automatisch), *Aufbau* (Furigana, Audio auf Knopfdruck), *Festigen* (ohne Furigana), *Langzeit*. Von jeder Karte zurück zur Stelle in der Geschichte
- **Profil** – bekannte/aktive/gemerkte Wörter, Hörstatistik, Themen, Sicherung (Export/Import), Kana-Übung

Tastatur: Player `Leertaste` Play/Pause, `←`/`→` Satz, `R` Satz wiederholen · Check/Lernkartei `Leertaste` aufdecken, `1` Noch nicht, `2` Gewusst · `Esc` schließt die Wortdetails.

## Aufbau

```
data/        Inhalte: Wörterbuch (dictionary.js), Geschichten (stories.js), Kana (kana.js)
js/util.js       Hilfsfunktionen (Furigana, Romaji, …)
js/content.js    bereitet Geschichten auf: Satz-IDs, Wortvorkommen, Häufigkeiten
js/scheduler.js  Wiederholungsplanung – reine Funktionen, getestet in js/scheduler.test.js
js/store.js      Datenschicht (localStorage): Merkliste, Karten, Wiederholungshistorie, Fortschritt
js/speech.js     Sprachausgabe (Platzhalter bis echte Aufnahmen vorliegen)
js/player.js     Geschichtenplayer + Wortdetails
js/app.js        Navigation und übrige Ansichten
```

**Wiederholungsplanung:** neue Karte sofort → nach „Gewusst“ in 3 Minuten nochmal (gleiche Lerneinheit) → nächster Tag → 3 → 8 → 20 → 50 Tage. „Noch nicht“ holt die Karte in derselben Einheit zurück und halbiert das Intervall. Die Fächer werden aus Lernphase und Intervall abgeleitet; jede Wiederholung wird protokolliert (Grundlage für späteres FSRS).

## Quellen und Lizenzen

- **Häufigkeitsränge** (`data/frequency.js`): Leeds Internet Corpus (Serge Sharoff, University of Leeds), Liste von [hingston/japanese](https://github.com/hingston/japanese), CC BY 2.5. Erzeugt mit `tools/build-frequency.ps1`.
- **Kanji-Daten** (`data/kanji.js`): [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) der EDRDG, CC BY-SA 4.0 – Heisig-Nummern der 6. Auflage (2200 Zeichen, entspricht der deutschen Ausgabe bei Klostermann), Strichzahl, Lesungen.
- **Strichfolgen** (`data/strokes/`): [KanjiVG](https://kanjivg.tagaini.net) von Ulrich Apel, CC BY-SA 3.0.
  Kanji-Daten und Strichfolgen werden mit `tools/build-kanji.ps1` erzeugt; für diese Dateien gilt die jeweilige Share-Alike-Lizenz.
- Heisigs Schlüsselwörter und Geschichten sind urheberrechtlich geschützt und nicht enthalten.

## Geschichten hinzufügen

In `data/stories.js` eine Geschichte mit Szenen ergänzen. Wörter im Satz werden mit `|` getrennt (vorbereitete Wortsegmente), z. B. `"手紙|に|は|「|秘密|の|約束|」|と|書いて|ありました|。"`.
Jedes Wort braucht einen Eintrag in `data/dictionary.js` – gebeugte Formen zeigen mit `base` auf ihre Grundform. `tests.html` meldet fehlende Einträge.
