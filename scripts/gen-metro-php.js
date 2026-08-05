// Переносит список станций из constants/metro.ts в php-proxy/metro_stations.php.
//
// Боту нужен тот же список, что и приложению: человек называет станцию
// словами, и по ней подбираются смены. Запускать после правки metro.ts:
//   node scripts/gen-metro-php.js

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
const stations = {};
for (const line of lines) {
  for (const s of line.stations) if (!stations[s]) stations[s] = line.id;
}

let php = '<?php\n'
  + '// Станции московского метро — сгенерировано из constants/metro.ts командой\n'
  + '//   node scripts/gen-metro-php.js\n'
  + '//\n'
  + '// Боту нужен тот же список, что и приложению: человек называет станцию\n'
  + '// словами («нам нужно ВДНХ»), и по ней подбираются смены. Держать список\n'
  + '// в двух местах плохо, но проще, чем тащить на хостинг сборку из TypeScript.\n\n'
  + 'return [\n';
for (const [s, id] of Object.entries(stations)) {
  php += '    ' + JSON.stringify(s) + " => '" + id + "',\n";
}
php += '];\n';

fs.writeFileSync(path.join(root, 'php-proxy/metro_stations.php'), php);
console.log('станций записано:', Object.keys(stations).length);
