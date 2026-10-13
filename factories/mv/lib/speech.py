"""中文旁白函式：固定模型、離線推論與音訊時間軸。"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PROSODY = {
    "neutral": 1.0, "curious": 0.97, "joy": 1.08, "sad": 0.9,
    "angry": 1.1, "surprised": 1.12, "worried": 1.04, "calm": 0.92,
}


def _number(value, label, minimum, maximum):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} 必須是有限數值")
    if not minimum <= value <= maximum:
        raise ValueError(f"{label} 必須介於 {minimum} 與 {maximum}")
    return float(value)


def validate_narration(spec):
    """檢查秒數、中文台詞與情緒語速；不以自動截斷或替代聲音掩蓋錯誤。"""
    if not isinstance(spec, dict) or not isinstance(spec.get("cues"), list) or not spec["cues"]:
        raise ValueError("旁白需提供非空 cues 陣列")
    duration = _number(spec.get("duration"), "duration", 0.1, 600)
    cues = []
    previous = -1
    for index, cue in enumerate(spec["cues"]):
        if not isinstance(cue, dict):
            raise ValueError(f"cues[{index}] 必須是物件")
        at = _number(cue.get("at"), f"cues[{index}].at", 0, duration)
        if at <= previous or at >= duration:
            raise ValueError("cue 時間必須嚴格遞增且位於影片長度內")
        text = cue.get("text")
        if not isinstance(text, str) or not text.strip() or not re.search(r"[\u3400-\u9fff]", text):
            raise ValueError("台詞需含中文文字")
        if re.search(r"[A-Za-z]", text):
            raise ValueError("目前中文音色不處理英文；請將縮寫改寫為中文讀法")
        emotion = cue.get("emotion", "neutral")
        if emotion not in PROSODY:
            raise ValueError(f"不支援的旁白情緒：{emotion}")
        speed = _number(cue.get("speed", PROSODY[emotion]), "speed", 0.65, 1.4)
        cues.append({"at": at, "text": text.strip(), "emotion": emotion, "speed": speed})
        previous = at
    return duration, cues


def _manifest(root):
    return json.loads((root / "voice-model.lock.json").read_text(encoding="utf-8"))


def _cache(root):
    path = root / ".runtime/voice-model"
    path.mkdir(parents=True, exist_ok=True)
    if path.resolve() != path:
        raise ValueError("語音模型目錄不可透過 symlink 外跳")
    return path


def _session_directory(root):
    path = Path(os.environ.get("MV_SESSION_DIR", root / ".runtime")).resolve()
    if not path.is_relative_to(root / ".runtime"):
        raise ValueError("語音暫存必須位於 .runtime 內")
    return path


def _verify_file(path, entry):
    if path.is_symlink() or path.stat().st_size != entry["bytes"]:
        raise ValueError(f"模型檔案大小或路徑不符：{entry['path']}")
    digest = hashlib.sha256() if "sha256" in entry else hashlib.sha1()
    if "gitBlobSha1" in entry:
        digest.update(f"blob {entry['bytes']}\0".encode())
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != entry.get("sha256", entry.get("gitBlobSha1")):
        raise ValueError(f"模型雜湊不符：{entry['path']}；請審閱模型，勿繞過檢查")


def prepare_model(root=ROOT):
    """唯一允許連線的準備步驟；下載固定 revision，驗證後才發布到快取。"""
    root = Path(root).resolve()
    manifest = _manifest(root)
    cache = _cache(root)
    for entry in manifest["files"]:
        target = cache / entry["path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.parent.resolve() != target.parent:
            raise ValueError("模型子目錄不可為 symlink")
        if target.exists():
            _verify_file(target, entry)
            continue
        url = f"https://huggingface.co/{manifest['repoId']}/resolve/{manifest['revision']}/{entry['path']}?download=true"
        print(f"下載固定模型檔：{entry['path']}", flush=True)
        fd, temporary = tempfile.mkstemp(prefix="download-", dir=_session_directory(root))
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "advisors-mv-offline-voice/1"})
            with os.fdopen(fd, "wb") as output, urllib.request.urlopen(request, timeout=120) as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    output.write(chunk)
            _verify_file(Path(temporary), entry)
            os.link(temporary, target)
        finally:
            Path(temporary).unlink(missing_ok=True)
    return {"model": manifest["repoId"], "revision": manifest["revision"], "voice": manifest["voice"]}


def phoneme_chunks(text, g2p, limit=510):
    """以實際音素長度切句，避免上游中文推論器把長台詞截斷。"""
    phonemes, _ = g2p(text)
    if not phonemes:
        raise ValueError("台詞未產生可合成的音素")
    if len(phonemes) <= limit:
        return [(text, phonemes)]
    if len(text) < 2:
        raise ValueError("單一文字超過模型音素限制")
    midpoint = len(text) // 2
    punctuation = [match.end() for match in re.finditer(r"[，。！？；,!?;]", text) if 0 < match.end() < len(text)]
    split = min(punctuation, key=lambda position: abs(position - midpoint)) if punctuation else midpoint
    return phoneme_chunks(text[:split], g2p, limit) + phoneme_chunks(text[split:], g2p, limit)


def assemble_narration(duration, segments, sample_rate=24000):
    """依實際取樣數排入靜音時間軸；重疊、超長與非法取樣會直接失敗。"""
    import numpy as np
    result = np.zeros(round(duration * sample_rate), dtype=np.float32)
    previous_end = 0
    boundaries = []
    for cue, audio in segments:
        audio = np.asarray(audio, dtype=np.float32)
        if audio.ndim != 1 or not audio.size or not np.isfinite(audio).all():
            raise ValueError("語音需為非空、有限的單聲道取樣")
        start = round(cue["at"] * sample_rate)
        end = start + len(audio)
        if start < previous_end:
            raise ValueError("實際旁白互相重疊；請調整 cue.at 或語速")
        if start < 0 or end > len(result):
            raise ValueError("實際旁白超出影片長度；請增加 duration 或調整 cue")
        if np.max(np.abs(audio)) > 1:
            raise ValueError("模型輸出超出 PCM 範圍，拒絕以削波掩蓋錯誤")
        result[start:end] = audio
        previous_end = end
        boundaries.append({**cue, "end": end / sample_rate})
    return result, boundaries


def synthesize_narration(narration_path, output_path, root=ROOT):
    """以固定本機 Kokoro 中文模型生成 WAV 和實際 cue 時序，不呼叫語音 API。"""
    root = Path(root).resolve()
    narration = root / narration_path
    if Path(narration_path).is_absolute() or ".." in Path(narration_path).parts or not narration.resolve().is_relative_to(root / "projects"):
        raise ValueError("旁白設定必須位於 projects/，不可透過路徑外跳")
    duration, cues = validate_narration(json.loads(narration.read_text(encoding="utf-8")))
    output = root / output_path
    if Path(output_path).is_absolute() or ".." in Path(output_path).parts or output.suffix != ".wav" or not output.parent.resolve().is_relative_to(root / "assets/speech"):
        raise ValueError("語音輸出必須是 assets/speech/ 內的 WAV")
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.parent.resolve() != output.parent:
        raise ValueError("語音輸出目錄不可為 symlink")
    sidecar = output.with_suffix(".json")
    if output.exists() or output.is_symlink() or sidecar.exists() or sidecar.is_symlink():
        raise FileExistsError("語音或時序檔已存在，不會覆寫")
    manifest = _manifest(root)
    cache = _cache(root)
    for entry in manifest["files"]:
        _verify_file(cache / entry["path"], entry)
    if os.environ.get("HF_HUB_OFFLINE") != "1" or os.environ.get("TRANSFORMERS_OFFLINE") != "1":
        raise RuntimeError("語音推論必須啟用離線模式，請從 npm run speech 執行")
    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KModel, KPipeline
    torch.set_num_threads(2)
    torch.manual_seed(0)
    model = KModel(repo_id=manifest["repoId"], config=str(cache / "config.json"), model=str(cache / "kokoro-v1_1-zh.pth")).to("cpu").eval()
    pipeline = KPipeline(lang_code=manifest["language"], repo_id=manifest["repoId"], model=model)
    voice = torch.load(cache / f"voices/{manifest['voice']}.pt", map_location="cpu", weights_only=True)
    segments = []
    for cue in cues:
        chunks = []
        for _, phonemes in phoneme_chunks(cue["text"], pipeline.g2p):
            unknown = set(phonemes) - set(model.vocab)
            if unknown:
                raise ValueError(f"中文模型不認識以下音素：{sorted(unknown)}")
            audio = KPipeline.infer(model, phonemes, voice, cue["speed"]).audio.detach().cpu().numpy()
            chunks.append(audio)
        segments.append((cue, np.concatenate(chunks)))
    audio, boundaries = assemble_narration(duration, segments, manifest["sampleRate"])
    metadata = {"model": manifest["repoId"], "revision": manifest["revision"], "voice": manifest["voice"], "sampleRate": manifest["sampleRate"], "duration": duration, "synthetic": True, "prosody": "語速與停頓控制，非情緒演技模型或音素級對嘴", "cues": boundaries}
    with tempfile.TemporaryDirectory(prefix="speech-", dir=_session_directory(root)) as session:
        wav = Path(session) / "speech.wav"
        timing = Path(session) / "speech.json"
        sf.write(wav, audio, manifest["sampleRate"], subtype="PCM_16")
        timing.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.link(wav, output)
        try:
            os.link(timing, sidecar)
        except BaseException:
            output.unlink()
            raise
    return metadata


def main():
    parser = argparse.ArgumentParser(description="本機離線中文旁白")
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("narration", nargs="?")
    parser.add_argument("output", nargs="?")
    args = parser.parse_args()
    if args.prepare:
        if args.narration or args.output:
            parser.error("--prepare 不接受旁白或輸出參數")
        result = prepare_model()
    else:
        if not args.narration or not args.output:
            parser.error("需指定 projects/ 下的旁白 JSON 與 assets/speech/ 下的輸出 WAV")
        result = synthesize_narration(args.narration, args.output)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
