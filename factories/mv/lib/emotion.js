/**
 * 情緒取樣器：以 cue 時間軸產生可重複取樣的表情，不依賴呼叫順序或瀏覽器狀態。
 * intensity 只縮放情緒相對於 neutral 的表情差異；0 會呈現 neutral 表情，
 * 但仍保留規律眨眼、微小視線漂移與呼吸等環境動態。
 */

const POSE = Object.freeze({
  EYE_LEFT: 0,
  EYE_RIGHT: 1,
  BROW_LEFT: 2,
  BROW_RIGHT: 3,
  BROW_LIFT: 4,
  SMILE: 5,
  MOUTH_OPEN: 6,
  GAZE_X: 7,
  GAZE_Y: 8,
  TILT: 9,
  ENERGY: 10,
  BLUSH: 11,
});

const IDLE = Object.freeze({
  BREATH_AMPLITUDE: 0,
  BREATH_RATE: 1,
  GAZE_AMPLITUDE: 2,
  GAZE_RATE: 3,
  BLINK_SCALE: 4,
});

const EMOTION_PRESETS = Object.freeze({
  neutral: Object.freeze({
    pose: Object.freeze([0.92, 0.91, 0, 0, 0, 0, 0.015, 0, 0, 0, 0.42, 0.02]),
    idle: Object.freeze([0.0054, 0.52, 0.012, 0.34, 1]),
  }),
  curious: Object.freeze({
    pose: Object.freeze([0.97, 0.94, 0.16, -0.08, 0.018, 0.12, 0.015, 0.14, -0.02, -0.035, 0.62, 0.05]),
    idle: Object.freeze([0.0048, 0.61, 0.022, 0.43, 1.08]),
  }),
  joy: Object.freeze({
    pose: Object.freeze([0.84, 0.82, 0.06, -0.04, 0.025, 0.76, 0.14, 0, -0.02, -0.035, 0.84, 0.2]),
    idle: Object.freeze([0.0064, 0.68, 0.018, 0.47, 0.96]),
  }),
  sad: Object.freeze({
    pose: Object.freeze([0.68, 0.72, -0.19, 0.16, -0.014, -0.45, 0.035, -0.015, 0.17, 0.07, 0.24, 0.035]),
    idle: Object.freeze([0.0038, 0.39, 0.008, 0.24, 1.1]),
  }),
  angry: Object.freeze({
    pose: Object.freeze([0.58, 0.61, 0.22, -0.22, -0.008, -0.32, 0.035, 0, 0.025, 0.025, 0.72, 0.1]),
    idle: Object.freeze([0.0041, 0.55, 0.01, 0.32, 0.85]),
  }),
  surprised: Object.freeze({
    pose: Object.freeze([1, 0.99, 0.12, -0.1, 0.04, 0.05, 0.48, 0, -0.08, -0.015, 0.78, 0.1]),
    idle: Object.freeze([0.0053, 0.72, 0.027, 0.51, 1.16]),
  }),
  worried: Object.freeze({
    pose: Object.freeze([0.78, 0.81, -0.2, 0.17, 0.012, -0.18, 0.018, -0.025, 0.05, 0.055, 0.32, 0.055]),
    idle: Object.freeze([0.0047, 0.58, 0.021, 0.41, 1.13]),
  }),
  calm: Object.freeze({
    pose: Object.freeze([0.83, 0.84, 0.015, -0.015, 0.004, 0.16, 0.012, 0, 0.025, 0.015, 0.38, 0.055]),
    idle: Object.freeze([0.0072, 0.43, 0.01, 0.26, 0.78]),
  }),
});

/** 可用情緒名稱，供呼叫端建立 cue 時參照。 */
export const EMOTION_PRESET_NAMES = Object.freeze(Object.keys(EMOTION_PRESETS));

