export const emotions = [
  { at: 0, emotion: 'neutral', label: '平靜的起點' },
  { at: 1, emotion: 'curious', label: '好奇：發現光點' },
  { at: 4.2, emotion: 'surprised', label: '驚訝：光點亮起' },
  { at: 5.8, emotion: 'worried', label: '擔心：先停一下' },
  { at: 7, emotion: 'calm', label: '安心：呼吸與點頭' },
  { at: 10.5, emotion: 'curious', label: '好奇：慢慢靠近' },
  { at: 13, emotion: 'joy', label: '開心：認識新朋友' },
  { at: 17.8, emotion: 'calm', label: '安心：落地與收尾' },
];

export const actions = [
  { type: 'nod', start: 7.8, duration: 1.4, amount: 0.18 },
  { type: 'walk', start: 9.5, duration: 3, distance: 1.05 },
  { type: 'wave', start: 13, duration: 2.3, side: 'right' },
  { type: 'jump', start: 15.5, duration: 1.7, height: 0.28 },
];

export function labelAt(time) {
  for (let index = emotions.length - 1; index >= 0; index--) {
    if (time >= emotions[index].at) return emotions[index].label;
  }
  return emotions[0].label;
}
