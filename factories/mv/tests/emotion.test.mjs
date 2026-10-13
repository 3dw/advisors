import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmotionTrack } from '../lib/emotion.js';

test('samples are deterministic across call order and keep cue input untouched', () => {
  const keys = [
    { at: 0, emotion: 'curious', intensity: 0.8 },
    { at: 1.1, emotion: 'calm' },
  ];
  const original = structuredClone(keys);
  const track = createEmotionTrack(keys, { seed: 23 });
  const times = [0, 0.22, 0.84, 1.15, 2.4];
  const forward = times.map((time) => track.sample(time));
  const reverse = [...times].reverse().map((time) => track.sample(time)).reverse();

  assert.deepEqual(reverse, forward);
  assert.deepEqual(keys, original);
});

test('eased cue changes do not snap and the target is reached', () => {
  const track = createEmotionTrack([
    { at: 0, emotion: 'joy' },
    { at: 0.8, emotion: 'sad' },
  ], { transition: 0.5 });

  const before = track.sample(0.8 - 1e-6);
  const atCue = track.sample(0.8);
  const after = track.sample(0.8 + 1e-6);
  assert.ok(Math.abs(before.smile - atCue.smile) < 1e-8);
  assert.ok(Math.abs(after.smile - atCue.smile) < 1e-8);
  const target = createEmotionTrack([{ at: 0, emotion: 'sad' }]);
  assert.ok(Math.abs(track.sample(1.3).smile - target.sample(1.3).smile) < 1e-12);
  assert.ok(Math.abs(track.sample(4).smile - target.sample(4).smile) < 1e-12);
});

test('uses the first cue before its start and limits overlapping transitions', () => {
  const beforeStart = createEmotionTrack([{ at: 2, emotion: 'joy' }]);
  assert.equal(beforeStart.sample(-1).smile, beforeStart.sample(2).smile);

  const closelySpaced = createEmotionTrack([
    { at: 0, emotion: 'joy' },
    { at: 0.3, emotion: 'sad' },
    { at: 0.36, emotion: 'angry' },
  ], { transition: 1 });
  const sad = createEmotionTrack([{ at: 0, emotion: 'sad' }]);
  assert.ok(Math.abs(closelySpaced.sample(0.36).smile - sad.sample(0.36).smile) < 1e-12);
});

test('zero intensity is neutral while deterministic idle remains active', () => {
  const neutral = createEmotionTrack([{ at: 0, emotion: 'neutral' }], { seed: 5 });
  const zeroIntensity = createEmotionTrack([{ at: 0, emotion: 'joy', intensity: 0 }], { seed: 5 });
  const samples = [0, 0.4, 0.8, 1.2].map((time) => zeroIntensity.sample(time));

  for (const sample of samples) {
    const neutralSample = neutral.sample(0);
    assert.equal(sample.smile, neutralSample.smile);
    assert.equal(sample.energy, neutralSample.energy);
    assert.equal(sample.blush, neutralSample.blush);
  }
  assert.notEqual(samples[0].breath, samples[1].breath);
});

test('invalid timelines, options, and sample times are rejected', () => {
  assert.throws(() => createEmotionTrack([]), TypeError);
  assert.throws(() => createEmotionTrack([{ at: -1, emotion: 'joy' }]), RangeError);
  assert.throws(() => createEmotionTrack([
    { at: 1, emotion: 'joy' },
    { at: 1, emotion: 'sad' },
  ]), RangeError);
  assert.throws(() => createEmotionTrack([{ at: 0, emotion: 'afraid' }]), TypeError);
  assert.throws(() => createEmotionTrack([{ at: 0, emotion: 'joy', intensity: 1.1 }]), RangeError);
  assert.throws(() => createEmotionTrack([{ at: 0, emotion: 'joy' }], { transition: 0 }), RangeError);
  assert.throws(() => createEmotionTrack([{ at: 0, emotion: 'joy' }], { seed: Infinity }), TypeError);
  assert.throws(() => createEmotionTrack([{ at: 0, emotion: 'joy' }]).sample(NaN), TypeError);
});
