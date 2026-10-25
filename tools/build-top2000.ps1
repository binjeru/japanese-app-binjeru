# Erzeugt aus einer durchgehenden Häufigkeitsrangliste der lernbaren Wörter des Japanischen:
#   data/top2000.js   – die 2000 häufigsten mit Lesung und deutscher Bedeutung (Übersicht „Top 2000“)
#   data/frequency.js – den Platz jedes Worts aus Wörterbuch und Geschichten (Merkliste, Wortdetails)
# So tragen beide überall dieselbe Nummer.
# Quellen:
#   Häufigkeit: Leeds Internet Corpus (Serge Sharoff), Liste von hingston/japanese, CC BY 2.5
#     (Datei 44998-japanese-words.txt, ein Wort pro Zeile, nach Häufigkeit)
#   Lesung, Bedeutung, Wortart: JMdict, © EDRDG, CC BY-SA 4.0 (Datei JMdict.gz, alle Sprachen)
# Ausgelassen werden Partikel, Hilfsverben, Kopula, Vor-/Nachsilben, Zahlen und einzelne Kana
# (in der Liste meist Wortbruchstücke). Ohne deutsche Glosse dient die englische (mit „(engl.)“).
# Aufruf: powershell -File tools/build-top2000.ps1 -List <Liste> -JMdict <JMdict.gz> [-Count 2000]
param([Parameter(Mandatory)][string]$List, [Parameter(Mandatory)][string]$JMdict, [int]$Count = 2000)
$root = Split-Path $PSScriptRoot -Parent
Add-Type -AssemblyName System.Xml

# ---------- Häufigkeitsliste: Wörter in Reihenfolge (ohne Satzzeichen/Latein) ----------
$words = New-Object System.Collections.Generic.List[string]
$seen = @{}
foreach ($w in [IO.File]::ReadAllLines($List, [Text.Encoding]::UTF8)) {
  $w = $w.Trim()
  if ($w -notmatch '^[ぁ-ヿ㐀-鿿々ー]+$' -or $seen.ContainsKey($w)) { continue }
  $seen[$w] = 1
  $words.Add($w)
}
$wanted = @{}; foreach ($w in $words) { $wanted[$w] = 1 }

# ---------- JMdict: nur Einträge, deren Schreibweise in der Liste vorkommt ----------
$fs = [IO.File]::OpenRead($JMdict)
$gz = New-Object IO.Compression.GZipStream($fs, [IO.Compression.CompressionMode]::Decompress)
$settings = New-Object Xml.XmlReaderSettings
$settings.DtdProcessing = [Xml.DtdProcessing]::Parse
$settings.XmlResolver = $null
$settings.MaxCharactersFromEntities = 0
$reader = [Xml.XmlReader]::Create($gz, $settings)
$index = @{}   # Schreibweise → @{ r; de; en; pos; prio }
while ($reader.ReadToFollowing("entry")) {
  $x = [xml]$reader.ReadOuterXml(); $e = $x.entry
  $kebs = @($e.k_ele | ForEach-Object { $_.keb } | Where-Object { $_ })
  $rebs = @($e.r_ele | ForEach-Object { $_.reb } | Where-Object { $_ })
  $forms = @($kebs + $rebs | Where-Object { $wanted.ContainsKey($_) })
  if (-not $forms.Count) { continue }
  $senses = @($e.sense)
  # Elemente nur mit Text liefert PowerShell als Zeichenkette, solche mit Attributen als XmlElement
  $text = { param($n) if ($null -eq $n) { "" } elseif ($n -is [string]) { $n } else { $n.InnerText } }
  $lang = { param($n) if ($null -eq $n) { "" } elseif ($n -is [string]) { "eng" } else { $l = $n.GetAttribute("xml:lang"); if ($l) { $l } else { "eng" } } }
  $ger = @(); $eng = @()
  foreach ($s in $senses) {
    $g = @($s.gloss)
    $de = @($g | Where-Object { (& $lang $_) -eq "ger" } | ForEach-Object { & $text $_ } | Select-Object -First 3)
    $en = @($g | Where-Object { (& $lang $_) -eq "eng" } | ForEach-Object { & $text $_ } | Select-Object -First 3)
    if ($de.Count -and $ger.Count -lt 2) { $ger += ($de -join ", ") }
    if ($en.Count -and $eng.Count -lt 2) { $eng += ($en -join ", ") }
  }
  # Wortart der ersten Bedeutung (Entitäten wie &prt; sind zu „particle“ usw. aufgelöst)
  $pos = @($senses[0].pos | ForEach-Object { & $text $_ })
  $pris = @(@($e.k_ele.ke_pri) + @($e.r_ele.re_pri) | ForEach-Object { & $text $_ })
  $prio = [bool]($pris | Where-Object { $_ -match '^(news1|ichi1|spec1|gai1)$' })
  # Häufigkeitsband in der Zeitungsliste (nf01 = 500 häufigste Wörter …), kleiner ist häufiger
  $nf = ($pris | Where-Object { $_ -match '^nf(\d+)$' } | ForEach-Object { [int]$_.Substring(2) } | Measure-Object -Minimum).Minimum
  $uk = [bool](@($senses | ForEach-Object { $_.misc } | ForEach-Object { & $text $_ }) -match 'usually written using kana')
  foreach ($f in $forms) {
    $isKana = ($kebs -notcontains $f)
    # Kana-Form passt nur zu Wörtern ohne Kanji oder solchen, die man meist in Kana schreibt
    # (sonst wird z. B. あり – Form von ある – zu 蟻 „Ameise“)
    if ($isKana -and $kebs.Count -and -not $uk) { continue }
    # Hauptschreibweise: erste Kanji-Form, bei Kana die erste Lesung – bei meist in Kana geschriebenen
    # Wörtern jede Lesung (みんな ist nur die zweite Lesung von 皆)
    $primary = ($f -eq $kebs[0]) -or ($isKana -and ($f -eq $rebs[0] -or $uk))
    # Hauptwortart = erste Angabe der ersten Bedeutung; Inhaltswörter schlagen Vor-/Nachsilben, Zählwörter …
    $content = -not ("$($pos[0])" -match '^(particle|auxiliary|copula|prefix|suffix|counter)')   # Zahlwörter (一つ) zählen mit
    $score = ([int]$prio) * 100 + ([int]$content) * 20 + ([int]$primary) * 10 + $(if ($nf) { (49 - $nf) / 10 } else { 0 }) + ([int][bool]$ger.Count)
    $info = @{ r = $(if ($isKana) { $f } else { $rebs[0] }); de = ($ger -join "; "); en = ($eng -join "; "); pos = ($pos -join "|"); score = $score; prio = $prio; primary = $primary; content = $content; seq = $e.ent_seq }
    # gleiche Schreibweise mehrfach: häufiges Wort, Hauptschreibweise, deutsche Bedeutung bevorzugen
    if (-not $index[$f] -or $score -gt $index[$f].score) { $index[$f] = $info }
  }
}
$reader.Close(); $fs.Close()

