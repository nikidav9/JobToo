#!/usr/bin/env python3
"""
Собирает макет приложения одним SVG: каждый экран — снимок настоящего
приложения 390×844, между ними стрелки переходов.

Снимки делает scripts/shoot-screens.mjs — запускать его перед этим скриптом.

Figma импортирует SVG как редактируемые слои: File → Place image / перетащить
файл на холст. Каждый экран приходит отдельной группой, стрелки — векторами.

Переходы берутся не на глаз, а из кода: см. EDGES, они выверены по
router.push / router.replace. Пересобрать: python3 scripts/build-flow-map.py
"""
import base64
from pathlib import Path

W, H = 390, 844          # размер экрана телефона
COL, ROW = 580, 1210     # шаг сетки: зазоры под коридоры для стрелок

ORANGE = '#FF6B1A'
INK = '#111111'
MUTED = '#9CA3AF'
LINE = '#E5E7EB'
BG = '#F5F7FA'
GREEN = '#16A34A'
BLUE = '#2563EB'
PURPLE = '#7C3AED'
RED = '#DC2626'

# ─── Описание экранов ────────────────────────────────────────────────────
# col/row — место в сетке. body — схематичное содержимое, список блоков:
#   ('h', текст)        заголовок экрана
#   ('t', текст)        строка текста
#   ('b', текст)        кнопка (заливка)
#   ('o', текст)        кнопка-контур
#   ('card', [строки])  карточка
#   ('chips', [текст])  ряд чипов
#   ('row', текст)      строка списка со стрелкой
#   ('tabs', [текст])   вкладки
#   ('gap',)            отступ
#   ('nav',)            нижняя панель вкладок

SCREENS = [
    # ── Вход и регистрация ───────────────────────────────────────────
    dict(id='index',              title='Стартовый экран',        file='app/index.tsx',              zone=0, col=0, row=0),
    dict(id='register-worker',    title='Регистрация работника',  file='app/register-worker.tsx',    zone=0, col=1, row=0),
    dict(id='register-employer',  title='Регистрация работодателя',file='app/register-employer.tsx', zone=0, col=2, row=0),
    dict(id='login',              title='Вход',                   file='app/login.tsx',              zone=0, col=3, row=0),

    # ── Работник: вкладки ────────────────────────────────────────────
    dict(id='feed-shift', title='Поиск · Смены',  file='app/(tabs)/feed.tsx',     zone=1, col=0, row=1),
    dict(id='matches',    title='Мои отклики',    file='app/(tabs)/matches.tsx',  zone=1, col=1, row=1),
    dict(id='exchange',   title='Биржа',          file='app/(tabs)/exchange.tsx', zone=1, col=2, row=1),
    dict(id='chats',      title='Сообщения',      file='app/(tabs)/chats.tsx',    zone=1, col=3, row=1),
    dict(id='profile',    title='Профиль',        file='app/(tabs)/profile.tsx',  zone=1, col=4, row=1),

    # ── Работник: вторичные экраны ───────────────────────────────────
    dict(id='chat-room',           title='Чат',                  file='app/chat-room.tsx',           zone=2, col=0, row=2),
    dict(id='perm-vacancy-detail', title='Вакансия',             file='app/perm-vacancy-detail.tsx', zone=2, col=1, row=2),
    dict(id='user-profile',        title='Профиль работодателя', file='app/user-profile.tsx',        zone=2, col=2, row=2),
    dict(id='match',               title='Мэтч',                 file='app/match.tsx',               zone=2, col=3, row=2),
    dict(id='rate',                title='Оценка смены',         file='app/rate.tsx',                zone=2, col=4, row=2),
    dict(id='legal',               title='Документы',            file='app/legal.tsx',               zone=2, col=5, row=2),

    # ── Работодатель ─────────────────────────────────────────────────
    dict(id='feed-employer',       title='Кабинет работодателя', file='app/(tabs)/feed.tsx',          zone=3, col=0, row=3),
    dict(id='matches-employer',    title='Отклики на смены',     file='app/(tabs)/matches.tsx',       zone=3, col=1, row=3),
    dict(id='create-vacancy',      title='Создание смены',       file='app/create-vacancy.tsx',       zone=3, col=2, row=3),
    dict(id='create-perm-vacancy', title='Создание вакансии',    file='app/create-perm-vacancy.tsx',  zone=3, col=3, row=3),
    dict(id='perm-applications',   title='Отклики на вакансии',  file='app/perm-applications.tsx',    zone=3, col=4, row=3),
    dict(id='profile-employer',    title='Профиль компании',     file='app/(tabs)/profile.tsx',       zone=3, col=5, row=3),
    dict(id='candidates',          title='Кандидаты',            file='app/candidates.tsx',           zone=3, col=6, row=3, orphan=True),
]

