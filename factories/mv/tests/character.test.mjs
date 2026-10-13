import assert from 'node:assert/strict';
import test from 'node:test';
import { createCharacter } from '../lib/character.js';

test('a character keeps its appearance when the caller edits a shared config', () => {
  const config = { gender: 'female', hairstyle: 'short', hairColor: '#bA52cF' };
  const first = createCharacter(config);
  config.hairstyle = 'long';
  config.hairColor = '#123456';
  const second = createCharacter(config);

  assert.equal(first.appearance.hairstyle, 'short');
  assert.equal(first.appearance.hairColor, '#bA52cF');
  assert.equal(second.appearance.hairstyle, 'long');
  assert.equal(second.appearance.hairColor, '#123456');
  assert.throws(() => { first.appearance.gender = 'male'; }, TypeError);
});

test('invalid identity, hairstyle and color fail before rendering', () => {
  for (const options of [null, [], 'short', { gender: 'unknown' }, { hairstyle: 'unknown' }]) {
    assert.throws(() => createCharacter(options), TypeError);
  }
  for (const hairColor of ['red', '#123', '#12345g', '#12345678', 'url(https://example.com/hair)', null, 123456]) {
    assert.throws(() => createCharacter({ hairColor }), TypeError);
  }
});
