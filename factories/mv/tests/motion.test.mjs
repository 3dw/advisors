import assert from 'node:assert/strict';
import test from 'node:test';

import { createMotionTrack } from '../lib/motion.js';

const REST = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  armLeft: 0,
  armRight: 0,
  legLeft: 0,
  legRight: 0,
  facing: 1,
};

test('samples are deterministic, order-independent, and negative time is pre-start', () => {
  const track = createMotionTrack([
    { type: 'walk', start: 0, duration: 1, distance: 2 },
    { type: 'wave', start: 0.1, duration: 0.9, side: 'right' },
    { type: 'nod', start: 0.2, duration: 0.8 },
    { type: 'jump', start: 1, duration: 1, height: 0.9 },
  ]);
  const expected = track.sample(0.55);

  for (const time of [1.8, -2, 0, 1, 0.55, 2.5, 0.1]) track.sample(time);
  assert.deepEqual(track.sample(0.55), expected);
  assert.deepEqual(track.sample(-1), REST);
  assert.deepEqual(createMotionTrack([]).sample(10), REST);
});

test('walk eases, retains completed distance, and preserves squash area', () => {
  const track = createMotionTrack([
    { type: 'walk', start: 0, duration: 1, distance: 2 },
    { type: 'walk', start: 1, duration: 0.5, distance: -0.5 },
  ]);

  assert.equal(track.sample(0).x, 0);
  assert.ok(track.sample(0.5).x > 0 && track.sample(0.5).x < 2);
  assert.equal(track.sample(1).x, 2);
  assert.equal(track.sample(1.5).x, 1.5);
  assert.equal(track.sample(20).x, 1.5);

  const stride = track.sample(0.5);
  assert.ok(stride.legLeft !== 0 || stride.legRight !== 0);
  assert.ok(Math.abs(stride.scaleX * stride.scaleY - 1) < 1e-12);
  assert.ok(Math.abs(track.sample(1 - 1e-7).x - track.sample(1 + 1e-7).x) < 1e-5);
});

test('jump has continuous anticipation, flight, landing, and neutral boundaries', () => {
  const track = createMotionTrack([{ type: 'jump', start: 2, duration: 1, height: 1 }]);
  assert.deepEqual(track.sample(2), REST);
  assert.deepEqual(track.sample(3), REST);

  const crouch = track.sample(2.1);
  const flight = track.sample(2.48);
  const landing = track.sample(2.9);
  assert.ok(crouch.y > 0 && crouch.scaleY < 1);
  assert.ok(flight.y < 0);
  assert.ok(landing.y > 0);

  for (const boundary of [2.18, 2.78]) {
    const before = track.sample(boundary - 1e-7);
    const after = track.sample(boundary + 1e-7);
    for (const field of Object.keys(REST)) {
      assert.ok(Math.abs(before[field] - after[field]) < 1e-5, `${field} jumps at ${boundary}`);
    }
  }
  for (const time of [2.1, 2.48, 2.78, 2.9]) {
    const pose = track.sample(time);
    assert.ok(pose.scaleX > 0 && pose.scaleY > 0);
    assert.ok(Math.abs(pose.scaleX * pose.scaleY - 1) < 1e-12);
  }
});

test('wave raises only its selected side and overlays jump angles additively', () => {
  const leftWave = createMotionTrack([{ type: 'wave', start: 0, duration: 1, side: 'left' }]);
  const rightWave = createMotionTrack([{ type: 'wave', start: 0, duration: 1, side: 'right' }]);
  const leftPose = leftWave.sample(0.5);
  const rightPose = rightWave.sample(0.5);
  assert.ok(leftPose.armLeft > 0);
  assert.equal(leftPose.armRight, 0);
  assert.ok(rightPose.armRight < 0);
  assert.ok(Math.cos(leftPose.armLeft) < 0, 'greeting hand rises above shoulder');
  assert.ok(Math.cos(rightPose.armRight) < 0, 'greeting hand rises above shoulder');
  assert.equal(rightPose.armLeft, 0);
  assert.equal(leftWave.sample(1).armLeft, 0);

  const jump = { type: 'jump', start: 0, duration: 1, height: 0.8 };
  const wave = { type: 'wave', start: 0, duration: 1, side: 'left' };
  const combined = createMotionTrack([jump, wave]).sample(0.5);
  const jumpPose = createMotionTrack([jump]).sample(0.5);
  assert.equal(combined.armLeft, jumpPose.armLeft + leftPose.armLeft);
  assert.equal(combined.y, jumpPose.y);
  assert.ok(Math.abs(combined.scaleX * combined.scaleY - 1) < 1e-12);
});

test('nod settles to rest and locomotion overlap is rejected', () => {
  const nod = createMotionTrack([{ type: 'nod', start: 1, duration: 1, amount: 0.4 }]);
  assert.equal(nod.sample(1).rotation, 0);
  assert.ok(nod.sample(1.4).rotation > 0);
  assert.equal(nod.sample(2).rotation, 0);

  assert.throws(() => createMotionTrack([
    { type: 'walk', start: 0, duration: 1, distance: 1 },
    { type: 'jump', start: 0.99, duration: 1, height: 1 },
  ]), RangeError);
  const adjacent = createMotionTrack([
    { type: 'walk', start: 0, duration: 1, distance: 1 },
    { type: 'jump', start: 1, duration: 1, height: 1 },
  ]);
  assert.equal(adjacent.sample(1).x, 1);
  assert.equal(adjacent.sample(2).x, 1);
});

test('rejects invalid action parameters, time, and tempo', () => {
  assert.throws(() => createMotionTrack([], { bpm: 0 }), RangeError);
  assert.throws(() => createMotionTrack([{ type: 'walk', start: -1, duration: 1, distance: 1 }]), RangeError);
  assert.throws(() => createMotionTrack([{ type: 'walk', start: 0, duration: 1, distance: Infinity }]), TypeError);
  assert.throws(() => createMotionTrack([{ type: 'jump', start: 0, duration: 1, height: 11 }]), RangeError);
  assert.throws(() => createMotionTrack([{ type: 'wave', start: 0, duration: 1, side: 'both' }]), RangeError);
  assert.throws(() => createMotionTrack([{ type: 'turn', start: 0, duration: 1 }]), RangeError);
  assert.throws(() => createMotionTrack([]).sample(Number.NaN), TypeError);
});
