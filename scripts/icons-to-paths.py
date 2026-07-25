#!/usr/bin/env python3
"""
Заменяет иконки-глифы в выгруженных SVG на векторные контуры.

Иконки в приложении — это шрифт (Ionicons и родня). В Figma такого шрифта
нет, и глиф превращается в пустой квадрат. Здесь достаём контур глифа из
самого ttf и подставляем <path> — иконка становится обычной векторной
фигурой, её можно красить и масштабировать.

Запускать после scripts/shoot-screens.mjs:
    python3 scripts/icons-to-paths.py
"""
import re
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parent.parent
VEC = ROOT / 'docs' / 'screens-vector'
FONT_DIR = ROOT / '.figma-export' / 'assets' / 'node_modules' / '@expo' / 'vector-icons' / \
    'build' / 'vendor' / 'react-native-vector-icons' / 'Fonts'

MARKER = re.compile(
    r'<g data-icon="([^"]+)" data-cp="([0-9a-f]+)" '
    r'data-x="([-\d.]+)" data-y="([-\d.]+)" '
    r'data-size="([\d.]+)" data-fill="([^"]*)"></g>'
)

_fonts: dict[str, tuple] = {}


def load_font(family: str):
    """Шрифт по имени семейства. Файлы лежат с хешем в имени, ищем по префиксу."""
    if family in _fonts:
        return _fonts[family]
    # CSS отдаёт семейство в нижнем регистре («ionicons»), а файл назван
    # «Ionicons.<хеш>.ttf» — ищем без учёта регистра
    low = family.lower()
    hits = [p for p in sorted(FONT_DIR.glob('*.ttf'))
            if p.name.lower().split('.')[0] == low]
    if not hits:
        _fonts[family] = (None, None, None)
        return _fonts[family]
    tt = TTFont(hits[0])
    cmap = tt.getBestCmap()
    upm = tt['head'].unitsPerEm
    _fonts[family] = (tt, cmap, upm)
    return _fonts[family]


def glyph_path(family: str, codepoint: int):
    tt, cmap, upm = load_font(family)
    if tt is None:
        return None, None
    name = cmap.get(codepoint)
    if not name:
        return None, None
    glyphset = tt.getGlyphSet()
    pen = SVGPathPen(glyphset)
    glyphset[name].draw(pen)
    return pen.getCommands(), upm


def convert(svg_text: str) -> tuple[str, int, int]:
    done = missed = 0

    def repl(m):
        nonlocal done, missed
        family, cp_hex, x, y, size, fill = m.groups()
        d, upm = glyph_path(family, int(cp_hex, 16))
        if not d:
            missed += 1
            # Не нашли — оставляем пустую группу, чтобы не рисовать квадрат
            return ''
        done += 1
        # Глиф задан в единицах шрифта с осью Y вверх, а в SVG она вниз:
        # масштабируем и отражаем, ставя начало координат на базовую линию.
        k = float(size) / upm
        return (f'<g data-name="icon" transform="translate({x} {y}) scale({k:.6f} {-k:.6f})">'
                f'<path d="{d}" fill="{fill}"/></g>')

    return MARKER.sub(repl, svg_text), done, missed


def main():
    if not FONT_DIR.exists():
        sys.exit(f'Не найдены шрифты иконок: {FONT_DIR}\n'
                 f'Сначала соберите веб-версию: npx expo export -p web --output-dir .figma-export')
    files = sorted(VEC.glob('*.svg'))
    if not files:
        sys.exit(f'Нет файлов в {VEC} — сначала запустите scripts/shoot-screens.mjs')

    total_done = total_missed = 0
    for f in files:
        text = f.read_text(encoding='utf-8')
        new, done, missed = convert(text)
        if done or missed:
            f.write_text(new, encoding='utf-8')
        total_done += done
        total_missed += missed
    print(f'иконок переведено в контуры: {total_done}'
          + (f', не найдено: {total_missed}' if total_missed else ''))


if __name__ == '__main__':
    main()
