/**
 * 原創幾何角色。性別為身分資料，不替使用者推斷髮型、髮色或身體特徵。
 * 建立時固定造型；draw 使用情緒／動作取樣值，不保留前一畫格狀態。
 */
export function createCharacter(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('角色造型必須是物件。');
  }
  const { gender = 'neutral', hairstyle = 'short', hairColor = '#51382d' } = options;
  if (!['neutral', 'female', 'male', 'nonbinary'].includes(gender)) {
    throw new TypeError('gender 只接受 neutral、female、male、nonbinary。');
  }
  if (!['none', 'short', 'bob', 'long', 'ponytail'].includes(hairstyle)) {
    throw new TypeError('hairstyle 只接受 none、short、bob、long、ponytail。');
  }
  if (typeof hairColor !== 'string' || !/^#[\da-f]{6}$/i.test(hairColor)) {
    throw new TypeError('hairColor 必須是 #RRGGBB 色碼。');
  }
  const appearance = Object.freeze({ gender, hairstyle, hairColor });

  function draw(p, { x, floor, size, face, pose, level = 0 }) {
    p.push();
    p.noStroke();
    p.fill(8, 29, 43, 60);
    p.ellipse(x, floor + size * 0.035, size * Math.max(0.45, 0.95 + pose.y), size * 0.09);
    p.translate(x, floor + size * pose.y);
    p.scale(size);
    const breathing = 1 + face.breath * 1.7;
    p.scale(pose.scaleX / breathing, pose.scaleY * breathing);
    p.rotate(pose.rotation + face.tilt * 2);
    limb(p, -0.16, -0.24, 0.24, pose.legLeft, '#355367');
    limb(p, 0.16, -0.24, 0.24, pose.legRight, '#355367');
    limb(p, -0.3, -0.65, 0.33, pose.armLeft, '#d89848');
    limb(p, 0.3, -0.65, 0.33, pose.armRight, '#d89848');
    p.noStroke();
    p.fill(hairColor);
    if (hairstyle === 'bob') {
      p.rect(-0.49, -1.28, 0.98, 0.69, 0.17);
    } else if (hairstyle === 'long') {
      p.rect(-0.5, -1.3, 1, 1.02, 0.2);
    } else if (hairstyle === 'ponytail') {
      p.ellipse(0.47, -0.95, 0.38, 0.83);
    }
    p.fill('#eab465');
    p.ellipse(0, -0.51, 0.68, 0.75);
    p.fill('#ffe0a2');
    p.ellipse(0, -0.99, 0.91, 0.85);
    if (hairstyle !== 'none') {
      p.fill(hairColor);
      p.beginShape();
      p.vertex(-0.455, -1.04);
      p.bezierVertex(-0.54, -1.57, 0.48, -1.62, 0.455, -1.04);
      p.vertex(0.36, -1.2);
      if (hairstyle === 'short') {
        p.vertex(0.23, -1.29);
        p.vertex(0.08, -1.205);
        p.vertex(-0.02, -1.29);
        p.vertex(-0.19, -1.21);
        p.vertex(-0.33, -1.28);
      } else {
        p.bezierVertex(0.2, -1.36, -0.05, -1.36, -0.36, -1.21);
      }
      p.endShape(p.CLOSE);
      if (hairstyle === 'ponytail') {
        p.fill('#8de8d6');
        p.ellipse(0.45, -1.19, 0.09, 0.13);
      }
    }
    p.fill(239, 112, 96, 190 * face.blush);
    p.ellipse(-0.29, -0.91, 0.15, 0.075);
    p.ellipse(0.29, -0.91, 0.15, 0.075);
    eye(p, -0.17, face.eyeOpenLeft, face);
    eye(p, 0.17, face.eyeOpenRight, face);
    eyebrow(p, -0.17, face.browLeft, face.browLift);
    eyebrow(p, 0.17, face.browRight, face.browLift);
    const speaking = Math.min(0.9, level * 9);
    const opening = Math.max(face.mouthOpen, speaking);
    if (opening > 0.08) {
      p.noStroke();
      p.fill('#593e42');
      p.ellipse(0, -0.82, 0.2 + 0.08 * Math.max(0, face.smile), 0.025 + opening * 0.2);
      p.fill('#e9a09b');
      p.ellipse(0, -0.82 + opening * 0.055, 0.13, opening * 0.035);
    } else {
      p.noFill();
      p.stroke('#754b35');
      p.strokeWeight(0.019);
      p.bezier(-0.12, -0.825, -0.05, -0.825 + face.smile * 0.095, 0.05, -0.825 + face.smile * 0.095, 0.12, -0.825);
    }
    p.pop();
  }

  return Object.freeze({ appearance, draw });
}

function limb(p, x, y, length, angle, color) {
  p.push();
  p.translate(x, y);
  p.rotate(angle);
  p.stroke(color);
  p.strokeWeight(0.075);
  p.line(0, 0, 0, length);
  p.pop();
}

function eye(p, x, open, face) {
  p.noStroke();
  p.fill('#fffaf0');
  p.ellipse(x, -1.015, 0.155, 0.19 * open);
  p.fill('#183747');
  p.ellipse(x + face.gazeX * 0.045, -1.015 + face.gazeY * 0.035 * open, 0.063, 0.09 * open);
}

function eyebrow(p, x, angle, lift) {
  p.push();
  p.translate(x, -1.155 - lift);
  p.rotate(angle);
  p.stroke('#754b35');
  p.strokeWeight(0.023);
  p.line(-0.075, 0, 0.075, 0);
  p.pop();
}
