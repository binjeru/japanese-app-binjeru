# Binjeru – Japanisch lernen

Eine kleine Lern-App für Hiragana, Katakana und erste Vokabeln – reines HTML, CSS und JavaScript, ohne Abhängigkeiten.

## Starten

`index.html` im Browser öffnen. Fertig.

## Funktionen

- **Kana-Tabelle** – alle Hiragana/Katakana inkl. Dakuten und Yōon, mit Sprachausgabe und farbigem Lernstand
- **Kana-Quiz** – Auswahl, Romaji eintippen oder Romaji → Kana; schwache Zeichen kommen häufiger dran
- **Karteikarten** – 73 Vokabeln in 7 Kategorien mit Leitner-Lernboxen
- **Vokabel-Quiz** – Multiple Choice in beide Richtungen
- **Fortschritt** – Lernserie und Trefferquote, gespeichert im `localStorage`

Tastatur: `1`–`4` zum Antworten, `Enter` für weiter, `Leertaste` dreht Karteikarten um.

## Vokabeln erweitern

Neue Einträge in `data.js` im Array `VOCAB` ergänzen: `[kana, kanji, romaji, deutsch, kategorie]`.
