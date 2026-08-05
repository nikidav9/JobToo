// Переносит схему метро из constants/metro.ts в php-proxy/metro_stations.php.
//
// Боту нужен тот же справочник, что и приложению — но не только названия.
// Чтобы честно сказать «на вашей ветке, 6 остановок», нужны ещё ветки и
// позиции станций на них: Медведково и Ясенево тоже «одна ветка», а ехать
// час, и звать туда человека было бы обманом.
//
// Запускать после правки metro.ts:  node scripts/gen-metro-php.js

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'constants/metro.ts'), 'utf8');
const match = src.match(/export const METRO_LINES = (\[[\s\S]*?\n\]);/);
if (!match) {
  console.error('METRO_LINES не найден в constants/metro.ts');
  process.exit(1);
}

const lines = eval(match[1]);

// Станция → список [ветка, позиция]: пересадочные лежат на нескольких ветках.
const stations = {};
for (const line of lines) {
  line.stations.forEach((s, i) => {
    (stations[s] ??= []).push([line.id, i]);
  });
}

const q = s => JSON.stringify(s);

let php = '<?php\n'
  + '// Схема московского метро — сгенерировано из constants/metro.ts командой\n'
  + '//   node scripts/gen-metro-php.js\n'
  + '//\n'
  + '// Боту нужен тот же справочник, что и приложению: человек называет станцию\n'
  + '// словами («нам нужно ВДНХ»), и по ней подбираются смены. Позиции нужны,\n'
  + '// чтобы считать расстояние в остановках — «одна ветка» без этого означает\n'
  + '// и соседнюю станцию, и час дороги.\n\n'
  + 'return [\n'
  + "    'lines' => [\n";
for (const line of lines) php += `        ${q(line.id)} => ${q(line.name)},\n`;
php += '    ],\n'
  + "    'stations' => [\n";
for (const [s, on] of Object.entries(stations)) {
  const pairs = on.map(([id, i]) => `[${q(id)}, ${i}]`).join(', ');
  php += `        ${q(s)} => [${pairs}],\n`;
}
php += '    ],\n];\n';

fs.writeFileSync(path.join(root, 'php-proxy/metro_stations.php'), php);
console.log('веток:', lines.length, 'станций:', Object.keys(stations).length);
