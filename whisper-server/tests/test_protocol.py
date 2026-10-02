"""
Whisper サーバープロトコルの契約テスト（外部依存なし）

実行:
    cd whisper-server && uv run python -m pytest tests/test_protocol.py
    # または: uv run python tests/test_protocol.py

このテストは実際に faster-whisper をロードしない。
handle_transcribe_chunk を websocket.send だけスタブに差し替えて、
「クライアントが送った chunkNumber が応答にそのまま返る」ことを保証する。

D0 で直した mis-attribution の再発防止が目的。
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

# src/ を import できるようにする
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from whisper_server.server import WebSocketHandler  # noqa: E402


class FakeWebSocket:
    """send されたメッセージを蓄えるだけの最小 WebSocket スタブ"""

    def __init__(self) -> None:
        self.sent: List[Dict[str, Any]] = []

    async def send(self, payload: str) -> None:
        self.sent.append(json.loads(payload))

    def messages_of(self, type_: str) -> List[Dict[str, Any]]:
        return [m for m in self.sent if m.get("type") == type_]


class StubTranscriber:
    """transcribe_chunk が即座に predetermined な結果を返すスタブ"""

    def __init__(self, has_result: bool = True) -> None:
        self.has_result = has_result
        self.calls = 0

    async def transcribe_chunk(self, audio_data: bytes, language: str) -> Any:
        self.calls += 1
        if not self.has_result:
            return None
        return FakeResult()


class FakeResult:
    def to_dict(self) -> Dict[str, Any]:
        return {
            "language": "ja",
            "duration": 4.096,
            "segments": [{"start": 0.0, "end": 1.0, "text": "テスト"}],
            "created_at": 0,
            "segment_count": 1,
        }


def make_handler(transcriber: Any) -> WebSocketHandler:
    handler = WebSocketHandler.__new__(WebSocketHandler)  # __init__ は重いのでスキップ
    handler.transcriber = transcriber
    handler.current_model = "small"
    handler.clients = set()
    return handler


def base64_audio() -> str:
    import base64

    return base64.b64encode(b"\x00\x01\x02" * 100).decode("ascii")


def test_chunk_result_echoes_chunk_number() -> None:
    """chunk_result が chunkNumber を返す（返さないとクライアントは推測になる）"""
    ws = FakeWebSocket()
    handler = make_handler(StubTranscriber())

    data = {
        "type": "transcribe_chunk",
        "audio_data": base64_audio(),
        "language": "ja",
        "chunkNumber": 42,
        "timestamp": 1234567890,
    }
    asyncio.run(handler.handle_transcribe_chunk(ws, data))

    results = ws.messages_of("chunk_result")
    assert len(results) == 1, f"chunk_result が1件だけ返る: {ws.sent}"
    assert results[0]["chunkNumber"] == 42
    assert results[0]["timestamp"] == 1234567890
    assert results[0]["status"] == "completed"


def test_chunk_progress_echoes_chunk_number() -> None:
    """進捗通知にも chunkNumber が含まれる"""
    ws = FakeWebSocket()
    handler = make_handler(StubTranscriber())

    data = {
        "type": "transcribe_chunk",
        "audio_data": base64_audio(),
        "language": "ja",
        "chunkNumber": 7,
        "timestamp": 999,
    }
    asyncio.run(handler.handle_transcribe_chunk(ws, data))

    progress = ws.messages_of("chunk_progress")
    assert len(progress) == 1
    assert progress[0]["chunkNumber"] == 7


def test_failed_result_also_carries_chunk_number() -> None:
    """失敗応答でも chunkNumber を返す（不然ならUI上で失敗が紐付かない）"""
    ws = FakeWebSocket()
    handler = make_handler(StubTranscriber(has_result=False))

    data = {
        "type": "transcribe_chunk",
        "audio_data": base64_audio(),
        "language": "ja",
        "chunkNumber": 5,
        "timestamp": 111,
    }
    asyncio.run(handler.handle_transcribe_chunk(ws, data))

    results = ws.messages_of("chunk_result")
    assert len(results) == 1
    assert results[0]["status"] == "failed"
    assert results[0]["chunkNumber"] == 5


def test_exception_path_carries_chunk_number() -> None:
    """例外時も chunkNumber を含む（握り潰さない）"""

    class ExplodingTranscriber:
        async def transcribe_chunk(self, audio_data: bytes, language: str) -> Any:
            raise RuntimeError("boom")

    ws = FakeWebSocket()
    handler = make_handler(ExplodingTranscriber())

    data = {
        "type": "transcribe_chunk",
        "audio_data": base64_audio(),
        "language": "ja",
        "chunkNumber": 13,
        "timestamp": 222,
    }
    asyncio.run(handler.handle_transcribe_chunk(ws, data))

    results = ws.messages_of("chunk_result")
    assert len(results) == 1
    assert results[0]["status"] == "failed"
    assert results[0]["chunkNumber"] == 13
    assert "boom" in results[0]["message"]


def test_missing_audio_data_error_carries_chunk_number() -> None:
    """audio_data 欠落時の error も chunkNumber を返す"""
    ws = FakeWebSocket()
    handler = make_handler(StubTranscriber())

    data = {"type": "transcribe_chunk", "chunkNumber": 21}
    asyncio.run(handler.handle_transcribe_chunk(ws, data))

    errors = ws.messages_of("error")
    assert len(errors) == 1
    assert errors[0]["chunkNumber"] == 21


def test_responses_are_in_order() -> None:
    """progress → result の順で返る（クライアントの前提）"""
    ws = FakeWebSocket()
    handler = make_handler(StubTranscriber())

    data = {
        "type": "transcribe_chunk",
        "audio_data": base64_audio(),
        "language": "ja",
        "chunkNumber": 1,
        "timestamp": 1,
    }
    asyncio.run(handler.handle_transcribe_chunk(ws, data))

    types = [m["type"] for m in ws.sent]
    assert types == ["chunk_progress", "chunk_result"]


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as exc:
                failures += 1
                print(f"FAIL {name}: {exc}")
    raise SystemExit(1 if failures else 0)
