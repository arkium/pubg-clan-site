Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("D:\Sources\pubg-clan-site\public\pubg-icon.png")
$newSize = New-Object System.Drawing.Size(400, ($img.Height / ($img.Width / 400)))
$newImg = New-Object System.Drawing.Bitmap($img, $newSize)
$newImg.Save("D:\Sources\pubg-clan-site\public\pubg-icon-small.png", [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose()
$newImg.Dispose()
