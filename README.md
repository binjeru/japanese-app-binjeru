# Binjeru – Japanisch lernen

Eine kleine Lern-App für Hiragana, Katakana und erste Vokabeln – reines HTML, CSS und JavaScript, ohne Abhängigkeiten.

## Starten

`index.html` im Browser öffnen. Fertig.

## Funktionen

- **Kana-Tabelle** – alle Hiragana/Katakana inkl. Dakuten und Yōon, mit Sprachausgabe und farbigem Lernstand
- **Kana-Quiz** – Auswahl, Romaji eintippen oder Romaji → Kana; schwache Zeichen kommen häufiger dran
- **Karteikarten** – 73 Vokabeln in 7 Kategorien mit Leitner-Lernboxen
- **Vokabel-Quiz** – Multiple Choice in beide Richtungen
- **Geschichten** – kurze Einsteiger-Geschichten mit Sprachausgabe Satz für Satz, Furigana/Romaji/Übersetzung zuschaltbar; Wörter anklicken zum Übersetzen und als Karteikarte übernehmen (Kategorie „Aus Geschichten“)
- **Fortschritt** – Lernserie und Trefferquote, gespeichert im `localStorage`

Tastatur: `1`–`4` zum Antworten, `Enter` für weiter, `Leertaste` dreht Karteikarten um. In Geschichten: `Leertaste` Play/Pause, `←`/`→` Satz wechseln, `Esc` schließt das Wort-Popup.

Für die Sprachausgabe braucht der Browser eine japanische Stimme (in Edge und Chrome meist vorhanden; unter Windows sonst über *Einstellungen → Zeit und Sprache → Sprache → Japanisch* nachinstallieren).

## Vokabeln erweitern

Neue Einträge in `data.js` im Array `VOCAB` ergänzen: `[kana, kanji, romaji, deutsch, kategorie]`.

## Geschichten erweitern

In `stories.js` eine Geschichte zu `STORIES` hinzufügen. Wörter im Satz werden mit `|` getrennt, z. B. `"わたし|は|ねこ|が|すき|です|。"`. Jedes Wort (außer Satzzeichen) braucht einen Eintrag im Wörterbuch `DICT` – bei gebeugten Formen mit `base` auf die Grundform, die dann in die Karteikarten übernommen wird.
