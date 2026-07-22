# IRLoco 作品集视频压缩脚本 v2
# 使用 Get-ChildItem 避免中文编码问题

$sourceDir = "c:\Users\lenovo\hexo-projects\My_Blog\my_resume\resume\video"
$destDir = "c:\Users\lenovo\hexo-projects\My_Blog\source\videos"

if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

$ffmpeg = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe"

# 训练视频 - 完整播放器，保持 1080p，保留音频
$fullVideo = "训练视频.mp4"

# 所有视频文件
$allVideos = Get-ChildItem -Path $sourceDir -Filter "*.mp4"

Write-Host "====== 开始压缩 ======" -ForegroundColor Cyan

foreach ($video in $allVideos) {
    $src = $video.FullName
    $dst = Join-Path $destDir $video.Name
    $isFullVideo = ($video.Name -eq $fullVideo)
    
    Write-Host "[$($video.Name)] 正在压缩..." -ForegroundColor Yellow
    
    if ($isFullVideo) {
        # 训练视频：1080p, CRF 23, 保留音频
        & $ffmpeg -y -i $src `
            -c:v libx264 `
            -vf "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease" `
            -crf 23 -preset medium `
            -c:a aac -b:a 128k `
            -movflags +faststart `
            $dst 2>&1 | Out-Null
    } else {
        # 自动循环视频：720p, CRF 28, 无音频
        & $ffmpeg -y -i $src `
            -c:v libx264 `
            -vf "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease" `
            -crf 28 -preset medium `
            -an `
            -movflags +faststart `
            $dst 2>&1 | Out-Null
    }
    
    if ($?) {
        $before = $video.Length
        $after = (Get-Item $dst).Length
        $ratio = [math]::Round(($after / $before) * 100, 1)
        Write-Host "  OK: $($video.Name): $([math]::Round($before/1MB,1))MB → $([math]::Round($after/1MB,1))MB (${ratio}%)" -ForegroundColor Green
    } else {
        Write-Host "  FAILED: $($video.Name)" -ForegroundColor Red
    }
}

Write-Host "`n====== 全部完成 ======" -ForegroundColor Green
Write-Host "压缩后文件位于: $destDir"
Get-ChildItem $destDir | Select-Object Name, @{N="SizeMB";E={[math]::Round($_.Length/1MB, 2)}} | Format-Table -AutoSize
