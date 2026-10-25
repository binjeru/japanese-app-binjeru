// Katalog aller Geschichten (nur Metadaten). Der Text jeder Geschichte liegt in data/stories/<id>.js
// und wird erst geladen, wenn er gebraucht wird.
//   level: Schwierigkeit · genre: Thema · icon: Kanji für die Titelkachel
//   sourceType: "curated" (selbst geschrieben/bearbeitet) · source: Herkunft bzw. Vorlage
//   audio: Sprachaufnahmen (eine MP3 je Satz, <szene>-<satz>.mp3, erzeugt mit tools/build-audio.ps1)
//          und die vorgeschriebene Nennung der Stimme
//   art: Bild der Geschichte (gemeinfreier Holzschnitt, data/art/), Bildausschnitt für die Kachel und Bildnachweis
const STORY_CATALOG = [
  {
    id: "himitsu", titleJp: "ひみつのやくそく", titleDe: "Das geheime Versprechen",
    description: "Mia, eine deutsche Studentin in Tokio, findet einen rätselhaften Brief ohne Absender. Was hat es mit dem „geheimen Versprechen“ auf sich?",
    level: "N5", genre: "Mystery · Alltag", icon: "秘", sourceType: "curated", source: "Eigene Geschichte",
    audio: { path: "data/audio/himitsu/", credit: "VOICEVOX:夜語トバリ" },
    art: { src: "data/art/himitsu.jpg", pos: "35% 30%", credit: "Kitagawa Utamaro, „Junge Frau, einen Brief lesend“, um 1793/94 (Metropolitan Museum of Art, CC0)" },
  },
  {
    id: "izakaya", titleJp: "はじめての居酒屋", titleDe: "Das erste Izakaya",
    description: "Luca, 33, aus Zürich, geht am ersten Abend in Tokio essen: Oshibori, Wasser gratis, Speisekarte nur auf Japanisch, Garnelenallergie, ein Otōshi, das niemand bestellt hat – und Trinkgeld, das niemand will.",
    level: "N5", genre: "Alltag · Restaurant", icon: "食", sourceType: "curated", source: "Eigene Geschichte",
    audio: { path: "data/audio/izakaya/", credit: "VOICEVOX:夜語トバリ" },
    art: { src: "data/art/izakaya.jpg", pos: "22% 70%", credit: "Utagawa Hiroshige, „Restaurant Kawachiya in Yanagibashi, Ryōgoku“ aus „Berühmte Restaurants von Edo“, um 1835/40 (Rijksmuseum, CC0)" },
  },
  {
    id: "momotaro", titleJp: "ももたろう", titleDe: "Momotarō, der Pfirsichjunge",
    description: "Das berühmteste Märchen Japans: Ein Junge, geboren aus einem Pfirsich, zieht mit Hund, Affe und Fasan zur Dämoneninsel.",
    level: "N5", genre: "Märchen", icon: "桃", sourceType: "curated", source: "Eigene Nacherzählung des japanischen Volksmärchens (gemeinfrei)",
    audio: { path: "data/audio/momotaro/", credit: "VOICEVOX:夜語トバリ" },
    art: { src: "data/art/momotaro.jpg", pos: "72% 62%", credit: "Utagawa Toyoharu, „Momotarō und seine Tierfreunde besiegen die Dämonen“, spätes 18. Jahrhundert (gemeinfrei)" },
  },
  {
    id: "issunboshi", titleJp: "いっすんぼうし", titleDe: "Issun-bōshi, der Daumenlange",
    description: "Ein Junge, nicht größer als ein Daumen, fährt in einer Reisschale in die Hauptstadt – mit einer Nähnadel als Schwert und einem Dämon als Gegner.",
    level: "N5", genre: "Märchen", icon: "寸", sourceType: "curated", source: "Eigene Nacherzählung des japanischen Volksmärchens (gemeinfrei)",
    audio: { path: "data/audio/issunboshi/", credit: "VOICEVOX:夜語トバリ" },
    art: { src: "data/art/issunboshi.jpg", pos: "48% 62%", credit: "Unbekannter Künstler, „Issun-bōshi“ aus dem Otogi-zōshi, um 1725 (National Diet Library, gemeinfrei)" },
  },
  {
    id: "urashima", titleJp: "うらしまたろう", titleDe: "Urashima Tarō",
    description: "Ein junger Fischer rettet eine Schildkröte und wird zum Dank in den Drachenpalast unter dem Meer eingeladen. Doch die Zeit dort vergeht anders …",
    level: "N5", genre: "Märchen", icon: "亀", sourceType: "curated", source: "Eigene Nacherzählung des japanischen Volksmärchens (gemeinfrei)",
    audio: { path: "data/audio/urashima/", credit: "VOICEVOX:夜語トバリ" },
    art: { src: "data/art/urashima.jpg", pos: "42% 50%", credit: "Tsukioka Yoshitoshi, „Urashima kehrt heim“ (帰国浦島), 1882 (Los Angeles County Museum of Art, gemeinfrei)" },
  },
  {
    id: "kasajizo", titleJp: "かさじぞう", titleDe: "Die Jizō mit den Strohhüten",
    description: "Ein armer alter Mann kann an Silvester keinen einzigen Strohhut verkaufen – und schenkt sie den verschneiten Steinfiguren am Wegrand.",
    level: "N5", genre: "Märchen", icon: "雪", sourceType: "curated", source: "Eigene Nacherzählung des japanischen Volksmärchens (gemeinfrei)",
    audio: { path: "data/audio/kasajizo/", credit: "VOICEVOX:夜語トバリ" },
    art: { src: "data/art/kasajizo.jpg", pos: "38% 70%", credit: "Utagawa Hiroshige, „Abendschnee in Kambara“ aus „Die 53 Stationen des Tōkaidō“, um 1833/34 (Los Angeles County Museum of Art, gemeinfrei)" },
  },
  {
    id: "tebukuro", titleJp: "手袋を買いに", titleDe: "Handschuhe kaufen",
    description: "Ein kleiner Fuchs soll mit einer verzauberten Menschenhand in der Stadt Handschuhe kaufen – und streckt die falsche Pfote hin. Eine der bekanntesten Erzählungen Japans, ungekürzt im Original.",
    level: "N3 · Originaltext", genre: "Literatur · Märchen", icon: "狐", sourceType: "aozora",
    source: "新美南吉 (Niimi Nankichi, 1913–1943), Aozora Bunko Nr. 637 (gemeinfrei); deutsche Übersetzung: eigene",
    audio: { path: "data/audio/tebukuro/", credit: "VOICEVOX:夜語トバリ" },
    art: { src: "data/art/tebukuro.jpg", pos: "40% 74%", credit: "Utagawa Hiroshige, „Fuchsfeuer in der Silvesternacht beim Kleiderbaum von Ōji“, 1857 (gemeinfrei)" },
  },
  {
    id: "neko", titleJp: "わたしのねこ", titleDe: "Meine Katze",
    description: "Yuki erzählt von ihrer kleinen weißen Katze Tama. Nur Hiragana und Katakana, ganz einfache Sätze.",
    level: "Einstieg", genre: "Alltag", icon: "猫", sourceType: "curated", source: "Eigene Geschichte",
    audio: { path: "data/audio/neko/", credit: "VOICEVOX:夜語トバリ" },
    art: { src: "data/art/neko.jpg", pos: "36% 58%", credit: "Utagawa Hiroshige, „Reisfelder von Asakusa und Torinomachi-Fest“, 1857 (gemeinfrei)" },
  },
  {
    id: "kouen", titleJp: "こうえんで", titleDe: "Im Park",
    description: "Ein sonniger Tag im Park mit einer Freundin, einem Hund und einem Picknick auf der Bank.",
    level: "Einstieg", genre: "Alltag", icon: "木", sourceType: "curated", source: "Eigene Geschichte",
    audio: { path: "data/audio/kouen/", credit: "VOICEVOX:夜語トバリ" },
    art: { src: "data/art/kouen.jpg", pos: "50% 30%", credit: "Utagawa Hiroshige, „Pflaumengarten in Kameido“, 1857 (gemeinfrei)" },
  },
  {
    id: "asagohan", titleJp: "あさごはん", titleDe: "Frühstück",
    description: "Ein ganz normaler Morgen – erzählt in der Vergangenheitsform.",
    level: "Einstieg", genre: "Alltag", icon: "朝", sourceType: "curated", source: "Eigene Geschichte",
    audio: { path: "data/audio/asagohan/", credit: "VOICEVOX:夜語トバリ" },
    art: { src: "data/art/asagohan.jpg", pos: "50% 62%", credit: "Utagawa Hiroshige, „Mishima, Morgennebel“, um 1833/34 (Metropolitan Museum of Art, CC0)" },
  },
  {
    id: "fuji", titleJp: "ふじさん", titleDe: "Der Fuji",
    description: "Ein Traum vom höchsten Berg Japans – mit den ersten Kanji.",
    level: "Einstieg", genre: "Kultur · Natur", icon: "山", sourceType: "curated", source: "Eigene Geschichte",
    audio: { path: "data/audio/fuji/", credit: "VOICEVOX:夜語トバリ" },
    art: { src: "data/art/fuji.jpg", pos: "66% 30%", credit: "Katsushika Hokusai, „Gewitter unterhalb des Gipfels“, um 1830/32 (gemeinfrei)" },
  },
];