# ─── Переходы (из router.push / router.replace) ──────────────────────────
# (откуда, куда, подпись, стиль). Стиль: 'n' обычный, 'r' замена экрана.
EDGES = [
    ('index', 'register-worker', 'Ищу подработку', 'n'),
    ('index', 'register-employer', 'Ищу работника', 'n'),
    ('index', 'login', 'Войти', 'n'),
    ('index', 'feed-shift', 'уже вошёл', 'r'),
    ('register-worker', 'feed-shift', 'после регистрации', 'r'),
    ('register-employer', 'feed-employer', 'после регистрации', 'r'),
    ('register-worker', 'login', 'есть аккаунт', 'n'),
    ('register-worker', 'legal', 'документы', 'n'),
    ('login', 'feed-shift', 'вход выполнен', 'r'),

    ('feed-shift', 'match', 'взаимный лайк', 'n'),
    ('feed-shift', 'chat-room', 'написать', 'n'),
    ('feed-shift', 'perm-vacancy-detail', 'вкладка «Работа»', 'n'),
    ('matches', 'chat-room', 'Чат', 'n'),
    ('matches', 'user-profile', 'Профиль ›', 'n'),
    ('matches', 'rate', 'оценить смену', 'n'),
    ('exchange', 'chat-room', 'отклик на объявление', 'n'),
    ('chats', 'chat-room', 'открыть диалог', 'n'),
    ('profile', 'legal', 'Документы', 'n'),

    ('chat-room', 'user-profile', 'имя в шапке', 'n'),
    ('perm-vacancy-detail', 'user-profile', 'Профиль →', 'n'),
    ('match', 'chat-room', 'Написать в чат', 'n'),
    ('rate', 'feed-shift', 'после оценки', 'r'),

    ('feed-employer', 'create-vacancy', 'создать смену', 'n'),
    ('feed-employer', 'create-perm-vacancy', 'создать вакансию', 'n'),
    ('feed-employer', 'perm-applications', 'отклики', 'n'),
    ('feed-employer', 'candidates', 'кто откликнулся', 'n'),
    ('matches-employer', 'chat-room', 'Чат', 'n'),
    ('perm-applications', 'user-profile', 'Профиль ›', 'n'),
    ('profile-employer', 'legal', 'Документы', 'n'),
]

# Переходы из системных мест — их рисуем отдельной пометкой
GLOBAL_NOTES = [
    'Пуш и колокольчик → чат, Мэтчи, Лента или Биржа (services/notificationRoute.ts)',
    'Нижняя панель переключает 5 вкладок: Поиск · Мэтчи · Биржа · Чаты · Профиль',
]

ZONE_TITLES = {
    0: ('Вход и регистрация', '#8B5CF6'),
    1: ('Работник · вкладки', ORANGE),
    2: ('Работник · вторичные', BLUE),
    3: ('Работодатель', GREEN),
}


