# Erzeugt data/frequency.js: Häufigkeitsrang jeder Grundform aus data/dictionary.js.
# Quelle: Leeds Internet Corpus (Japanisch), aufbereitet von hingston/japanese, Lizenz CC BY 2.5
#   https://github.com/hingston/japanese  (Datei 44998-japanese-words.txt, ein Wort pro Zeile, nach Häufigkeit)
# Aufruf: powershell -File tools/build-frequency.ps1 -List <Pfad zur Liste>
param([Parameter(Mandatory)][string]$List)

$root = Split-Path $PSScriptRoot -Parent
$lines = Get-Content -Encoding UTF8 $List

# Rang zählen, dabei Satzzeichen, lateinische Zeichen und Markierungen (EOS) überspringen
$rank = @{}
$n = 0
foreach ($w in $lines) {
  $w = $w.Trim()
  if ($w -notmatch '[\u3041-\u30ff\u3400-\u9fff々]') { continue }
  $n++
  if (-not $rank.ContainsKey($w)) { $rank[$w] = $n }
}

# Grundformen aus dem Wörterbuch und den dict-Abschnitten der Geschichten lesen (Einträge ohne base:)
$files = @(Join-Path $root "data\dictionary.js") + @(Get-ChildItem (Join-Path $root "data\stories") -Filter *.js | ForEach-Object { $_.FullName })
$dictLines = $files | ForEach-Object { Get-Content -Encoding UTF8 $_ }
$out = [ordered]@{}
foreach ($line in $dictLines) {
  if ($line -notmatch '^\s*"([^"]+)":\s*\{(.*)\},?\s*$') { continue }
  $key = $Matches[1]; $body = $Matches[2]
  if ($body -match 'base:') { continue }
  # Kanji-Schreibweise bevorzugen: kurze Kana-Wörter (z. B. き) kommen in der Liste auch als
  # Wortbruchstück vor und hätten sonst einen viel zu guten Rang
  $best = $null
  if ($body -match 'k:\s*"([^"]+)"' -and $rank.ContainsKey($Matches[1])) { $best = $rank[$Matches[1]] }
  elseif ($rank.ContainsKey($key)) { $best = $rank[$key] }
  if ($null -ne $best) { $out[$key] = $best }
}

$body = ($out.GetEnumerator() | ForEach-Object { '  "{0}": {1},' -f $_.Key, $_.Value }) -join "`n"
$js = @"
// Häufigkeitsrang der Grundformen im Japanischen (1 = häufigstes Wort). Automatisch erzeugt
// mit tools/build-frequency.ps1 – nicht von Hand bearbeiten.
// Quelle: Leeds Internet Corpus (Serge Sharoff, University of Leeds), Liste von
// https://github.com/hingston/japanese, Lizenz CC BY 2.5. Satzzeichen und lateinische Zeichen sind
// herausgerechnet; die Liste zählt Textbausteine, die Ränge sind daher eine Orientierung.
const FREQ_RANK = {
$body
};
"@
[IO.File]::WriteAllText((Join-Path $root "data\frequency.js"), $js + "`n", (New-Object Text.UTF8Encoding $false))
"{0} Wörter mit Rang, {1} ohne Treffer" -f $out.Count, (@($dictLines | Where-Object { $_ -match '^\s*"[^"]+":\s*\{' -and $_ -notmatch 'base:' }).Count - $out.Count)
