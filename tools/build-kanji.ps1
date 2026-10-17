# Erzeugt die Kanji-Daten für die Heisig-Rubrik:
#   data/kanji.js            – Heisig-Nummer (6. Auflage, 2200 Zeichen), Kanji, Strichzahl, Lesungen, engl. Bedeutung
#   data/strokes/NNNN-NNNN.js – Strichfolge (SVG-Pfade) in Blöcken zu 200 Rahmen, werden bei Bedarf geladen
# Quellen:
#   KANJIDIC2 – Electronic Dictionary Research and Development Group (EDRDG), Lizenz CC BY-SA 4.0
#               https://www.edrdg.org/wiki/index.php/KANJIDIC_Project
#   KanjiVG   – Ulrich Apel, Lizenz CC BY-SA 3.0, https://kanjivg.tagaini.net
# Aufruf: powershell -File tools/build-kanji.ps1 -Kanjidic <kanjidic2.xml.gz> -KanjiVG <kanjivg-…-main.zip>
param([Parameter(Mandatory)][string]$Kanjidic, [Parameter(Mandatory)][string]$KanjiVG)

$root = Split-Path $PSScriptRoot -Parent
$utf8 = New-Object Text.UTF8Encoding $false
Add-Type -AssemblyName System.IO.Compression.FileSystem

# ---------- KANJIDIC2 lesen ----------
$fs = [IO.File]::OpenRead($Kanjidic)
$gz = New-Object IO.Compression.GZipStream($fs, [IO.Compression.CompressionMode]::Decompress)
$settings = New-Object Xml.XmlReaderSettings
$settings.DtdProcessing = [Xml.DtdProcessing]::Parse   # internes DTD der Datei, keine externen Zugriffe
$settings.XmlResolver = $null
$settings.MaxCharactersFromEntities = 0
$reader = [Xml.XmlReader]::Create($gz, $settings)
$doc = New-Object Xml.XmlDocument
$doc.Load($reader)
$reader.Close(); $fs.Close()

$rows = @()
foreach ($c in $doc.SelectNodes("/kanjidic2/character")) {
  $h = $c.SelectSingleNode("dic_number/dic_ref[@dr_type='heisig6']")
  if (-not $h -or [int]$h.InnerText -gt 2200) { continue }   # nur Band 1 (Nummern ab 2201 gehören zu Band 3)
  $rows += [pscustomobject]@{
    n       = [int]$h.InnerText
    kanji   = $c.SelectSingleNode("literal").InnerText
    strokes = [int]$c.SelectSingleNode("misc/stroke_count").InnerText
    on      = (@($c.SelectNodes("reading_meaning/rmgroup/reading[@r_type='ja_on']") | ForEach-Object { $_.InnerText }) -join "、")
    kun     = (@($c.SelectNodes("reading_meaning/rmgroup/reading[@r_type='ja_kun']") | Select-Object -First 4 | ForEach-Object { $_.InnerText }) -join "、")
    en      = (@($c.SelectNodes("reading_meaning/rmgroup/meaning[not(@m_lang)]") | Select-Object -First 3 | ForEach-Object { $_.InnerText }) -join ", ")
  }
}
$rows = $rows | Sort-Object n
$js = { param($s) '"' + ($s -replace '\\', '\\' -replace '"', '\"') + '"' }

$lines = $rows | ForEach-Object { "  [{0}, {1}, {2}, {3}, {4}, {5}]," -f $_.n, (& $js $_.kanji), $_.strokes, (& $js $_.on), (& $js $_.kun), (& $js $_.en) }
$header = @"
// Kanji in der Reihenfolge von J. W. Heisig, „Die Kanji lernen und behalten“ (Nummerierung der
// 6. Auflage, 2200 Zeichen). Automatisch erzeugt mit tools/build-kanji.ps1 – nicht von Hand bearbeiten.
// Felder: [Rahmen, Kanji, Strichzahl, On-Lesungen, Kun-Lesungen, englische Bedeutung]
// Quelle: KANJIDIC2, © Electronic Dictionary Research and Development Group, Lizenz CC BY-SA 4.0
// (https://www.edrdg.org/edrdg/licence.html). Die Schlüsselwörter aus Heisigs Buch sind nicht enthalten.
"@
[IO.File]::WriteAllText((Join-Path $root "data\kanji.js"), "$header`nconst KANJI_DATA = [`n$($lines -join "`n")`n];`n", $utf8)
"{0} Kanji mit Heisig-Nummer (höchste: {1})" -f $rows.Count, $rows[-1].n

# ---------- KanjiVG: Strichpfade ----------
$zip = [IO.Compression.ZipFile]::OpenRead($KanjiVG)
$entries = @{}
foreach ($e in $zip.Entries) { if ($e.FullName -match '^kanji/([0-9a-f]{5})\.svg$') { $entries[$Matches[1]] = $e } }
$outDir = Join-Path $root "data\strokes"
New-Item -ItemType Directory -Force $outDir | Out-Null
Get-ChildItem $outDir -Filter *.js | Remove-Item
$missing = @()
for ($start = 1; $start -le $rows[-1].n; $start += 200) {
  $end = $start + 199
  $chunk = $rows | Where-Object { $_.n -ge $start -and $_.n -le $end }
  $items = foreach ($r in $chunk) {
    $hex = "{0:x5}" -f [int][char]$r.kanji
    if (-not $entries.ContainsKey($hex)) { $missing += $r.kanji; continue }
    $sr = New-Object IO.StreamReader($entries[$hex].Open()); $svg = $sr.ReadToEnd(); $sr.Close()
    $paths = [regex]::Matches($svg, '<path [^>]*\sd="([^"]+)"') | ForEach-Object { '"' + $_.Groups[1].Value + '"' }
    '  "{0}": [{1}],' -f $r.kanji, ($paths -join ",")
  }
  $name = "{0:d4}-{1:d4}.js" -f $start, $end
  $content = @"
// Strichfolge der Heisig-Rahmen $start–$end (SVG-Pfade, viewBox 0 0 109 109, in Schreibreihenfolge).
// Quelle: KanjiVG, © Ulrich Apel, Lizenz CC BY-SA 3.0 (https://kanjivg.tagaini.net). Erzeugt mit tools/build-kanji.ps1.
KanjiStrokes.add({
$($items -join "`n")
});
"@
  [IO.File]::WriteAllText((Join-Path $outDir $name), $content + "`n", $utf8)
}
$zip.Dispose()
"Strichfolgen geschrieben; ohne KanjiVG-Daten: " + ($(if ($missing.Count) { $missing -join " " } else { "keine" }))
