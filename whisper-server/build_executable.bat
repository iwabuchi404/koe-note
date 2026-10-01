@echo off
echo Building Whisper Server executable...

REM モデルカタログ（src/shared/models.json）はPython側の実装とTS側が共有する。
REM spec の datas で同梱されるので、ここではコピー不要。

REM UV環境でPyInstallerを実行
uv run pyinstaller whisper-server.spec

REM 実行ファイルをdistディレクトリにコピー
if exist "dist\whisper-server.exe" (
    copy "dist\whisper-server.exe" "whisper-server.exe"
    echo Build completed successfully!
    echo Executable created: whisper-server.exe
) else (
    echo Build failed!
    exit /b 1
)

pause