def esc(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def frame_xy(sc):
    return 80 + sc['col'] * COL, 200 + sc['row'] * ROW


def shot_href(sid):
    """Снимок экрана как data-URI: Figma импортирует SVG одним файлом,
    внешние ссылки на картинки она не подтянет."""
    f = Path(__file__).resolve().parent.parent / 'docs' / 'screens' / f'{sid}.png'
    if not f.exists():
        return None
    return 'data:image/png;base64,' + base64.b64encode(f.read_bytes()).decode()


def build():
    by_id = {s['id']: s for s in SCREENS}
    max_col = max(s['col'] for s in SCREENS)
    max_row = max(s['row'] for s in SCREENS)
    total_w = 160 + (max_col + 1) * COL
    total_h = 300 + (max_row + 1) * ROW

    o = []
    o.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{total_w}" height="{total_h}" '
             f'viewBox="0 0 {total_w} {total_h}" font-family="Inter, -apple-system, Segoe UI, Roboto, sans-serif">')
    o.append(f'<rect width="{total_w}" height="{total_h}" fill="#FAFAF8"/>')
    o.append('<defs>'
             f'<marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
             f'<path d="M 0 0 L 10 5 L 0 10 z" fill="{ORANGE}"/></marker>'
             f'<marker id="ar2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
             f'<path d="M 0 0 L 10 5 L 0 10 z" fill="{PURPLE}"/></marker>'
             '</defs>')

    # Шапка листа
    o.append(f'<text x="80" y="72" font-size="40" font-weight="800" fill="{INK}">JobToo — карта экранов</text>')
    o.append(f'<text x="80" y="106" font-size="16" fill="{MUTED}">'
             f'{len(SCREENS)} экранов, {len(EDGES)} переходов. Снимки настоящего приложения, '
             f'переходы выписаны из router.push/replace</text>')
    lx = 80
    for _, (zt, zc) in sorted(ZONE_TITLES.items()):
        o.append(f'<rect x="{lx}" y="126" width="14" height="14" rx="4" fill="{zc}"/>')
        o.append(f'<text x="{lx+22}" y="138" font-size="13" fill="{INK}">{esc(zt)}</text>')
        lx += 40 + len(zt) * 8
    o.append(f'<line x1="{lx+10}" y1="133" x2="{lx+50}" y2="133" stroke="{PURPLE}" stroke-width="2" stroke-dasharray="6 4" marker-end="url(#ar2)"/>')
    o.append(f'<text x="{lx+58}" y="138" font-size="13" fill="{INK}">замена экрана (назад нельзя)</text>')

    # ── Стрелки ──────────────────────────────────────────────────────
    # Ведём ортогонально по коридорам между фреймами: вниз из нижней грани,
    # горизонтально по «полосе» в промежутке между рядами, вертикально по
    # промежутку между колонками — и в верхнюю грань цели. Так линия
    # никогда не проходит сквозь экран.
    GUT = ROW - H                     # высота промежутка между рядами
    def lane_y(r, k):                 # полоса k в промежутке под рядом r
        return 200 + r * ROW + H + 34 + (k % 9) * 30

    def corridor_x(c):                # вертикальный коридор слева от колонки c
        return 80 + c * COL - (COL - W) / 2

    lane_used = {}
    def next_lane(r):
        lane_used[r] = lane_used.get(r, 0) + 1
        return lane_used[r] - 1

    for src, dst, label, style in EDGES:
        a, b = by_id[src], by_id[dst]
        ax, ay = frame_xy(a)
        bx, by_ = frame_xy(b)
        acx, bcx = ax + W / 2, bx + W / 2
        col = PURPLE if style == 'r' else ORANGE
        dash = ' stroke-dasharray="6 4"' if style == 'r' else ''
        marker = 'ar2' if style == 'r' else 'ar'

        if a['row'] == b['row'] and abs(a['col'] - b['col']) == 1:
            # соседи в ряду — короткая прямая между обращёнными гранями
            if bx > ax:
                pts = [(ax + W, ay + H / 2), (bx, by_ + H / 2)]
            else:
                pts = [(ax, ay + H / 2), (bx + W, by_ + H / 2)]
            lx, ly = (pts[0][0] + pts[1][0]) / 2, pts[0][1] - 10
        elif a['row'] == b['row']:
            # тот же ряд, но далеко — ныряем в промежуток под рядом
            ly_ = lane_y(a['row'], next_lane(a['row']))
            pts = [(acx, ay + H), (acx, ly_), (bcx, ly_), (bcx, by_ + H)]
            lx, ly = (acx + bcx) / 2, ly_ - 6
        else:
            down = b['row'] > a['row']
            # полоса рядом с источником и рядом с целью
            r1 = a['row'] if down else a['row'] - 1
            r2 = b['row'] - 1 if down else b['row']
            y1 = lane_y(r1, next_lane(r1))
            if r1 == r2:
                pts = [(acx, ay + H if down else ay), (acx, y1), (bcx, y1),
                       (bcx, by_ if down else by_ + H)]
                lx, ly = (acx + bcx) / 2, y1 - 6
            else:
                y2 = lane_y(r2, next_lane(r2))
                cx_ = corridor_x(b['col'] if bcx > acx else b['col'] + 1)
                pts = [(acx, ay + H if down else ay), (acx, y1), (cx_, y1),
                       (cx_, y2), (bcx, y2), (bcx, by_ if down else by_ + H)]
                lx, ly = (acx + cx_) / 2, y1 - 6
        d = 'M ' + ' L '.join(f'{px} {py}' for px, py in pts)
        o.append(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="2" '
                 f'opacity="0.8"{dash} stroke-linejoin="round" marker-end="url(#{marker})"/>')
        tw = 12 + len(label) * 6.2
        o.append(f'<rect x="{lx-tw/2}" y="{ly-13}" width="{tw}" height="19" rx="9" fill="#FAFAF8" stroke="{col}" stroke-opacity="0.35"/>')
        o.append(f'<text x="{lx}" y="{ly}" font-size="11" fill="{col}" text-anchor="middle">{esc(label)}</text>')

    # Фреймы
    for sc in SCREENS:
        x, y = frame_xy(sc)
        zc = ZONE_TITLES[sc['zone']][1]
        o.append(f'<g id="{sc["id"]}">')
        # подпись фрейма — как имя слоя в Figma
        o.append(f'<text x="{x}" y="{y-30}" font-size="17" font-weight="700" fill="{INK}">{esc(sc["title"])}</text>')
        o.append(f'<text x="{x}" y="{y-12}" font-size="11.5" fill="{MUTED}" font-family="monospace">{esc(sc["file"])}</text>')
        href = shot_href(sc['id'])
        o.append(f'<clipPath id="clip-{sc["id"]}"><rect x="{x}" y="{y}" width="{W}" height="{H}" rx="34"/></clipPath>')
        if href:
            o.append(f'<image x="{x}" y="{y}" width="{W}" height="{H}" href="{href}" '
                     f'clip-path="url(#clip-{sc["id"]})" preserveAspectRatio="xMidYMin slice"/>')
        else:
            o.append(f'<rect x="{x}" y="{y}" width="{W}" height="{H}" rx="34" fill="{BG}"/>')
        o.append(f'<rect x="{x}" y="{y}" width="{W}" height="{H}" rx="34" fill="none" stroke="{zc}" stroke-width="2.5"/>')
        if sc.get('orphan'):
            o.append(f'<rect x="{x+W-118}" y="{y-30}" width="112" height="22" rx="11" fill="#FEF2F2" stroke="{RED}"/>')
            o.append(f'<text x="{x+W-62}" y="{y-15}" font-size="10.5" fill="{RED}" text-anchor="middle">нет входа в код</text>')
        o.append('</g>')

    # Примечания внизу
    ny = 200 + (max_row + 1) * ROW - 120
    o.append(f'<text x="80" y="{ny}" font-size="15" font-weight="700" fill="{INK}">Отдельно</text>')
    for i, note in enumerate(GLOBAL_NOTES):
        o.append(f'<text x="80" y="{ny+26+i*22}" font-size="13" fill="{MUTED}">• {esc(note)}</text>')

    o.append('</svg>')
    return '\n'.join(o)


if __name__ == '__main__':
    out = Path(__file__).resolve().parent.parent / 'docs' / 'jobtoo-flow-map.svg'
    out.parent.mkdir(exist_ok=True)
    out.write_text(build(), encoding='utf-8')
    print(f'{out}  ({out.stat().st_size // 1024} KB, {len(SCREENS)} экранов, {len(EDGES)} переходов)')
