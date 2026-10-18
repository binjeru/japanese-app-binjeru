# Erzeugt Sprachaufnahmen für eine Geschichte mit VOICEVOX: eine MP3-Datei pro Satz.
# Voraussetzungen: VOICEVOX läuft (Engine auf http://127.0.0.1:50021), ffmpeg ist installiert.
# Aufruf:  powershell -ExecutionPolicy Bypass -File tools/build-audio.ps1 -Story momotaro [-Speaker 118] [-Force]
# Ergebnis: data/audio/<id>/<szene>-<satz>.mp3 (wie die Satz-IDs, ab 1) und manifest.json (Text je Datei;
# geänderte Sätze werden beim nächsten Lauf neu erzeugt, unveränderte übersprungen).
# Standardstimme 118 = 夜語トバリ (ノーマル). Nutzung nur mit Nennung „VOICEVOX:夜語トバリ“.
#
# Aussprache: VOICEVOX liest den normalen Text selbst. Wo es danebenliegt, im Wörterbuch des Wortes
# tts: "かな" eintragen – dann bekommt VOICEVOX an dieser Stelle die Kana-Schreibweise. Für einen einzelnen
# Satz (z. B. eine falsch gelesene Partikel) geht es auch im Satz selbst: { jp: …, de: …, tts: "ganzer Satz" }.
# Das Skript vergleicht außerdem VOICEVOX' Lesung mit den Lesungen im Wörterbuch und listet Abweichungen.
param(
  [Parameter(Mandatory)][string]$Story,
  [int]$Speaker = 118,
  [string]$Engine = "http://127.0.0.1:50021",
  [switch]$Force
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$storyFile = Join-Path $root "data\stories\$Story.js"
if (-not (Test-Path $storyFile)) { throw "Geschichte nicht gefunden: $storyFile" }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw "ffmpeg nicht gefunden" }
try { $null = Invoke-RestMethod "$Engine/version" -TimeoutSec 5 } catch { throw "VOICEVOX-Engine nicht erreichbar ($Engine) – ist VOICEVOX gestartet?" }

# ---------- Wörterbuch (gemeinsam + Geschichte): Lesung r, Aussprache say, Text für VOICEVOX tts ----------
$dict = @{}
function Read-Dict([string]$file) {
  foreach ($line in [IO.File]::ReadAllLines($file, [Text.Encoding]::UTF8)) {
    if ($line -match '^\s*"([^"]+)"\s*:\s*\{(.*)\}\s*,?\s*$') {
      $key = $matches[1]; $body = $matches[2]; $e = @{}
      foreach ($m in [regex]::Matches($body, '\b(r|say|tts|base)\s*:\s*"((?:[^"\\]|\\.)*)"')) { $e[$m.Groups[1].Value] = $m.Groups[2].Value }
      if (-not $dict.ContainsKey($key)) { $dict[$key] = $e }   # wie in der App: vorhandene Einträge haben Vorrang
    }
  }
}
Read-Dict (Join-Path $root "data\dictionary.js")
Read-Dict $storyFile

# ---------- Sätze in Reihenfolge ----------
$sentences = @()
$scene = 0; $n = 0
foreach ($line in [IO.File]::ReadAllLines($storyFile, [Text.Encoding]::UTF8)) {
  if ($line -match '^\s*title:\s*"') { $scene++; $n = 0; continue }
  if ($line -match '^\s*\{\s*jp:\s*"((?:[^"\\]|\\.)*)"') {
    $n++
    $tok = $matches[1] -split '\|'
    # Satzweise Aussprache-Korrektur: { jp: …, de: …, tts: "…" }
    $stts = if ($line -match '\btts:\s*"((?:[^"\\]|\\.)*)"') { $matches[1] } else { $null }
    $sentences += [pscustomobject]@{ id = "$scene-$n"; tokens = $tok; tts = $stts }
  }
}
if (-not $sentences.Count) { throw "Keine Sätze gefunden" }

