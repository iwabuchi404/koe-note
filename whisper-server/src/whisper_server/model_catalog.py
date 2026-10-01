"""
モデルカタログの読み込み。

定義の正は src/shared/models.json（TypeScript 側と同じ1枚）。
Electron（main / renderer）と Python が同じ定義を読むことで、
「UIに表示されるモデル」と「サーバーが受け付けるモデル」が
食い違わないようにする。

以前は Python 側に MODEL_SIZES という許可リストがあり、
TS 側がダウンロード可能な7モデルのうち4つを受け付けない状態だった
（renderer のデフォルト値 kotoba-whisper-v2.0-faster も拒否される）。
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

CATALOG_FILENAME = "models.json"


@dataclass(frozen=True)
class CatalogEntry:
    """モデルカタログの1項目"""

    id: str
    server_model_name: str
    hugging_face_repo: str
    name: str
    description: str
    size_bytes: int
    files: List[str]
    license: str
    license_url: str
    recommended: bool = False

    @property
    def cache_folder(self) -> str:
        """HuggingFace キャッシュのフォルダ名"""
        return "models--" + self.hugging_face_repo.replace("/", "--")


def _candidate_paths() -> List[Path]:
    """
    カタログJSONの探索候補。

    1. PyInstaller onefile: sys._MEIPASS 配下
    2. 実行ファイル / スクリプトの隣（electron-builder の extraResources で
       dist/models.json として同梱する）
    3. 開発時のリポジトリルート
    """
    candidates: List[Path] = []

    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(Path(meipass) / CATALOG_FILENAME)

    candidates.append(Path(sys.executable).parent / CATALOG_FILENAME)
    candidates.append(Path(__file__).parent / CATALOG_FILENAME)

    # 開発時: whisper-server/src/whisper_server/ → リポジトリルート
    repo_root = Path(__file__).resolve().parents[3]
    candidates.append(repo_root / "src" / "shared" / CATALOG_FILENAME)

    return candidates


def _parse(entries: List[dict]) -> List[CatalogEntry]:
    return [
        CatalogEntry(
            id=entry["id"],
            server_model_name=entry["serverModelName"],
            hugging_face_repo=entry["huggingFaceRepo"],
            name=entry["name"],
            description=entry["description"],
            size_bytes=int(entry["sizeBytes"]),
            files=list(entry["files"]),
            license=entry["license"],
            license_url=entry["licenseUrl"],
            recommended=bool(entry.get("recommended", False)),
        )
        for entry in entries
    ]


_catalog: Optional[List[CatalogEntry]] = None


def load_catalog() -> List[CatalogEntry]:
    """
    カタログを読み込む（最初の1回だけファイルを読む）。

    JSON が見つからない場合はカタログを空として扱い、
    呼び出し側が「サポート外モデル」として判定できるようにする。
    """
    global _catalog
    if _catalog is not None:
        return _catalog

    for path in _candidate_paths():
        if not path.is_file():
            continue
        try:
            with path.open("r", encoding="utf-8") as handle:
                _catalog = _parse(json.load(handle))
                return _catalog
        except (OSError, json.JSONDecodeError, KeyError) as exc:
            print(f"[model_catalog] failed to load {path}: {exc}")

    print(
        f"[model_catalog] {CATALOG_FILENAME} not found; "
        "model switching will be disabled"
    )
    _catalog = []
    return _catalog


def supported_server_names() -> List[str]:
    """サーバーが受け付けるモデル名の一覧"""
    return [entry.server_model_name for entry in load_catalog()]


def find_by_server_name(server_model_name: str) -> Optional[CatalogEntry]:
    """サーバー名からカタログ項目を探す"""
    for entry in load_catalog():
        if entry.server_model_name == server_model_name:
            return entry
    return None


def describe(server_model_name: str) -> str:
    """モデルの説明文。未知のモデルなら既定文言"""
    entry = find_by_server_name(server_model_name)
    return entry.description if entry else "（未登録モデル）"


def size_label(server_model_name: str) -> str:
    """モデルのサイズ表記。未知のモデルなら 'Unknown'"""
    entry = find_by_server_name(server_model_name)
    if not entry:
        return "Unknown"
    if entry.size_bytes >= 1024 ** 3:
        return f"{entry.size_bytes / 1024 ** 3:.1f}GB"
    return f"{round(entry.size_bytes / 1024 ** 2)}MB"


def model_files_by_server_name(server_model_name: str) -> Dict[str, str]:
    """サーバー名 → 期待するファイル名の一覧"""
    entry = find_by_server_name(server_model_name)
    return {name: name for name in entry.files} if entry else {}
