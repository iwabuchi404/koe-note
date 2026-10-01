"""
PyInstaller用のビルド設定ファイル
whisper-serverを単一実行ファイルに変換
"""

import os
from pathlib import Path

# プロジェクトのルートディレクトリ
project_root = Path(__file__).parent

# PyInstallerの設定
a = Analysis(
    ['main.py'],
    pathex=[str(project_root)],
    binaries=[],
    datas=[
        # 設定ファイルやリソースファイルがあれば追加
        # ('src/whisper_server', 'whisper_server'),
    ],
    hiddenimports=[
        'faster_whisper',
        'websockets',
        'numpy',
        'asyncio_mqtt',
        'whisper_server',
        'whisper_server.server',
        'whisper_server.transcriber',
        'whisper_server.config',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='whisper-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,  # アイコンファイルがあれば指定
)
