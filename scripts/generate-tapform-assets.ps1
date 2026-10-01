Add-Type -AssemblyName System.Drawing

$outputDirectory = Join-Path $PSScriptRoot '..\assets'
$outputDirectory = [System.IO.Path]::GetFullPath($outputDirectory)

function New-TapFormBitmap([string]$path, [int]$size, [bool]$withBackground, [string]$backgroundHex = '#090A0A') {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  if ($withBackground) {
    $background = [System.Drawing.ColorTranslator]::FromHtml($backgroundHex)
    $graphics.Clear($background)
  }

  # Match assets/tapform-mark.svg and TapFormMark.tsx. The T stem plus two
  # structured field strokes is a compact tap-and-form monogram.
  $scale = $size / 48.0
  $stroke = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(242, 242, 240), 3.2 * $scale)
  $stroke.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $stroke.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $stroke.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $centerX = $size / 2.0
  $graphics.FillEllipse([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(242, 242, 240)), ($centerX - 2.5 * $scale), (7 * $scale - 2.5 * $scale), (5 * $scale), (5 * $scale))
  $graphics.DrawLine($stroke, 11 * $scale, 16 * $scale, 37 * $scale, 16 * $scale)
  $graphics.DrawLine($stroke, $centerX, 16 * $scale, $centerX, 42 * $scale)
  $graphics.DrawLine($stroke, 30 * $scale, 25 * $scale, 37 * $scale, 25 * $scale)
  $graphics.DrawLine($stroke, 30 * $scale, 33 * $scale, 37 * $scale, 33 * $scale)

  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $stroke.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-TapFormBitmap (Join-Path $outputDirectory 'icon.png') 1024 $true '#090A0A'
New-TapFormBitmap (Join-Path $outputDirectory 'android-icon-foreground.png') 1024 $false
New-TapFormBitmap (Join-Path $outputDirectory 'android-icon-monochrome.png') 1024 $false
New-TapFormBitmap (Join-Path $outputDirectory 'tapform-mark.png') 512 $false
New-TapFormBitmap (Join-Path $outputDirectory 'favicon.png') 128 $true '#090A0A'

$background = [System.Drawing.Bitmap]::new(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$backgroundGraphics = [System.Drawing.Graphics]::FromImage($background)
$backgroundGraphics.Clear([System.Drawing.Color]::FromArgb(11, 12, 12))
$background.Save((Join-Path $outputDirectory 'android-icon-background.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$backgroundGraphics.Dispose()
$background.Dispose()
