# -*- mode: python ; coding: utf-8 -*-

# モデルカタログ（src/shared/models.json）を同梱する。
# Python 側と Electron 側が同じ定義を読むことで、
# 「UIに表示されるモデル」と「サーバーが受け付けるモデル」の
# 不一致を防ぐ。src/shared が正なので、ここではコピー元を指定するだけ。
from pathlib import Path

_repo_root = Path(SPEC).resolve().parent.parent
_catalog = _repo_root / 'src' / 'shared' / 'models.json'

if not _catalog.is_file():
    raise SystemExit(f'model catalog not found: {_catalog}')

block_cipher = None

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[(str(_catalog), '.')],
    hiddenimports=[
        'faster_whisper',
        'websockets',
        'numpy',
        'asyncio_mqtt',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='whisper-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='whisper-server',
)