# ---------- Auswahl ----------
$skipPos = 'particle|auxiliary|copula|prefix|suffix|counter|numeric'
$out = New-Object System.Collections.Generic.List[string]
$esc = { param($s) '"' + ($s -replace '\\', '\\' -replace '"', '\"') + '"' }
$posShort = { param($p)
  if ($p -match 'noun \(common\)') { "Nomen" }   # auch Suru-Nomen wie コメント
  elseif ($p -match '(Ichidan|Godan|Kuru|irregular|suru verb - (special|included)|Nidan|Yodan).*verb|verb.*\(transitive\)|intransitive verb') { "Verb" }
  elseif ($p -match "adjective \(keiyoushi\)") { "Adjektiv" }
  elseif ($p -match 'adjectival nouns|quasi-adjectives') { "Adjektiv (na)" }
  elseif ($p -match 'adverb') { "Adverb" }
  elseif ($p -match 'pronoun') { "Pronomen" }
  elseif ($p -match 'pre-noun adjectival') { "Demonstrativ" }
  elseif ($p -match 'conjunction') { "Konjunktion" }
  elseif ($p -match 'interjection') { "Ausruf" }
  elseif ($p -match 'expression') { "Ausdruck" }
  elseif ($p -match 'numeric') { "Zahlwort" }
  elseif ($p -match 'noun') { "Nomen" }
  else { "" } }
$fragments = @("ます", "まし", "ませ", "ませ", "あり", "おり", "ござい", "だろ", "でしょ", "なく", "なら", "なり", "でき", "られ", "れる", "られる",
  "せる", "させ", "いけ", "いき", "しまい", "しまっ", "ちゃ", "じゃ", "けど", "だっ", "でし", "あっ", "いっ", "なっ", "やっ", "ゃ")
