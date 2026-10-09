// Hand-authored mechanical assemblies. Visual meshes and collision boxes use the same data.
const B = (p, s, style = 'panel') => ({ p, s, style });
const P = (id, name, dir, color, boxes, more = {}) => ({ id, name, dir, color, boxes, ...more });
function plateRows(prefix, count, p, s, axis, dir, color, name) {
  return Array.from({ length: count }, (_, i) => {
    const pos = [...p], size = [...s];
    size[axis] = s[axis] / count - .035;
    pos[axis] += -s[axis] / 2 + s[axis] / count * (i + .5);
    return P(`${prefix}${i + 1}`, `${name}${count > 1 ? ` ${i + 1}` : ''}`, dir, i % 2 ? 'teal' : color, [B(pos, size, prefix)]);
  });
}
function build(kind, count) {
  const pieces = [
    P('base', 'Реактивная подставка', [0, -1, 0], 'orange', [B([0, -1.105, 0], [2.46, .33, 1.94], 'base'), B([-.72, -1.51, 0], [.72, .47, .83], 'engine'), B([.72, -1.51, 0], [.72, .47, .83], 'engine')]),
    P('handle', 'Ручка-предохранитель', [0, -1, 0], 'teal', [B([1.89, 0, -.98], [.43, 1.70, .48], 'handle'), B([1.45, .64, -.18], [.62, .24, 1.50], 'handle'), B([1.45, -.64, -.18], [.62, .24, 1.50], 'handle')]),
    ...plateRows('rear', count, [0, 0, -1.19], [2.5, 2.65, .36], 0, [1, 0, 0], 'cream', 'Задняя панель'),
    P('spout', 'Носик-гипердвигатель', [0, 0, -1], 'orange', [B([-1.59, .15, .20], [.58, .94, 1.35], 'spout'), B([-1.90, .65, 1.03], [.58, 1.0, .64], 'nozzle'), B([-1.19, .15, .10], [.31, .64, 1.0], 'socket')]),
    ...plateRows('front', count, [0, 0, 1.19], [2.5, 2.65, .36], 0, [-1, 0, 0], 'cream', 'Лицевая панель'),
    ...plateRows('lid', count, [0, 1.09, 0], [2.45, .28, 1.94], 2, [0, 0, 1], 'teal', 'Сдвижная крышка'),
  ];
  const knobLid = pieces.find(p => p.id === `lid${Math.ceil(count / 2)}`);
  knobLid.boxes.push(B([0, 1.4, knobLid.boxes[0].p[2]], [.56, .34, .44], 'knob'));
  if (kind === 'medium') {
    for (const [i, z] of [-.31, .31].entries()) pieces.push(P(`beam${i + 1}`, `Термоклапан ${i + 1}`, [i ? -1 : 1, 0, 0], i ? 'orange' : 'teal', [B([0, .69, z], [1.96, .34, .54], 'beam')]));
  }
  if (kind === 'hard') {
    for (const [i, z] of [-.62, 0, .62].entries()) pieces.push(P(`beam${i + 1}`, `Теплообменник ${i + 1}`, [0, 0, -1], i === 1 ? 'orange' : 'teal', [B([0, .62, z], [1.96, .21, .54], 'beam')]));
    for (let i = 0; i < 4; i++) pieces.push(P(`rail${i + 1}`, `Рейка стабилизатора ${i + 1}`, [1, 0, 0], i % 2 ? 'cream' : 'teal', [B([-.66 + i * .44, .84, 0], [.40, .14, 1.88], 'rail')]));
  }
  pieces.push(P('core', 'Термоядро', [0, 1, 0], 'cyan', [B([0, 0, 0], [1.08, .98, 1.08], 'core')], { core: true }));
  return pieces;
}
export const LEVELS = [
  { id: 'tutorial', label: 'Стажёр', difficulty: 'Обучение', subtitle: 'Начнём с чайника. Он почти безопасен.', parts: 7, pieces: build('tutorial', 1), reaction: 'Чай готов. Чайник улетел.', stamp: 'ПОЧТИ ИСПРАВЕН', hint: 'Сними подставку по стрелке вниз.' },
  { id: 'medium', label: 'Механик', difficulty: 'Средний', subtitle: 'Внутри кое-что горячее обычного чая.', parts: 12, pieces: build('medium', 2), reaction: 'Гарантия закончилась на взлёте.', stamp: 'ГАРАНТИИ НЕТ', hint: 'Ищи свободный путь. Соседняя деталь может его перекрывать.' },
  { id: 'hard', label: 'Инженер', difficulty: 'Сложный', subtitle: 'У каждой детали есть обратная сторона.', parts: 20, pieces: build('hard', 3), reaction: 'Воду вскипятил. Орбиту — тоже.', stamp: 'КОСМИЧЕСКИЙ БРАК', hint: 'Поверни чайник: часть креплений находится сзади.' },
];
