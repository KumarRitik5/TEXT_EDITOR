param(
	[string]$OutDir = (Join-Path $PSScriptRoot "..\public")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath {
	param(
		[System.Drawing.RectangleF]$Rect,
		[single]$Radius
	)

	$path = New-Object System.Drawing.Drawing2D.GraphicsPath

	if ($Radius -le 0) {
		$path.AddRectangle($Rect)
		return $path
	}

	$diam = [single]($Radius * 2)
	$arc = New-Object System.Drawing.RectangleF($Rect.X, $Rect.Y, $diam, $diam)

	# Top-left
	$path.AddArc($arc, 180, 90)
	# Top-right
	$arc.X = $Rect.Right - $diam
	$path.AddArc($arc, 270, 90)
	# Bottom-right
	$arc.Y = $Rect.Bottom - $diam
	$path.AddArc($arc, 0, 90)
	# Bottom-left
	$arc.X = $Rect.X
	$path.AddArc($arc, 90, 90)

	$path.CloseFigure()
	return $path
}

function New-LogoBitmap {
	param(
		[int]$Size
	)

	$bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
	$g = [System.Drawing.Graphics]::FromImage($bmp)

	$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
	$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
	$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
	$g.Clear([System.Drawing.Color]::Transparent)

	$scale = $Size / 64.0
	function S([double]$v) { return [single]($v * $scale) }

	# Background tile (10,8,44,48) rx=12
	$tileRect = New-Object System.Drawing.RectangleF (S 10), (S 8), (S 44), (S 48)
	$tileRadius = (S 12)
	$tilePath = New-RoundedRectPath -Rect $tileRect -Radius $tileRadius

	# Gradient from (10,6) to (54,58)
	$gradStart = New-Object System.Drawing.PointF (S 10), (S 6)
	$gradEnd = New-Object System.Drawing.PointF (S 54), (S 58)
	$c1 = [System.Drawing.Color]::FromArgb(250, 0x5b, 0x8c, 0xff)
	$c2 = [System.Drawing.Color]::FromArgb(235, 0xff, 0x5b, 0x6a)
	$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($gradStart, $gradEnd, $c1, $c2)
	$g.FillPath($bgBrush, $tilePath)

	# Subtle highlight
	$hlBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
		(New-Object System.Drawing.PointF (S 12), (S 10)),
		(New-Object System.Drawing.PointF (S 54), (S 54)),
		([System.Drawing.Color]::FromArgb(30, 255, 255, 255)),
		([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
	)
	$g.FillPath($hlBrush, $tilePath)

	# Page
	$pageRect = New-Object System.Drawing.RectangleF (S 20), (S 18), (S 26), (S 30)
	$pageRadius = (S 4)
	$pagePath = New-RoundedRectPath -Rect $pageRect -Radius $pageRadius

	$shineStart = New-Object System.Drawing.PointF (S 18), (S 14)
	$shineEnd = New-Object System.Drawing.PointF (S 46), (S 50)
	$pageBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
		$shineStart,
		$shineEnd,
		([System.Drawing.Color]::FromArgb(235, 255, 255, 255)),
		([System.Drawing.Color]::FromArgb(185, 255, 255, 255))
	)
	$g.FillPath($pageBrush, $pagePath)

	# Folded corner
	$fold = New-Object System.Drawing.Drawing2D.GraphicsPath
	$fx = $pageRect.Right - (S 8)
	$fy = $pageRect.Y
	$fold.AddPolygon(@(
		(New-Object System.Drawing.PointF $fx $fy),
		(New-Object System.Drawing.PointF $pageRect.Right $fy),
		(New-Object System.Drawing.PointF $pageRect.Right ($fy + (S 8)))
	))
	$foldBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(140, 255, 255, 255))
	$g.FillPath($foldBrush, $fold)

	# Text lines
	$lineW = [single]([Math]::Max(1.0, 2.4 * $scale))
	$p1 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(115, 0x0d, 0x13, 0x24), $lineW)
	$p2 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(95, 0x0d, 0x13, 0x24), $lineW)
	$p3 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(75, 0x0d, 0x13, 0x24), $lineW)
	$p1.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
	$p1.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
	$p2.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
	$p2.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
	$p3.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
	$p3.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
	$g.DrawLine($p1, (S 24), (S 30), (S 40), (S 30))
	$g.DrawLine($p2, (S 24), (S 36), (S 38), (S 36))
	$g.DrawLine($p3, (S 24), (S 42), (S 34), (S 42))

	# Pen nib accent
	$nib = New-Object System.Drawing.Drawing2D.GraphicsPath
	$nib.AddPolygon(@(
		(New-Object System.Drawing.PointF (S 41.5) (S 40.5)),
		(New-Object System.Drawing.PointF (S 47.1) (S 46.1)),
		(New-Object System.Drawing.PointF (S 44.8) (S 48.4)),
		(New-Object System.Drawing.PointF (S 39.2) (S 42.8))
	))
	$nibBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(140, 0x0d, 0x13, 0x24))
	$g.FillPath($nibBrush, $nib)

	$nibStrokeW = [single]([Math]::Max(1.0, 1.8 * $scale))
	$nibPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(165, 255, 255, 255), $nibStrokeW)
	$nibPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
	$nibPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
	$g.DrawLine($nibPen, (S 42.8), (S 41.8), (S 45.8), (S 44.8))

	# Cleanup GDI objects (bitmap returned to caller)
	$bgBrush.Dispose()
	$hlBrush.Dispose()
	$tilePath.Dispose()
	$pageBrush.Dispose()
	$pagePath.Dispose()
	$foldBrush.Dispose()
	$fold.Dispose()
	$p1.Dispose(); $p2.Dispose(); $p3.Dispose()
	$nibBrush.Dispose()
	$nib.Dispose()
	$nibPen.Dispose()
	$g.Dispose()

	return $bmp
}