# ---------- Hilfen ----------
function To-Hira([string]$s) { -join ($s.ToCharArray() | ForEach-Object { if ($_ -ge [char]0x30A1 -and $_ -le [char]0x30F6) { [char]([int]$_ - 0x60) } else { $_ } }) }
# Für den Lesungsvergleich: Langvokale und Partikel-Schreibweisen vereinheitlichen
function Norm([string]$s) {
  $s = (To-Hira $s) -replace '[ー\s、。「」『』！？!?…―・（）()]', ''
  $s = $s -replace 'こんばんは', 'こんばんわ' -replace 'こんにちは', 'こんにちわ'
  $s = $s -replace 'を', 'お' -replace 'ゐ', 'い' -replace 'ゑ', 'え' -replace 'ぢ', 'じ' -replace 'づ', 'ず'
  # Langvokale: VOICEVOX schreibt sie als Vokal-Mora (ろお), das Wörterbuch meist mit う/い (ろう, せい)
  $s = [regex]::Replace($s, '([おこそとのほもよろごぞどぼぽょぉ])[うお]', '$1')
  $s = [regex]::Replace($s, '([えけせてねへめれげぜでべぺぇ])[いえ]', '$1')
  $s = [regex]::Replace($s, '([あかさたなはまやらわがざだばぱゃぁ])あ', '$1')
  $s = [regex]::Replace($s, '([いきしちにひみりぎじびぴぃ])い', '$1')
  $s = [regex]::Replace($s, '([うくすつぬふむゆるぐずぶぷゅぅ])う', '$1')
  return $s
}
$hasKanji = { param($t) $t -match '[㐀-鿿々〆ヶ]' }
function Get-Utf8([Microsoft.PowerShell.Commands.WebResponseObject]$r) { [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) }

$outDir = Join-Path $root "data\audio\$Story"
New-Item -ItemType Directory -Force $outDir | Out-Null
$manifestFile = Join-Path $outDir "manifest.json"
$manifest = @{}
if ((Test-Path $manifestFile) -and -not $Force) {
  $old = [IO.File]::ReadAllText($manifestFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
  foreach ($p in $old.PSObject.Properties) { $manifest[$p.Name] = $p.Value }
}
$tmp = Join-Path ([IO.Path]::GetTempPath()) "binjeru-audio.wav"
$made = 0; $skipped = 0; $warn = @()

foreach ($s in $sentences) {
  $text = -join $s.tokens
  # Text für VOICEVOX: tts-Ersetzungen aus dem Wörterbuch
  $ttsText = if ($s.tts) { $s.tts } else { -join ($s.tokens | ForEach-Object { if ($dict[$_] -and $dict[$_].tts) { $dict[$_].tts } else { $_ } }) }
  $mp3 = Join-Path $outDir "$($s.id).mp3"
  $fresh = (Test-Path $mp3) -and $manifest[$s.id] -eq $ttsText

  # Die Lesung wird immer geprüft (geht schnell), erzeugt wird nur, was neu oder geändert ist
  $q = Invoke-WebRequest -UseBasicParsing -Method Post "$Engine/audio_query?speaker=$Speaker&text=$([Uri]::EscapeDataString($ttsText))"
  $query = (Get-Utf8 $q) | ConvertFrom-Json
  $query.prePhonemeLength = 0.12
  $query.postPhonemeLength = 0.25
  $query.outputSamplingRate = 24000

  # Lesung von VOICEVOX mit der Lesung laut Wörterbuch vergleichen
  $vvReading = -join ($query.accent_phrases | ForEach-Object { $_.moras | ForEach-Object { $_.text } })
  $ours = -join ($s.tokens | ForEach-Object {
    $e = $dict[$_]
    if ($e -and $e.tts) { $e.tts } elseif ($e -and $e.say) { $e.say } elseif ($e -and $e.r) { $e.r } elseif ($e -and $e.base -and (& $hasKanji $_)) { "?" } else { $_ }
  })
  if ((Norm $vvReading) -ne (Norm $ours) -and $ours -notmatch '\?') { $warn += "  $($s.id)  $text`n        VOICEVOX: $(To-Hira $vvReading)`n        Wörterbuch: $ours" }
  if ($fresh) { $skipped++; continue }

  $body = [Text.Encoding]::UTF8.GetBytes(($query | ConvertTo-Json -Depth 20 -Compress))
  Invoke-WebRequest -UseBasicParsing -Method Post "$Engine/synthesis?speaker=$Speaker" -Body $body -ContentType "application/json" -OutFile $tmp
  & ffmpeg -hide_banner -loglevel error -y -i $tmp -ac 1 -ar 24000 -codec:a libmp3lame -b:a 48k $mp3
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg-Fehler bei $($s.id)" }
  $manifest[$s.id] = $ttsText
  $made++
  Write-Host "  $($s.id)  $text"
}
Remove-Item $tmp -ErrorAction SilentlyContinue

# Manifest sortiert schreiben
$ordered = [ordered]@{}
foreach ($s in $sentences) { if ($manifest[$s.id]) { $ordered[$s.id] = $manifest[$s.id] } }
[IO.File]::WriteAllText($manifestFile, ($ordered | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))

$size = (Get-ChildItem $outDir -Filter *.mp3 | Measure-Object Length -Sum).Sum
"{0}: {1} Sätze, {2} neu erzeugt, {3} unverändert, zusammen {4:N1} MB" -f $Story, $sentences.Count, $made, $skipped, ($size / 1MB)
if ($warn.Count) { "`nMögliche Lesefehler (bitte anhören; bei Bedarf tts: ""かな"" im Wörterbuch eintragen):"; $warn }
