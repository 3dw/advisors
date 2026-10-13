/**
 * 建立可依時間直接取樣的角色動作軌道；取樣不依賴先前呼叫或影格率。
 *
 * 動作視窗採半開區間 `[start, start + duration)`；負時間視為所有動作尚未開始，
 * 回傳靜止姿勢。非負時間中，完成的行走位移會持續保留。行走與跳躍屬互斥的
 * 位移動作，彼此時間重疊會在建立軌道時拒絕；揮手、點頭可與其他動作重疊，
 * 姿勢角度與位移相加，垂直縮放相乘並以水平倒數縮放維持面積。
 *
 * @param {Array<object>} actions 動作資料；支援 walk、jump、wave 與 nod。
 * @param {{bpm?: number}} [options] 節拍速度，預設每分鐘 96 拍。
 * @returns {{sample(time: number): {x:number,y:number,scaleX:number,scaleY:number,rotation:number,armLeft:number,armRight:number,legLeft:number,legRight:number,facing:number}}}
 */
export function createMotionTrack(actions, { bpm = 96 } = {}) {
  if (!Array.isArray(actions)) {
    throw new TypeError('actions 必須是陣列');
  }
  requireFinite(bpm, 'bpm');
  if (bpm <= 0) {
    throw new RangeError('bpm 必須大於 0');
  }

  const compiled = actions.map(compileAction);
  const locomotion = compiled
    .filter((action) => action.type === 'walk' || action.type === 'jump')
    .sort((left, right) => left.start - right.start || left.end - right.end);

  for (let index = 1; index < locomotion.length; index += 1) {
    if (locomotion[index].start < locomotion[index - 1].end) {
      throw new RangeError('walk 與 jump 的動作視窗不可重疊');
    }
  }

  return Object.freeze({
    sample(time) {
      requireFinite(time, 'time');
      const pose = neutralPose();
      if (time < 0) return pose;

      let verticalScale = 1;
      for (const action of compiled) {
        if (action.type === 'walk') {
          sampleWalk(action, time, bpm, pose, (factor) => {
            verticalScale *= factor;
          });
        } else if (action.type === 'jump') {
          sampleJump(action, time, pose, (factor) => {
            verticalScale *= factor;
          });
        } else if (action.type === 'wave') {
          sampleWave(action, time, pose);
        } else {
          sampleNod(action, time, pose);
        }
      }

      pose.scaleY = verticalScale;
      pose.scaleX = 1 / verticalScale;
      return pose;
    },
  });
}

const TWO_PI = Math.PI * 2;
const MAX_DISTANCE = 100;
const MAX_JUMP_HEIGHT = 10;
const MAX_NOD_AMOUNT = Math.PI / 2;