function Save-Png {
	param(
		[System.Drawing.Bitmap]$Bitmap,
		[string]$Path
	)

	$dir = Split-Path -Parent $Path
	if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
	$Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function New-IcoFromPngBitmaps {
	param(
		[System.Drawing.Bitmap[]]$Bitmaps,
		[string]$Path
	)

	$pngBytesList = @()
	foreach ($bmp in $Bitmaps) {
		$ms = New-Object System.IO.MemoryStream
		$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
		$pngBytesList += ,$ms.ToArray()
		$ms.Dispose()
	}

	$count = $pngBytesList.Count
	$headerSize = 6 + (16 * $count)

	$msOut = New-Object System.IO.MemoryStream
	$bw = New-Object System.IO.BinaryWriter($msOut)

	# ICONDIR
	$bw.Write([UInt16]0)   # reserved
	$bw.Write([UInt16]1)   # type: icon
	$bw.Write([UInt16]$count)

	$offset = $headerSize

	for ($i = 0; $i -lt $count; $i++) {
		$bmp = $Bitmaps[$i]
		$pngBytes = $pngBytesList[$i]

		$w = $bmp.Width
		$h = $bmp.Height

		# Width/height are stored as bytes; 0 means 256 (not used here)
		$bw.Write([byte]($w -band 0xFF))
		$bw.Write([byte]($h -band 0xFF))
		$bw.Write([byte]0)  # color count
		$bw.Write([byte]0)  # reserved
		$bw.Write([UInt16]1)   # planes
		$bw.Write([UInt16]32)  # bitcount
		$bw.Write([UInt32]$pngBytes.Length)
		$bw.Write([UInt32]$offset)

		$offset += $pngBytes.Length
	}

	# Image data
	for ($i = 0; $i -lt $count; $i++) {
		$bw.Write($pngBytesList[$i])
	}

	$bw.Flush()

	$dir = Split-Path -Parent $Path
	if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
	[System.IO.File]::WriteAllBytes($Path, $msOut.ToArray())

	$bw.Dispose()
	$msOut.Dispose()
}

if (-not (Test-Path $OutDir)) {
	New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$bmp180 = New-LogoBitmap -Size 180
$bmp48 = New-LogoBitmap -Size 48
$bmp32 = New-LogoBitmap -Size 32
$bmp16 = New-LogoBitmap -Size 16

try {
	Save-Png -Bitmap $bmp180 -Path (Join-Path $OutDir 'apple-touch-icon.png')
	Save-Png -Bitmap $bmp48 -Path (Join-Path $OutDir 'favicon-48x48.png')
	Save-Png -Bitmap $bmp32 -Path (Join-Path $OutDir 'favicon-32x32.png')
	Save-Png -Bitmap $bmp16 -Path (Join-Path $OutDir 'favicon-16x16.png')

	New-IcoFromPngBitmaps -Bitmaps @($bmp16, $bmp32, $bmp48) -Path (Join-Path $OutDir 'favicon.ico')
}
finally {
	$bmp180.Dispose()
	$bmp48.Dispose()
	$bmp32.Dispose()
	$bmp16.Dispose()
}

Write-Host "Generated icons in: $OutDir" -ForegroundColor Green
