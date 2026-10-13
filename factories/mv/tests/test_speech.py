import importlib.util
from pathlib import Path
import unittest
import numpy as np

spec = importlib.util.spec_from_file_location("speech", Path(__file__).resolve().parents[1] / "lib/speech.py")
speech = importlib.util.module_from_spec(spec)
spec.loader.exec_module(speech)


class SpeechBoundaries(unittest.TestCase):
    def test_long_chinese_is_preserved_without_phoneme_truncation(self):
        text = "光點亮起，先停一下。" * 150
        chunks = speech.phoneme_chunks(text, lambda value: (value * 3, None))
        self.assertEqual("".join(value for value, _ in chunks), text)
        self.assertTrue(all(0 < len(phonemes) <= 510 for _, phonemes in chunks))

    def test_timeline_preserves_silence_and_exact_end_boundary(self):
        audio, boundaries = speech.assemble_narration(2, [
            ({"at": 0.25}, np.full(5, 0.5)),
            ({"at": 1.5}, np.full(5, -0.25)),
        ], sample_rate=10)
        np.testing.assert_array_equal(audio, [0, 0, *([0.5] * 5), *([0] * 8), *([-0.25] * 5)])
        self.assertEqual(boundaries[-1]["end"], 2)

    def test_actual_audio_overlap_and_overrun_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "重疊"):
            speech.assemble_narration(2, [({"at": 0}, [0.2] * 11), ({"at": 1}, [0.3])], sample_rate=10)
        with self.assertRaisesRegex(ValueError, "超出"):
            speech.assemble_narration(2, [({"at": 1.5}, [0.2] * 6)], sample_rate=10)
        with self.assertRaisesRegex(ValueError, "有限"):
            speech.assemble_narration(2, [({"at": 0}, [float("nan")])], sample_rate=10)

    def test_invalid_or_silently_unpronounceable_text_is_rejected(self):
        for cue in [{"at": 0, "text": "hello"}, {"at": 0, "text": "使用 API"}, {"at": 0, "text": "你好", "speed": 0}, {"at": 0, "text": "你好", "emotion": "fake"}]:
            with self.assertRaises(ValueError):
                speech.validate_narration({"duration": 3, "cues": [cue]})
        with self.assertRaisesRegex(ValueError, "嚴格遞增"):
            speech.validate_narration({"duration": 3, "cues": [{"at": 1, "text": "你好"}, {"at": 1, "text": "再見"}]})


if __name__ == "__main__":
    unittest.main()
