# Erzeugt data/werkstatt/jmdict-de.js: deutsche Bedeutungen aus JMdict für die Werkstatt
# (Vorschläge beim Aufbereiten neuer Geschichten; die App selbst lädt diese Datei nicht).
# Quelle: JMdict, © Electronic Dictionary Research and Development Group (EDRDG), Lizenz CC BY-SA 4.0
#   https://www.edrdg.org/jmdict/j_jmdict.html  –  Datei JMdict.gz (alle Sprachen)
# Aufruf: powershell -File tools/build-jmdict-de.ps1 -JMdict <Pfad zu JMdict.gz>
param([Parameter(Mandatory)][string]$JMdict)

$root = Split-Path $PSScriptRoot -Parent
Add-Type -AssemblyName System.Xml

$fs = [IO.File]::OpenRead($JMdict)
$gz = New-Object IO.Compression.GZipStream($fs, [IO.Compression.CompressionMode]::Decompress)
$settings = New-Object Xml.XmlReaderSettings
$settings.DtdProcessing = [Xml.DtdProcessing]::Parse   # internes DTD (Entitäten wie &n;), keine externen Zugriffe
$settings.XmlResolver = $null
$settings.MaxCharactersFromEntities = 0
$reader = [Xml.XmlReader]::Create($gz, $settings)

# Schlüssel (Kanji- oder Kana-Schreibweise) → [Bedeutung, Priorität]
$out = @{}
$entries = 0; $withGer = 0
while ($reader.ReadToFollowing("entry")) {
  $entries++
  $x = [xml]$reader.ReadOuterXml()
  $e = $x.entry
  $ger = @()
  foreach ($sense in @($e.sense)) {
    $g = @($sense.gloss | Where-Object { $_ -is [Xml.XmlElement] -and $_.GetAttribute("xml:lang") -eq "ger" } | ForEach-Object { $_.InnerText })
    if ($g.Count) { $ger += ($g | Select-Object -First 3) -join ", " }
    if ($ger.Count -ge 3) { break }
  }
  if (-not $ger.Count) { continue }
  $withGer++
  $gloss = ($ger | Select-Object -Unique) -join "; "
  if ($gloss.Length -gt 80) { $gloss = $gloss.Substring(0, 77).TrimEnd(" ,;") + " …" }
  # Häufige Wörter (Markierungen news1, ichi1, spec1, gai1) haben bei gleicher Schreibweise Vorrang
  $prio = [int](@($e.k_ele.ke_pri) + @($e.r_ele.re_pri) | Where-Object { $_ -match '^(news1|ichi1|spec1|gai1)$' } | Measure-Object).Count -gt 0
  $kebs = @($e.k_ele | ForEach-Object { $_.keb } | Where-Object { $_ })
  # Kana-Schreibweise nur, wenn das Wort keine Kanji-Form hat oder meist in Kana geschrieben wird (uk)
  $uk = @($e.sense | ForEach-Object { $_.misc }) -match 'usually written using kana'
  $rebs = if (-not $kebs.Count -or $uk) { @($e.r_ele | ForEach-Object { $_.reb } | Where-Object { $_ }) } else { @() }
  foreach ($k in $kebs + $rebs) {
    if (-not $out.ContainsKey($k) -or ($prio -and -not $out[$k][1])) { $out[$k] = @($gloss, $prio) }
  }
}
$reader.Close(); $fs.Close()

$esc = { param($s) '"' + ($s -replace '\\', '\\' -replace '"', '\"') + '"' }
$lines = $out.Keys | Sort-Object | ForEach-Object { "{0}:{1}," -f (& $esc $_), (& $esc $out[$_][0]) }
$header = @"
// Deutsche Bedeutungen aus JMdict – nur für die Werkstatt (Vorschläge beim Aufbereiten neuer Geschichten).
// Automatisch erzeugt mit tools/build-jmdict-de.ps1 – nicht von Hand bearbeiten.
// Quelle: JMdict, © Electronic Dictionary Research and Development Group (EDRDG), Lizenz CC BY-SA 4.0
// (https://www.edrdg.org/edrdg/licence.html). Schlüssel: Kanji- oder Kana-Schreibweise.
"@
$dir = Join-Path $root "data\werkstatt"
New-Item -ItemType Directory -Force $dir | Out-Null
[IO.File]::WriteAllText((Join-Path $dir "jmdict-de.js"), "$header`nconst JMDICT_DE = {`n$($lines -join "`n")`n};`n", (New-Object Text.UTF8Encoding $false))
"{0} Einträge gelesen, {1} mit deutscher Bedeutung, {2} Schlüssel" -f $entries, $withGer, $out.Count
