import { createEmotionTrack } from '/lib/emotion.js';
import { createMotionTrack } from '/lib/motion.js';
import { createCharacter } from '/lib/character.js';
import { appearance } from './appearance.js';
import { emotions, actions, labelAt } from './story.js';

const emotion = createEmotionTrack(emotions, { transition: 0.6, seed: 17 });
const motion = createMotionTrack(actions, { bpm: 100 });
const character = createCharacter(appearance);
p5.disableFriendlyErrors = true;

new p5(p => {

  p.setup = () => {
    p.pixelDensity(1);
    p.createCanvas(1280, 720);
    p.noLoop();
    p.strokeCap(p.ROUND);
    p.textFont('sans-serif');
    window.renderFrame = ({ time, width, height, level }) => {
      if (p.width !== width || p.height !== height) p.resizeCanvas(width, height, true);
      const size = Math.min(height * 0.32, width * 0.19);
      const floor = height * 0.76;
      const face = emotion.sample(time);
      const pose = motion.sample(time);
      p.background('#142c3b');
      p.noStroke();
      p.fill('#213f4a');
      p.ellipse(width * 0.75, height * 0.87, width * 1.25, height * 0.53);
      p.fill('#31535d');
      p.rect(0, floor + size * 0.055, width, height - floor);
      const light = time < 0.8 ? 0 : Math.min(1, (time - 0.8) / 0.7);
      const pulse = time >= 4.2 && time < 5.2 ? Math.sin((time - 4.2) * Math.PI) : 0;
      const orbX = width * 0.72;
      const orbY = floor - size * (0.92 + 0.025 * Math.sin(time * 1.6));
      for (let layer = 4; layer >= 1; layer--) {
        p.fill(141, 232, 214, light * (14 + 8 * pulse));
        p.circle(orbX, orbY, size * (0.19 + layer * 0.15) * (1 + pulse * 0.4));
      }
      p.fill(193, 255, 232, light * 255);
      p.circle(orbX, orbY, size * 0.19);
      character.draw(p, { x: width * 0.31 + size * pose.x, floor, size, face, pose, level });
      p.noStroke();
      p.fill('#e8f3ed');
      p.textSize(Math.max(12, height * 0.035));
      p.textAlign(p.LEFT, p.TOP);
      p.text(labelAt(time), width * 0.07, height * 0.11);
      p.fill('#a8c6c9');
      p.textSize(Math.max(9, height * 0.019));
      p.text('情緒 × 動作 × 造型 × 本機人聲', width * 0.07, height * 0.18);
      p.textAlign(p.CENTER, p.CENTER);
      p.text('原創角色 · 音量驅動嘴型，非音素對嘴', width / 2, height * 0.92);
    };
    window.mvReady = true;
  };
}, document.body);
