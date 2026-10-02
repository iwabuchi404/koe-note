# -*- mode: python ; coding: utf-8 -*-

# モデルカタログ（src/shared/models.json）を同梱する。
# Python 側と Electron 側が同じ定義を読むことで、
# 「UIに表示されるモデル」と「サーバーが受け付けるモデル」の
# 不一致を防ぐ。src/shared が正なので、ここではコピー元を指定するだけ。
from pathlib import Path
import sys

# SPECPATH は spec ファイルのあるディレクトリ
_server_dir = Path(SPECPATH).resolve()
_repo_root = _server_dir.parent
_catalog = _repo_root / 'src' / 'shared' / 'models.json'

print(f'[spec] server dir : {_server_dir}')
print(f'[spec] repo root  : {_repo_root}')
print(f'[spec] catalog    : {_catalog} (exists={_catalog.is_file()})')

if not _catalog.is_file():
    raise SystemExit(f'model catalog not found: {_catalog}')

_src = _server_dir / 'src'
print(f'[spec] src path   : {_src} (exists={_src.is_dir()})')

block_cipher = None

a = Analysis(
    ['main.py'],
    # main.py は `from whisper_server.server import ...` で src/ 配下の
    # パッケージをimportする。pathex に src を入れないとビルドは通るが
    # 実行時に ModuleNotFoundError になる。
    pathex=[str(_src)],
    binaries=[],
    datas=[(str(_catalog), '.')],
    hiddenimports=[
        'faster_whisper',
        'websockets',
        'numpy',
        'asyncio_mqtt',
        'whisper_server',
        'whisper_server.server',
        'whisper_server.transcriber',
        'whisper_server.config',
        'whisper_server.model_catalog',
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