function requireFinite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} 必須是有限數值`);
  }
}

function compileAction(action, index) {
  if (action === null || typeof action !== 'object' || Array.isArray(action)) {
    throw new TypeError(`actions[${index}] 必須是動作物件`);
  }
  const { type } = action;
  if (type !== 'walk' && type !== 'jump' && type !== 'wave' && type !== 'nod') {
    throw new RangeError(`actions[${index}] 的 type 不受支援`);
  }

  const start = action.start;
  const duration = action.duration;
  requireFinite(start, `actions[${index}].start`);
  requireFinite(duration, `actions[${index}].duration`);
  if (start < 0) {
    throw new RangeError(`actions[${index}].start 不可小於 0`);
  }
  if (duration <= 0) {
    throw new RangeError(`actions[${index}].duration 必須大於 0`);
  }
  const end = start + duration;
  if (!Number.isFinite(end) || end <= start) {
    throw new RangeError(`actions[${index}] 的時間視窗超出可表示範圍`);
  }

  if (type === 'walk') {
    const distance = action.distance;
    requireFinite(distance, `actions[${index}].distance`);
    if (Math.abs(distance) > MAX_DISTANCE) {
      throw new RangeError(`actions[${index}].distance 絕對值不可大於 ${MAX_DISTANCE}`);
    }
    return { type, start, end, duration, distance };
  }
  if (type === 'jump') {
    const height = action.height;
    requireFinite(height, `actions[${index}].height`);
    if (height <= 0 || height > MAX_JUMP_HEIGHT) {
      throw new RangeError(`actions[${index}].height 必須大於 0 且不大於 ${MAX_JUMP_HEIGHT}`);
    }
    return { type, start, end, duration, height };
  }
  if (type === 'wave') {
    if (action.side !== 'left' && action.side !== 'right') {
      throw new RangeError(`actions[${index}].side 必須是 'left' 或 'right'`);
    }
    return { type, start, end, duration, side: action.side };
  }

  const amount = action.amount === undefined ? 0.28 : action.amount;
  requireFinite(amount, `actions[${index}].amount`);
  if (Math.abs(amount) > MAX_NOD_AMOUNT) {
    throw new RangeError(`actions[${index}].amount 絕對值不可大於 π/2`);
  }
  return { type, start, end, duration, amount };
}

function neutralPose() {
  return {
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
}

function sampleWalk(action, time, bpm, pose, multiplyVerticalScale) {
  if (time <= action.start) return;
  if (time >= action.end) {
    pose.x += action.distance;
    return;
  }

  const progress = (time - action.start) / action.duration;
  pose.x += action.distance * smoothStep(progress);
  const envelope = Math.sin(Math.PI * progress) ** 2;
  const cycles = Math.max(0.5, Math.min(12, action.duration * (bpm / 60)));
  const phase = TWO_PI * cycles * progress;
  const direction = action.distance < 0 ? -1 : 1;
  const stride = Math.sin(phase) * direction * envelope;
  const bounce = (1 - Math.cos(phase)) * 0.5 * envelope;

  pose.y -= 0.04 * bounce;
  pose.rotation += 0.035 * stride;
  pose.armLeft += 0.26 * stride;
  pose.armRight -= 0.26 * stride;
  pose.legLeft -= 0.3 * stride;
  pose.legRight += 0.3 * stride;
  multiplyVerticalScale(1 - 0.015 * bounce);
}

function sampleJump(action, time, pose, multiplyVerticalScale) {
  if (time <= action.start || time >= action.end) return;
  const progress = (time - action.start) / action.duration;

  if (progress < 0.18) {
    const phase = smoothStep(progress / 0.18);
    pose.y += 0.05 * phase;
    pose.armLeft += 0.12 * phase;
    pose.armRight -= 0.12 * phase;
    multiplyVerticalScale(1 - 0.08 * phase);
    return;
  }

  if (progress < 0.78) {
    const phase = smoothStep((progress - 0.18) / 0.6);
    const baseline = 0.05 + (0.025 - 0.05) * phase;
    const arc = 4 * action.height * phase * (1 - phase);
    const lift = Math.sin(Math.PI * phase);
    pose.y += baseline - arc;
    pose.armLeft += 0.12 * (1 - lift) + 0.58 * lift;
    pose.armRight -= 0.12 * (1 - lift) + 0.58 * lift;
    pose.legLeft += 0.2 * lift;
    pose.legRight -= 0.2 * lift;
    multiplyVerticalScale(0.92 + 0.12 * lift);
    return;
  }

  const phase = smoothStep((progress - 0.78) / 0.22);
  const rebound = Math.sin(Math.PI * phase) ** 2;
  pose.y += 0.025 * (1 - phase) + 0.045 * rebound;
  pose.armLeft += 0.12 * (1 - phase) + 0.04 * rebound;
  pose.armRight -= 0.12 * (1 - phase) + 0.04 * rebound;
  pose.legLeft += 0.05 * rebound;
  pose.legRight -= 0.05 * rebound;
  multiplyVerticalScale(0.92 + 0.08 * phase - 0.035 * rebound);
}

function sampleWave(action, time, pose) {
  if (time <= action.start || time >= action.end) return;
  const progress = (time - action.start) / action.duration;
  const raiseEnd = 0.28;
  const lowerStart = 0.74;
  let angle;
  if (progress < raiseEnd) {
    angle = 1.9 * smoothStep(progress / raiseEnd);
  } else if (progress < lowerStart) {
    const phase = (progress - raiseEnd) / (lowerStart - raiseEnd);
    const oscillation = 0.19 * Math.sin(TWO_PI * 2.5 * phase) * Math.sin(Math.PI * phase) ** 2;
    angle = 1.9 + oscillation;
  } else {
    angle = 1.9 * (1 - smoothStep((progress - lowerStart) / (1 - lowerStart)));
  }

  if (action.side === 'left') pose.armLeft += angle;
  else pose.armRight -= angle;
}

function sampleNod(action, time, pose) {
  if (time <= action.start || time >= action.end) return;
  const progress = (time - action.start) / action.duration;
  const angle = action.amount * keyframedGesture(progress, [
    [0, 0],
    [0.14, -0.12],
    [0.4, 1],
    [0.56, 0.68],
    [0.8, -0.1],
    [1, 0],
  ]);
  pose.rotation += angle;
}

function keyframedGesture(progress, keyframes) {
  for (let index = 1; index < keyframes.length; index += 1) {
    const [end, endValue] = keyframes[index];
    const [start, startValue] = keyframes[index - 1];
    if (progress <= end) {
      const local = (progress - start) / (end - start);
      return startValue + (endValue - startValue) * smoothStep(local);
    }
  }
  return 0;
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}
