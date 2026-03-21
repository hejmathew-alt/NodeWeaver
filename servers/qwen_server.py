#!/usr/bin/env python3
"""
qwen_server.py — NodeWeaver local Qwen3-TTS server.

Usage:
    python qwen_server.py [PORT]   # default port 7862

Endpoints:
    GET  /health        → {"status": "ok"}
    POST /              → full WAV synthesis (returns raw WAV bytes)
    POST /stream        → streaming WAV synthesis (length-prefixed chunks)
    POST /timestamps    → CTC or Whisper word-level alignment

Request body for / and /stream:
    {
        "text": "...",
        "instruct": "...",
        "seed": 12345,
        "temperature": 0.9,
        "streaming_interval": 0.32,
        "max_tokens": 4096
    }

Request body for /timestamps:
    {"audio_b64": "...", "text": "...", "engine": "ctc"}

Returns for /timestamps:
    [{"word": "hello", "start_ms": 0, "end_ms": 320}, ...]
"""

import sys
import json
import struct
import base64
import io
import threading
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler

import numpy as np
import soundfile as sf

# ── Model constants ───────────────────────────────────────────────────────────

# Use the already-cached 8-bit MLX model (balance of speed and quality on M4).
MODEL_ID = "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit"

# Qwen3-TTS bleeds instruct/voice-conditioning tokens into the first ~200ms of
# audio before the model locks onto the actual spoken text.  Trimming this
# preamble from the first audio chunk eliminates the "wrong first words" artefact
# without affecting the rest of the synthesis.
TRIM_START_MS = 200

# ── Lazy model singleton ──────────────────────────────────────────────────────

_model = None
_model_lock = threading.Lock()


def _load_model():
    """Load Qwen3-TTS model once; subsequent calls return the cached instance."""
    global _model
    if _model is not None:
        return _model
    with _model_lock:
        if _model is not None:
            return _model
        print(f"[qwen_server] Loading {MODEL_ID}…", flush=True)
        from mlx_audio.tts.models.qwen3_tts import Model
        _model = Model.from_pretrained(MODEL_ID)
        print("[qwen_server] Model ready.", flush=True)
        return _model


# ── Audio helpers ─────────────────────────────────────────────────────────────

def _array_to_wav_bytes(audio, sample_rate: int) -> bytes:
    """Convert an mlx array or float32 numpy array to WAV bytes."""
    audio_np = np.array(audio, dtype=np.float32)
    if audio_np.ndim > 1:
        audio_np = audio_np.mean(axis=-1)
    buf = io.BytesIO()
    sf.write(buf, audio_np, sample_rate, format="WAV", subtype="PCM_16")
    buf.seek(0)
    return buf.read()