# doppelte Begriffe in Bedeutungen entfernen („Kreis, Kugel; Kreis“ → „Kreis, Kugel“)
function Tidy([string]$g) {
  $seen = @{}
  (($g -split '; ' | ForEach-Object { (($_ -split ', ' | Where-Object { $k = $_.Trim(); $k -and -not $seen.ContainsKey($k) -and ($seen[$k] = 1) }) -join ', ') }) | Where-Object { $_ }) -join '; '
}
$fragments += @("出", "見", "来", "言")
# Sehr häufige mehrdeutige Wörter: JMdict nennt hier oft eine seltene Bedeutung zuerst (いる → 要る
# „brauchen“). Diese Einträge sind von Hand festgelegt: Schreibweise → @(Lesung, Bedeutung, Wortart)
$overrides = @{
  "いる" = @("", "sein, sich befinden (Lebewesen); ～ている: gerade tun", "Verb")
  "なる" = @("", "werden", "Verb")
  "する" = @("", "tun, machen", "Verb")
  "ある" = @("", "sein, vorhanden sein, haben (Dinge)", "Verb")
  "ない" = @("", "nicht vorhanden sein; nicht (Verneinung)", "Adjektiv")
  "いい" = @("", "gut", "Adjektiv")
  "この" = @("", "dieser, diese, dieses (hier)", "Demonstrativ")
  "その" = @("", "der, die, das (da); dieser", "Demonstrativ")
  "あの" = @("", "jener, jene, jenes (dort)", "Demonstrativ")
  "という" = @("", "namens, der/die/das … heißt; dass", "Ausdruck")
  "として" = @("", "als (in der Rolle von)", "Ausdruck")
  "について" = @("", "über, bezüglich", "Ausdruck")
  "的" = @("てき", "-isch, -lich (macht aus Nomen Adjektive)", "Suffix")
  "日" = @("ひ", "Tag; Sonne", "Nomen")
  "円" = @("えん", "Yen; Kreis", "Nomen")
  "そう" = @("", "so; ja, genau", "Adverb")
  "よう" = @("", "Art, Weise; wie, so dass", "Nomen")
  "ため" = @("", "um zu; wegen; zugunsten", "Nomen")
  "ところ" = @("", "Ort, Stelle; Moment, gerade (als)", "Nomen")
  "中" = @("なか", "Inneres, in; Mitte", "Nomen")
}
$rank = 0; $skipped = 0; $place = 0
$placeOf = @{}   # Schreibweise → Platz in der durchgehenden Rangliste der lernbaren Wörter
$seqPlace = @{}  # JMdict-Eintrag → Platz
foreach ($w in $words) {
  $rank++
  if ($w -match '^[ぁ-ゟ]$' -or $w -match '^[゠-ヿ]$') { $skipped++; continue }   # einzelne Kana
  $i = $index[$w]
  if (-not $i) { $skipped++; continue }
  # Bruchstücke gebeugter Formen (ます, あり, ござい …) und einzelne Kanji/Kana-Wörter nur, wenn sie als
  # eigenes Wort häufig sind (sonst ist 見 meist der Stamm von 見る, nicht 見 „Meinung“)
  if ($fragments -contains $w) { $skipped++; continue }
  if (-not $i.primary) { $skipped++; continue }
  if (($w.Length -eq 1 -or $w -match '^[ぁ-ゟ]+$') -and -not $i.prio) { $skipped++; continue }
  # Grammatikwörter: Hauptwortart Partikel, Hilfsverb, Kopula, Vor-/Nachsilbe, Zählwort, Zahl
  # (nicht nach Text suchen – „nouns which may take the genitive case particle 'no'“ ist ein Nomen)
  if (-not $i.content) { $skipped++; continue }
  # Gleiches Wort in anderer Schreibweise (事/こと, 沢山/たくさん): selber Platz, zählt nur einmal
  if ($seqPlace.ContainsKey($i.seq)) { $placeOf[$w] = $seqPlace[$i.seq]; continue }
  $place++
  $placeOf[$w] = $place
  $seqPlace[$i.seq] = $place
  if ($place -gt $Count) { continue }   # Platz zählt weiter (für frequency.js), in die Top-Liste nur die ersten $Count
  $de = if ($i.de) { Tidy $i.de } else { "(engl.) " + (Tidy $i.en) }
  $de = $de.Trim()
  if ($de.Length -gt 70) { $de = $de.Substring(0, 67).TrimEnd(" ,;") + " …" }
  $r = if ($i.r -and $i.r -ne $w) { $i.r } else { "" }
  $ps = & $posShort $i.pos
  if ($overrides.ContainsKey($w)) { $r, $de, $ps = $overrides[$w] }
  $line = "  [{0}, {1}, {2}, {3}, {4}]," -f $rank, (& $esc $w), (& $esc $r), (& $esc $de), (& $esc $ps)
  $out.Add($line)
}
# Nebenschreibweisen (温かい neben 暖かい) wurden oben als „nicht Hauptform“ übersprungen:
# sie bekommen den Platz ihres JMdict-Eintrags, ohne die Rangliste zu verändern
# (dieselben Schutzregeln wie oben: keine Bruchstücke, keine kurzen/reinen Kana-Formen ohne Häufigkeitsmarke)
$viaAlt = @{}
foreach ($f in @($index.Keys)) {
  $i = $index[$f]
  if ($placeOf.ContainsKey($f) -or -not $seqPlace.ContainsKey($i.seq) -or $fragments -contains $f) { continue }
  if (($f.Length -eq 1 -or $f -match '^[ぁ-ゟ]+$') -and -not $i.prio) { continue }
  $placeOf[$f] = $seqPlace[$i.seq]
  $viaAlt[$f] = 1
}
$header = @"
// Die $Count häufigsten lernbaren Wörter des Japanischen – automatisch erzeugt mit
// tools/build-top2000.ps1, nicht von Hand bearbeiten. Felder: [Rang in der Häufigkeitsliste,
// Schreibweise, Lesung (leer = wie Schreibweise), deutsche Bedeutung, Wortart].
// Häufigkeit: Leeds Internet Corpus (Serge Sharoff, University of Leeds), Liste von
// https://github.com/hingston/japanese, CC BY 2.5. Lesungen und Bedeutungen: JMdict, © EDRDG,
// CC BY-SA 4.0 (https://www.edrdg.org/edrdg/licence.html) – diese Datei steht unter CC BY-SA 4.0.
// Ohne deutsche Bedeutung in JMdict steht die englische mit „(engl.)“.
"@
[IO.File]::WriteAllText((Join-Path $root "data\top2000.js"), "$header`nconst TOP_WORDS = [`n$($out -join "`n")`n];`n", (New-Object Text.UTF8Encoding $false))
"top2000.js: {0} Wörter; {1} ohne deutsche Bedeutung" -f $out.Count, (@($out | Where-Object { $_ -match '\(engl\.\)' }).Count)

# ---------- frequency.js: Platz jedes Wörterbuch-Worts in derselben Rangliste ----------
# Grundformen aus dem Wörterbuch und den dict-Abschnitten der Geschichten (Einträge ohne base:);
# die Kanji-Schreibweise hat Vorrang (kurze Kana wie き sind in der Liste oft Bruchstücke)
$files = @(Join-Path $root "data\dictionary.js") + @(Get-ChildItem (Join-Path $root "data\stories") -Filter *.js | ForEach-Object { $_.FullName })
$freq = [ordered]@{}
foreach ($line in ($files | ForEach-Object { [IO.File]::ReadAllLines($_, [Text.Encoding]::UTF8) })) {
  if ($line -notmatch '^\s*"([^"]+)":\s*\{(.*)\},?\s*$') { continue }
  $key = $Matches[1]; $body = $Matches[2]
  if ($body -match 'base:' -or $freq.Contains($key)) { continue }
  $p = $null; $form = $null
  if ($body -match '\bk:\s*"([^"]+)"' -and $placeOf.ContainsKey($Matches[1])) { $form = $Matches[1] }
  elseif ($placeOf.ContainsKey($key)) { $form = $key }
  if ($form) { $p = $placeOf[$form] }
  # Über eine Nebenschreibweise zugeordnet: nicht für Grammatikwörter (sonst bekäme die Partikel や den Platz
  # eines gleich gelesenen Worts)
  if ($form -and $viaAlt.ContainsKey($form) -and $body -match 'pos:\s*"(Partikel|Satzendpartikel|Kopula|Suffix|Hilfsverb)"') { $p = $null }
  if ($null -ne $p) { $freq[$key] = $p }
}
$fbody = ($freq.GetEnumerator() | ForEach-Object { '  "{0}": {1},' -f $_.Key, $_.Value }) -join "`n"
$fheader = @"
// Platz der Grundformen in der Häufigkeitsrangliste der lernbaren Wörter des Japanischen (1 = häufigstes).
// Dieselbe Rangliste wie data/top2000.js (Platz 1–$Count) – automatisch erzeugt mit tools/build-top2000.ps1,
// nicht von Hand bearbeiten. Quelle: Leeds Internet Corpus (Serge Sharoff, University of Leeds), Liste von
// https://github.com/hingston/japanese, CC BY 2.5; Partikel, Hilfsverben und Wortbruchstücke sind (mithilfe
// von JMdict, EDRDG, CC BY-SA 4.0) herausgerechnet. Die Liste zählt Textbausteine – die Plätze sind eine Orientierung.
"@
[IO.File]::WriteAllText((Join-Path $root "data\frequency.js"), "$fheader`nconst FREQ_RANK = {`n$fbody`n};`n", (New-Object Text.UTF8Encoding $false))
"frequency.js: {0} Wörterbuch-Wörter mit Platz (Rangliste insgesamt {1} Plätze)" -f $freq.Count, $place
