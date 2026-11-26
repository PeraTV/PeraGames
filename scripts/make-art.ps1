Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$assetDir = Join-Path $root 'src/assets'
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
function Color([string] $hex) { [Drawing.ColorTranslator]::FromHtml($hex) }
function Brush([string] $hex) { [Drawing.SolidBrush]::new((Color $hex)) }

$logo = [Drawing.Bitmap]::new(256, 256, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [Drawing.Graphics]::FromImage($logo)
$g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$pear = [Drawing.Drawing2D.GraphicsPath]::new()
$pear.StartFigure()
$pear.AddBezier(122, 68, 89, 55, 81, 88, 71, 112)
$pear.AddBezier(71, 112, 37, 149, 35, 203, 84, 224)
$pear.AddBezier(84, 224, 133, 247, 204, 230, 213, 186)
$pear.AddBezier(213, 186, 220, 151, 194, 122, 181, 104)
$pear.AddBezier(181, 104, 168, 84, 156, 61, 122, 68)
$pear.CloseFigure()
$gold = [Drawing.Drawing2D.LinearGradientBrush]::new([Drawing.Rectangle]::new(37, 65, 180, 171), (Color '#ffe2a1'), (Color '#ed9049'), 62)
$g.FillPath($gold, $pear)
$leaf = [Drawing.Drawing2D.GraphicsPath]::new()
$leaf.AddBezier(132, 66, 137, 30, 168, 13, 201, 21)
$leaf.AddBezier(201, 21, 188, 54, 167, 62, 132, 66)
$leaf.CloseFigure()
$g.FillPath((Brush '#ffd282'), $leaf)
[Drawing.Point[]] $play = @([Drawing.Point]::new(111, 113), [Drawing.Point]::new(163, 148), [Drawing.Point]::new(111, 184))
$g.FillPolygon((Brush '#392234'), $play)
$logo.Save((Join-Path $assetDir 'pera.png'), [Drawing.Imaging.ImageFormat]::Png)

$png = [IO.File]::ReadAllBytes((Join-Path $assetDir 'pera.png'))
$ico = [IO.BinaryWriter]::new([IO.File]::Create((Join-Path $assetDir 'peragames.ico')))
try {
    $ico.Write([uint16]0); $ico.Write([uint16]1); $ico.Write([uint16]1)
    $ico.Write([byte]0); $ico.Write([byte]0); $ico.Write([byte]0); $ico.Write([byte]0)
    $ico.Write([uint16]1); $ico.Write([uint16]32)
    $ico.Write([uint32]$png.Length); $ico.Write([uint32]22)
    $ico.Write($png)
} finally { $ico.Dispose() }
$g.Dispose()
$logo.Dispose()

$w = 1536
$h = 600
$city = [Drawing.Bitmap]::new($w, $h)
$g = [Drawing.Graphics]::FromImage($city)
$g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$sky = [Drawing.Drawing2D.LinearGradientBrush]::new([Drawing.Rectangle]::new(0, 0, $w, $h), (Color '#281639'), (Color '#cf6145'), 78)
$g.FillRectangle($sky, 0, 0, $w, $h)
$random = [Random]::new(748)
$sun = [Drawing.Drawing2D.LinearGradientBrush]::new([Drawing.Rectangle]::new(976, 92, 256, 265), (Color '#ffdd9c'), (Color '#f37d64'), 90)
$g.FillEllipse($sun, 976, 92, 256, 256)
for ($layer = 0; $layer -lt 3; $layer++) {
    $step = 24 + $layer * 17
    for ($x = -12; $x -lt $w; $x += $step) {
        $roof = 413 - $layer * 21 - $random.Next(32, 118 + 26 * $layer)
        $width = $step - $random.Next(2, 8)
        $building = Brush (@('#734157', '#493049', '#211a30')[$layer])
        $g.FillRectangle($building, $x, $roof, $width, $h - $roof)
        $g.FillRectangle($building, $x + 3, $roof - $random.Next(3, 27), [Math]::Max(3, $width - 9), 30)
        if ($layer -ge 1) {
            for ($floor = $roof + 10; $floor -lt 540; $floor += 10 + $layer * 3) {
                for ($column = $x + 5; $column -lt $x + $width - 4; $column += 7 + $layer * 2) {
                    if ($random.NextDouble() -lt 0.29) {
                        $light = Brush (@('#ba6260', '#dca76e', '#805a8c', '#6c879d')[$random.Next(4)])
                        $g.FillRectangle($light, $column, $floor, 3 + $layer, 2)
                        $light.Dispose()
                    }
                }
            }
        }
        $building.Dispose()
    }
}
$street = [Drawing.Drawing2D.LinearGradientBrush]::new([Drawing.Rectangle]::new(0, 477, $w, 123), (Color '#251929'), (Color '#130f1b'), 90)
$g.FillRectangle($street, 0, 488, $w, 112)
for ($i = 0; $i -lt 85; $i++) {
    $y = $random.Next(488, 600)
    $x = $random.Next(0, $w)
    $light = Brush (@('#694053', '#94506b', '#ad6c60', '#6a4a66')[$random.Next(4)])
    $g.FillRectangle($light, $x, $y, $random.Next(8, 18 + ($y - 488)), 1)
    $light.Dispose()
}
$city.Save((Join-Path $assetDir 'night-city.jpg'), [Drawing.Imaging.ImageFormat]::Jpeg)
$g.Dispose()
$city.Dispose()