def _wav_bytes_to_float32_16k(wav_bytes: bytes) -> np.ndarray:
    """Decode WAV bytes → float32 numpy array at 16 kHz mono for CTC alignment."""
    buf = io.BytesIO(wav_bytes)
    data, sr = sf.read(buf, dtype="float32", always_2d=False)
    if data.ndim == 2:
        data = data.mean(axis=1)
    if sr != 16_000:
        import math
        from scipy.signal import resample_poly
        gcd = math.gcd(16_000, sr)
        data = resample_poly(data, 16_000 // gcd, sr // gcd)
    return data.astype(np.float32)


# ── Synthesis ─────────────────────────────────────────────────────────────────

def _iter_voice_design(text: str, instruct: str, seed: int, temperature: float,
                       streaming_interval: float, max_tokens: int):
    """
    Yield (audio_mlx_array, sample_rate) for each streaming chunk.
    Uses mlx.random.seed for voice consistency across calls with the same seed.
    """
    import mlx.core as mx
    mx.random.seed(seed)
    model = _load_model()
    for result in model.generate_voice_design(
        text,
        instruct=instruct,
        language="auto",
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True,
        streaming_interval=streaming_interval,
    ):
        yield result.audio, result.sample_rate


# ── Timestamp helpers ─────────────────────────────────────────────────────────

_ctc_singleton = None
_ctc_lock = threading.Lock()


def _get_ctc_singleton():
    global _ctc_singleton
    if _ctc_singleton is not None:
        return _ctc_singleton
    with _ctc_lock:
        if _ctc_singleton is None:
            from ctc_forced_aligner import AlignmentSingleton
            _ctc_singleton = AlignmentSingleton()
    return _ctc_singleton


def _ctc_timestamps(wav_bytes: bytes, text: str) -> list:
    """CTC forced alignment → [{"word": str, "start_ms": int, "end_ms": int}]."""
    from ctc_forced_aligner import (
        generate_emissions, preprocess_text,
        get_alignments, get_spans, postprocess_results,
    )
    audio = _wav_bytes_to_float32_16k(wav_bytes)
    singleton = _get_ctc_singleton()
    emissions, stride = generate_emissions(singleton.model, audio)
    tokens_starred, text_starred = preprocess_text(text, romanize=True, language="eng")
    segments, scores, blank_token = get_alignments(emissions, tokens_starred, singleton.tokenizer)
    spans = get_spans(tokens_starred, segments, blank_token)
    results = postprocess_results(text_starred, spans, stride, scores)
    # results: [{"start": secs, "end": secs, "text": str, "score": float}]
    return [
        {"word": r["text"], "start_ms": int(r["start"] * 1000), "end_ms": int(r["end"] * 1000)}
        for r in results
    ]


_whisper_model = None
_whisper_lock = threading.Lock()


def _whisper_timestamps(wav_bytes: bytes, text: str) -> list:
    """Faster-whisper forced alignment fallback."""
    global _whisper_model
    from faster_whisper import WhisperModel
    with _whisper_lock:
        if _whisper_model is None:
            _whisper_model = WhisperModel("tiny.en", device="cpu", compute_type="int8")
    audio = _wav_bytes_to_float32_16k(wav_bytes)
    buf = io.BytesIO()
    sf.write(buf, audio, 16_000, format="WAV", subtype="PCM_16")
    buf.seek(0)
    segs, _ = _whisper_model.transcribe(buf, word_timestamps=True)
    out = []
    for seg in segs:
        for w in (seg.words or []):
            out.append({
                "word":     w.word.strip(),
                "start_ms": int(w.start * 1000),
                "end_ms":   int(w.end * 1000),
            })
    return out


# ── HTTP request handler ──────────────────────────────────────────────────────

class QwenHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        # Suppress per-request access log; only errors go to stderr
        pass

    def log_error(self, fmt, *args):
        print(f"[qwen_server] {fmt % args}", file=sys.stderr, flush=True)

    def do_GET(self):
        if self.path == "/health":
            self._send_json({"status": "ok"})
        else:
            self._send_error(404, "Not Found")

    def do_POST(self):
        try:
            body = self._read_json()
        except Exception as e:
            self._send_error(400, f"Bad JSON: {e}")
            return

        if self.path == "/":
            self._handle_speak(body)
        elif self.path == "/stream":
            self._handle_stream(body)
        elif self.path == "/timestamps":
            self._handle_timestamps(body)
        else:
            self._send_error(404, "Not Found")

    # ── Endpoints ─────────────────────────────────────────────────────────────

    def _handle_speak(self, body: dict):
        """Full WAV synthesis — collect all chunks, return one WAV blob."""
        try:
            chunks = list(_iter_voice_design(
                text=body.get("text", ""),
                instruct=body.get("instruct", ""),
                seed=int(body.get("seed", 42)),
                temperature=float(body.get("temperature", 0.9)),
                streaming_interval=float(body.get("streaming_interval", 2.0)),
                max_tokens=int(body.get("max_tokens", 4096)),
            ))
            if not chunks:
                self._send_error(500, "No audio generated")
                return
            # Concatenate all chunk arrays
            all_audio = np.concatenate([np.array(c[0], dtype=np.float32) for c in chunks])
            sample_rate = chunks[0][1]
            # Trim instruct bleed-through from the start
            trim_samples = int(TRIM_START_MS * sample_rate / 1000)
            all_audio = all_audio[trim_samples:]
            wav_bytes = _array_to_wav_bytes(all_audio, sample_rate)
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(wav_bytes)))
            self.end_headers()
            self.wfile.write(wav_bytes)
        except Exception:
            traceback.print_exc()
            self._send_error(500, "Synthesis failed")

    def _handle_stream(self, body: dict):
        """
        Streaming WAV synthesis.
        Each chunk written as: [4-byte big-endian uint32 length][complete WAV bytes]
        Matches the length-prefixed protocol expected by TTSPlayer in tts-player.ts.
        """
        try:
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Connection", "close")
            self.end_headers()

            first_chunk = True
            for audio, sample_rate in _iter_voice_design(
                text=body.get("text", ""),
                instruct=body.get("instruct", ""),
                seed=int(body.get("seed", 42)),
                temperature=float(body.get("temperature", 0.9)),
                streaming_interval=float(body.get("streaming_interval", 0.32)),
                max_tokens=int(body.get("max_tokens", 4096)),
            ):
                audio_np = np.array(audio, dtype=np.float32)
                if first_chunk:
                    # Trim instruct bleed-through from the start of synthesis
                    trim_samples = int(TRIM_START_MS * sample_rate / 1000)
                    audio_np = audio_np[trim_samples:]
                    first_chunk = False
                if audio_np.size == 0:
                    continue
                wav_bytes = _array_to_wav_bytes(audio_np, sample_rate)
                length_prefix = struct.pack(">I", len(wav_bytes))
                try:
                    self.wfile.write(length_prefix + wav_bytes)
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    # Client aborted (stop button, node switch) — exit cleanly
                    break

        except Exception:
            traceback.print_exc()
            # Headers already sent; can't send an error response — just close

    def _handle_timestamps(self, body: dict):
        """
        Word-level timestamp alignment.
        Request:  {"audio_b64": "...", "text": "...", "engine": "ctc"}
        Response: [{"word": "hello", "start_ms": 0, "end_ms": 320}, ...]
        """
        try:
            audio_b64 = body.get("audio_b64", "")
            text = body.get("text", "")
            engine = body.get("engine", "ctc")
            wav_bytes = base64.b64decode(audio_b64)
            result = _whisper_timestamps(wav_bytes, text) if engine == "whisper" \
                else _ctc_timestamps(wav_bytes, text)
            self._send_json(result)
        except Exception:
            traceback.print_exc()
            self._send_error(500, "Timestamp alignment failed")

    # ── HTTP helpers ──────────────────────────────────────────────────────────

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        return json.loads(raw)

    def _send_json(self, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, code: int, message: str):
        body = json.dumps({"error": message}).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7862

    # Warm the model before accepting requests so the first TTS call is fast
    try:
        _load_model()
    except Exception:
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

    server = HTTPServer(("127.0.0.1", port), QwenHandler)

    # This exact string is detected by qwen-daemon.ts to confirm the server is up
    print(f"Listening on http://127.0.0.1:{port}", file=sys.stderr, flush=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