const TAU = Math.PI * 2;
const SQUINT_WINDOW_MAX = 0.12;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function mix(from, to, amount) {
  return from + (to - from) * amount;
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function findActiveCue(states, time) {
  let low = 0;
  let high = states.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (states[middle].at <= time) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

function compileState(at, emotion, intensity) {
  const preset = EMOTION_PRESETS[emotion];
  const neutral = EMOTION_PRESETS.neutral;
  const pose = new Array(preset.pose.length);
  const idle = new Array(preset.idle.length);

  for (let i = 0; i < pose.length; i += 1) {
    pose[i] = mix(neutral.pose[i], preset.pose[i], intensity);
  }
  for (let i = 0; i < idle.length; i += 1) {
    idle[i] = mix(neutral.idle[i], preset.idle[i], intensity);
  }

  return { at, pose, idle, duration: 0, anticipationWindow: 0, squint: 0 };
}

/**
 * 編譯情緒 cue，回傳可按任意時間順序取樣的情緒軌。
 *
 * cue 必須是非空陣列，時間需有限、非負且嚴格遞增；情緒須為八種內建名稱，
 * 強度預設為 1，並限制在 0 到 1。空時間軸會直接拒絕。第一個 cue 的情緒
 * 也用於其時間點之前；最後一個 cue 完成轉換後會一直維持。每次轉換長度為
 * transition，若下一個 cue 更早到達，則縮短至兩 cue 間距，避免轉換互相覆蓋。
 * 單一 cue 沒有情緒轉換。transition 預設 0.55 秒，seed 預設 0。
 *
 * @param {Array<{at:number, emotion:string, intensity?:number}>} keys 情緒 cue。
 * @param {{transition?:number, seed?:number}} options 轉換時間與確定性動態的種子。
 * @returns {{sample(time:number): {eyeOpenLeft:number, eyeOpenRight:number, browLeft:number, browRight:number, browLift:number, smile:number, mouthOpen:number, gazeX:number, gazeY:number, tilt:number, breath:number, energy:number, blush:number}}} 純時間取樣器。
 * @throws {TypeError|RangeError} 設定或取樣時間不符合契約時拋出錯誤。
 */
export function createEmotionTrack(keys, { transition = 0.55, seed = 0 } = {}) {
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new TypeError('keys must be a non-empty array');
  }
  if (!Number.isFinite(transition)) {
    throw new TypeError('transition must be finite');
  }
  if (transition <= 0) {
    throw new RangeError('transition must be positive');
  }
  if (!Number.isFinite(seed)) {
    throw new TypeError('seed must be finite');
  }

  const states = new Array(keys.length);
  let previousAt = -1;
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (key === null || typeof key !== 'object' || Array.isArray(key)) {
      throw new TypeError(`keys[${i}] must be an object`);
    }

    const { at, emotion } = key;
    const intensity = key.intensity === undefined ? 1 : key.intensity;
    if (!Number.isFinite(at)) {
      throw new TypeError(`keys[${i}].at must be finite`);
    }
    if (at < 0) {
      throw new RangeError(`keys[${i}].at must be non-negative`);
    }
    if (at <= previousAt) {
      throw new RangeError('key times must be strictly increasing');
    }
    if (typeof emotion !== 'string' || !Object.prototype.hasOwnProperty.call(EMOTION_PRESETS, emotion)) {
      throw new TypeError(`keys[${i}].emotion is not a supported preset`);
    }
    if (!Number.isFinite(intensity)) {
      throw new TypeError(`keys[${i}].intensity must be finite`);
    }
    if (intensity < 0 || intensity > 1) {
      throw new RangeError(`keys[${i}].intensity must be between 0 and 1`);
    }

    states[i] = compileState(at, emotion, intensity);
    previousAt = at;
  }

  for (let i = 0; i < states.length; i += 1) {
    const state = states[i];
    const next = states[i + 1];
    state.duration = next ? Math.min(transition, next.at - state.at) : transition;

    if (i > 0) {
      const before = state.at - states[i - 1].at;
      const after = next ? next.at - state.at : SQUINT_WINDOW_MAX;
      state.anticipationWindow = Math.min(SQUINT_WINDOW_MAX, before * 0.24, after * 0.24);

      const oldPose = states[i - 1].pose;
      const newPose = state.pose;
      const change = Math.max(
        Math.abs(newPose[POSE.EYE_LEFT] - oldPose[POSE.EYE_LEFT]),
        Math.abs(newPose[POSE.EYE_RIGHT] - oldPose[POSE.EYE_RIGHT]),
        Math.abs(newPose[POSE.SMILE] - oldPose[POSE.SMILE]),
        Math.abs(newPose[POSE.MOUTH_OPEN] - oldPose[POSE.MOUTH_OPEN]),
      );
      state.squint = 0.04 * Math.min(1, change * 1.25);
    }
  }

  // 以有限範圍折疊 seed，避免極大有限值在相位計算中溢位。
  const seedWave = Math.sin((seed % 1000000) * 12.9898 + 78.233);
  const seedUnit = 0.5 + 0.5 * seedWave;
  const phase = seedUnit * TAU;
  const blinkPeriod = 4.1 + seedUnit * 1.05;
  const blinkDuration = 0.14 + seedUnit * 0.04;
  const blinkOffset = seedUnit * blinkPeriod;

  return Object.freeze({
    sample(time) {
      if (!Number.isFinite(time)) {
        throw new TypeError('time must be finite');
      }

      const activeIndex = findActiveCue(states, time);
      const current = states[activeIndex];
      const previous = activeIndex > 0 ? states[activeIndex - 1] : current;
      const amount = activeIndex > 0
        ? smoothstep((time - current.at) / current.duration)
        : 1;
      const fromPose = previous.pose;
      const toPose = current.pose;
      const fromIdle = previous.idle;
      const toIdle = current.idle;

      let anticipation = 0;
      let anticipationCue = null;
      if (activeIndex > 0 && current.anticipationWindow > 0
        && Math.abs(time - current.at) <= current.anticipationWindow) {
        anticipationCue = current;
      } else if (activeIndex + 1 < states.length) {
        const next = states[activeIndex + 1];
        if (next.anticipationWindow > 0
          && Math.abs(time - next.at) <= next.anticipationWindow) {
          anticipationCue = next;
        }
      }
      if (anticipationCue) {
        const distance = Math.abs(time - anticipationCue.at);
        const progress = distance / anticipationCue.anticipationWindow;
        anticipation = anticipationCue.squint * (1 - smoothstep(progress));
      }

      const breathAmplitude = mix(
        fromIdle[IDLE.BREATH_AMPLITUDE], toIdle[IDLE.BREATH_AMPLITUDE], amount,
      );
      const breathRate = mix(fromIdle[IDLE.BREATH_RATE], toIdle[IDLE.BREATH_RATE], amount);
      const gazeAmplitude = mix(
        fromIdle[IDLE.GAZE_AMPLITUDE], toIdle[IDLE.GAZE_AMPLITUDE], amount,
      );
      const gazeRate = mix(fromIdle[IDLE.GAZE_RATE], toIdle[IDLE.GAZE_RATE], amount);
      const blinkScale = mix(fromIdle[IDLE.BLINK_SCALE], toIdle[IDLE.BLINK_SCALE], amount);

      const blinkPhase = positiveModulo(time + blinkOffset, blinkPeriod);
      let blink = 0;
      if (blinkPhase < blinkDuration) {
        const progress = blinkPhase / blinkDuration;
        blink = progress < 0.5
          ? smoothstep(progress * 2)
          : smoothstep((1 - progress) * 2);
      }
      const blinkLeft = Math.min(0.97, blink * blinkScale);
      const blinkRight = Math.min(0.97, blink * blinkScale * 0.985);
      const lidDrift = 0.009 * Math.sin(time * 0.37 + phase + 0.7);
      const gazeDriftX = gazeAmplitude * Math.sin(time * gazeRate + phase + 1.1);
      const gazeDriftY = gazeAmplitude * 0.42 * Math.sin(time * gazeRate * 0.73 + phase + 2.4);
      const idleTilt = 0.0025 * Math.sin(time * 0.31 + phase + 1.8);

      return {
        eyeOpenLeft: clamp(
          mix(fromPose[POSE.EYE_LEFT], toPose[POSE.EYE_LEFT], amount)
            + lidDrift - blinkLeft - anticipation,
          0,
          1,
        ),
        eyeOpenRight: clamp(
          mix(fromPose[POSE.EYE_RIGHT], toPose[POSE.EYE_RIGHT], amount)
            + lidDrift * 0.92 - blinkRight - anticipation * 0.92,
          0,
          1,
        ),
        browLeft: clamp(mix(fromPose[POSE.BROW_LEFT], toPose[POSE.BROW_LEFT], amount), -0.7, 0.7),
        browRight: clamp(mix(fromPose[POSE.BROW_RIGHT], toPose[POSE.BROW_RIGHT], amount), -0.7, 0.7),
        browLift: clamp(mix(fromPose[POSE.BROW_LIFT], toPose[POSE.BROW_LIFT], amount), -0.1, 0.1),
        smile: clamp(mix(fromPose[POSE.SMILE], toPose[POSE.SMILE], amount), -1, 1),
        mouthOpen: clamp(mix(fromPose[POSE.MOUTH_OPEN], toPose[POSE.MOUTH_OPEN], amount), 0, 1),
        gazeX: clamp(
          mix(fromPose[POSE.GAZE_X], toPose[POSE.GAZE_X], amount) + gazeDriftX,
          -1,
          1,
        ),
        gazeY: clamp(
          mix(fromPose[POSE.GAZE_Y], toPose[POSE.GAZE_Y], amount) + gazeDriftY,
          -1,
          1,
        ),
        tilt: clamp(
          mix(fromPose[POSE.TILT], toPose[POSE.TILT], amount) + idleTilt,
          -Math.PI / 6,
          Math.PI / 6,
        ),
        breath: clamp(breathAmplitude * Math.sin(time * breathRate + phase), -0.02, 0.02),
        energy: clamp(mix(fromPose[POSE.ENERGY], toPose[POSE.ENERGY], amount), 0, 1),
        blush: clamp(mix(fromPose[POSE.BLUSH], toPose[POSE.BLUSH], amount), 0, 1),
      };
    },
  });
}
