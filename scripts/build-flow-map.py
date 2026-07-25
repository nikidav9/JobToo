#!/usr/bin/env python3
"""
Собирает макет приложения одним SVG: каждый экран — фрейм 390×844 с
вайрфреймом, между ними стрелки переходов.

Figma импортирует SVG как редактируемые слои: File → Place image / перетащить
файл на холст. Каждый экран приходит отдельной группой, стрелки — векторами.

Переходы берутся не на глаз, а из кода: см. EDGES, они выверены по
router.push / router.replace. Пересобрать: python3 scripts/build-flow-map.py
"""
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
    # ── Вход в приложение ────────────────────────────────────────────
    dict(id='index', title='Стартовый экран', file='app/index.tsx', zone=0, col=0, row=0, body=[
        ('h', 'JobToo'), ('t', 'Подработки на складах в Москве'), ('gap',),
        ('t', 'Выберите, кто вы'),
        ('card', ['Ищу подработку', 'Смены на складах']),
        ('card', ['Ищу работника', 'Размещайте вакансии']),
        ('gap',), ('t', 'Уже есть аккаунт? Войти'),
    ]),
    dict(id='register-worker', title='Регистрация работника', file='app/register-worker.tsx', zone=0, col=1, row=0, body=[
        ('h', 'Регистрация'), ('t', 'Имя, фамилия, телефон'),
        ('row', 'Пароль'), ('row', 'Метро'), ('row', 'Специализация'),
        ('gap',), ('b', 'Зарегистрироваться'), ('t', 'Согласие с документами'),
    ]),
    dict(id='register-employer', title='Регистрация работодателя', file='app/register-employer.tsx', zone=0, col=2, row=0, body=[
        ('h', 'Регистрация'), ('t', 'Имя, фамилия, телефон'),
        ('row', 'Компания'), ('row', 'Пароль'),
        ('gap',), ('b', 'Зарегистрироваться'), ('t', 'Согласие с документами'),
    ]),
    dict(id='login', title='Вход', file='app/login.tsx', zone=0, col=3, row=0, body=[
        ('h', 'Вход'), ('row', 'Телефон'), ('row', 'Пароль'),
        ('gap',), ('b', 'Войти'), ('t', 'Нет аккаунта? Зарегистрироваться'),
    ]),

    # ── Основные вкладки ─────────────────────────────────────────────
    dict(id='feed-shift', title='Поиск · Смены', file='app/(tabs)/feed.tsx', zone=1, col=0, row=1, body=[
        ('h', 'JobToo'), ('chips', ['Смены', 'Работа']),
        ('chips', ['Пн 27', 'Вт 28', 'Ср 29', '📍']),
        ('card', ['Кладовщик', 'Лавка · Пятницкое шоссе', '07:00–16:00 · Пн 27.07',
                  'Отклики 3 · Просмотры 9', 'Подробности и нормативы']),
        ('chips', ['↩', '✕', '💬', '♥']),
        ('nav',),
    ]),
    dict(id='feed-perm', title='Поиск · Работа', file='app/(tabs)/feed.tsx', zone=1, col=1, row=1, body=[
        ('h', 'JobToo'), ('chips', ['Смены', 'Работа']),
        ('chips', ['Поиск вакансий…', 'Карта']),
        ('tabs', ['Открытые', 'Откликнулись', 'Избранное']),
        ('card', ['Кладовщик', '80 000 ₽/мес', 'м. Пионерская',
                  'ул. Полосухина, 1/28', 'Откликнуться  💬 ↗ ♥']),
        ('nav',),
    ]),
    dict(id='matches', title='Мои отклики', file='app/(tabs)/matches.tsx', zone=1, col=2, row=1, body=[
        ('h', 'Мои отклики'), ('tabs', ['Активные', 'Отказ', 'Завершено']),
        ('card', ['♥ Мэтч!', 'Кладовщик          Подробнее ›', 'Лавка · Пятницкое шоссе',
                  'Пн 27.07 · 07:00–16:00', '📍 ул. Полосухина, 1/28',
                  'Лавка ★5.0        Профиль ›', 'Чат   Ждём подтверждения']),
        ('nav',),
    ]),
    dict(id='exchange', title='Биржа', file='app/(tabs)/exchange.tsx', zone=1, col=3, row=1, body=[
        ('h', 'Биржа'), ('tabs', ['Активные', 'Закрытые']),
        ('card', ['Лавка — сборка', 'Дата · время', 'Метро · адрес', 'Откликнуться']),
        ('gap',), ('b', 'Новое объявление'),
        ('nav',),
    ]),
    dict(id='chats', title='Сообщения', file='app/(tabs)/chats.tsx', zone=1, col=4, row=1, body=[
        ('h', 'Сообщения'), ('row', 'Поиск по чатам…'),
        ('card', ['Сергей Манолий', 'Кладовщик', 'Здравствуйте! …']),
        ('card', ['Лавка', 'Комплектовщик', 'Смена подтверждена']),
        ('nav',),
    ]),
    dict(id='profile', title='Профиль', file='app/(tabs)/profile.tsx', zone=1, col=5, row=1, body=[
        ('h', 'Профиль'),
        ('card', ['Максим Фёдоров', 'Работник · +7 …', '★ 5.0 (1 отз.)']),
        ('row', 'Личные данные'), ('row', 'Специализация'), ('row', 'Метро'),
        ('row', 'О себе'), ('row', 'Документы'), ('row', 'Аккаунт'),
        ('nav',),
    ]),

    # ── Вторичные экраны ─────────────────────────────────────────────
    dict(id='chat-room', title='Чат', file='app/chat-room.tsx', zone=2, col=0, row=2, body=[
        ('h', 'Сергей Манолий'), ('t', '● в сети'),
        ('t', '💼 Кладовщик · 📅 Пн 27.07 · 📍 адрес'),
        ('card', ['Принять решение по кандидату:', 'Не подходит      Подходит']),
        ('gap',), ('t', 'Сегодня'),
        ('card', ['Здравствуйте! Есть опыт?']),
        ('chips', ['Опыт в Лавке?', 'Подтвердите выход']),
        ('row', '＋   Сообщение              ➤'),
    ]),
    dict(id='perm-vacancy-detail', title='Вакансия', file='app/perm-vacancy-detail.tsx', zone=2, col=1, row=2, body=[
        ('h', 'Кладовщик'), ('t', 'Лавка'),
        ('chips', ['80 000 ₽/мес', '5/2 07:00–16:00']),
        ('t', 'Расположение'), ('row', 'Пионерская'), ('row', 'ул. Полосухина, 1/28'),
        ('t', 'Работодатель'), ('row', 'Лавка              Профиль →'),
        ('gap',), ('chips', ['♥ Сохранить', 'Откликнуться']),
    ]),
    dict(id='create-vacancy', title='Создание смены', file='app/create-vacancy.tsx', zone=2, col=2, row=2, body=[
        ('h', 'Новая смена'), ('row', 'Тип работы'), ('row', 'Дата · время'),
        ('row', 'Метро'), ('row', 'Адрес (подсказки)'), ('row', 'Нормативы и оплата'),
        ('row', 'Сколько человек'), ('gap',), ('b', 'Опубликовать'),
    ]),
    dict(id='create-perm-vacancy', title='Создание вакансии', file='app/create-perm-vacancy.tsx', zone=2, col=3, row=2, body=[
        ('h', 'Новая вакансия'), ('row', 'Должность'), ('row', 'Зарплата'),
        ('row', 'График'), ('row', 'Метро'), ('row', 'Адрес (подсказки)'),
        ('row', 'Описание'), ('gap',), ('b', 'Опубликовать'),
    ]),
    dict(id='perm-applications', title='Отклики на вакансии', file='app/perm-applications.tsx', zone=2, col=4, row=2, body=[
        ('h', 'Отклики'), ('tabs', ['Новые', 'Приглашены', 'Отказы']),
        ('card', ['Максим Фёдоров', 'Кладовщик', 'Профиль ›', 'Чат   Пригласить   Отказать']),
    ]),
    dict(id='user-profile', title='Профиль пользователя', file='app/user-profile.tsx', zone=2, col=5, row=2, body=[
        ('h', 'Профиль'),
        ('card', ['Сергей Манолий', 'Работодатель', '★ 5.0 · 1 отзыв']),
        ('tabs', ['Профиль', 'Отзывы']),
        ('t', 'Основная информация'), ('row', 'Компания           Лавка'),
    ]),
    dict(id='match', title='Мэтч', file='app/match.tsx', zone=2, col=0, row=3, body=[
        ('h', 'Мэтч!'), ('t', 'Вы понравились друг другу'),
        ('card', ['ДЕТАЛИ СМЕНЫ', 'Кладовщик · Лавка', 'Пн 27.07 · 07:00–16:00']),
        ('card', ['КОНТАКТ', '+7 …']),
        ('gap',), ('b', 'Написать в чат'), ('o', 'Продолжить поиск'),
    ]),
    dict(id='rate', title='Оценка смены', file='app/rate.tsx', zone=2, col=1, row=3, body=[
        ('h', 'Как прошла смена?'), ('t', '★ ★ ★ ★ ★'),
        ('row', 'Комментарий'), ('gap',),
        ('b', 'Отправить оценку'), ('o', 'Пропустить'),
    ]),
    dict(id='legal', title='Документы', file='app/legal.tsx', zone=2, col=2, row=3, body=[
        ('h', 'Документ'), ('t', 'Пользовательское соглашение'),
        ('t', 'Политика конфиденциальности'), ('t', 'Согласие на обработку данных'),
    ]),

    # ── Не связаны навигацией ────────────────────────────────────────
    dict(id='candidates', title='Кандидаты', file='app/candidates.tsx', zone=3, col=3, row=3, orphan=True, body=[
        ('h', 'Кандидаты'), ('card', ['Имя', 'Специальность', 'Телефон', 'Профиль ›']),
    ]),
    dict(id='admin', title='Админка', file='app/admin.tsx', zone=3, col=4, row=3, orphan=True, body=[
        ('h', 'Админка'), ('row', 'Аналитика'),
    ]),
    dict(id='analytics', title='Аналитика', file='app/analytics.tsx', zone=3, col=5, row=3, orphan=True, body=[
        ('h', 'Аналитика'), ('t', 'Пользователи · Вакансии'),
        ('t', 'Оценки и заявки'), ('t', 'Рост за 30 дней'),
    ]),
]

# ─── Переходы (из router.push / router.replace) ──────────────────────────
# (откуда, куда, подпись, стиль). Стиль: 'n' обычный, 'r' замена экрана.
EDGES = [
    ('index', 'register-worker', 'Ищу подработку', 'n'),
    ('index', 'register-employer', 'Ищу работника', 'n'),
    ('index', 'login', 'Войти', 'n'),
    ('index', 'feed-shift', 'уже вошёл', 'r'),
    ('register-worker', 'feed-shift', 'после регистрации', 'r'),
    ('register-employer', 'feed-shift', 'после регистрации', 'r'),
    ('register-worker', 'login', 'есть аккаунт', 'n'),
    ('register-employer', 'login', 'есть аккаунт', 'n'),
    ('register-worker', 'legal', 'документы', 'n'),
    ('register-employer', 'legal', 'документы', 'n'),
    ('login', 'feed-shift', 'вход выполнен', 'r'),

    ('feed-shift', 'feed-perm', 'переключатель', 'n'),
    ('feed-shift', 'match', 'взаимный лайк', 'n'),
    ('feed-shift', 'chat-room', 'написать', 'n'),
    ('feed-shift', 'create-vacancy', 'создать смену', 'n'),
    ('feed-perm', 'perm-vacancy-detail', 'карточка / ⓘ', 'n'),
    ('feed-perm', 'create-perm-vacancy', 'создать вакансию', 'n'),
    ('feed-perm', 'perm-applications', 'отклики', 'n'),
    ('feed-perm', 'chat-room', 'написать', 'n'),
    ('feed-perm', 'user-profile', 'профиль', 'n'),

    ('matches', 'chat-room', 'Чат', 'n'),
    ('matches', 'user-profile', 'Профиль ›', 'n'),
    ('matches', 'rate', 'оценить', 'n'),
    ('exchange', 'chat-room', 'отклик', 'n'),
    ('exchange', 'create-vacancy', 'из объявления', 'n'),
    ('chats', 'chat-room', 'открыть диалог', 'n'),
    ('profile', 'legal', 'Документы', 'n'),
    ('profile', 'feed-shift', 'обучение заново', 'n'),

    ('chat-room', 'user-profile', 'имя в шапке', 'n'),
    ('perm-vacancy-detail', 'user-profile', 'Профиль →', 'n'),
    ('perm-vacancy-detail', 'login', 'нужен вход', 'n'),
    ('perm-applications', 'chat-room', 'Чат', 'n'),
    ('perm-applications', 'user-profile', 'Профиль ›', 'n'),
    ('match', 'chat-room', 'Написать', 'n'),
    ('match', 'chats', 'Продолжить поиск', 'r'),
    ('rate', 'feed-shift', 'после оценки', 'r'),
    ('admin', 'analytics', 'Аналитика', 'n'),
]

# Переходы из системных мест — их рисуем отдельной пометкой
GLOBAL_NOTES = [
    'Пуш и колокольчик → чат, Мэтчи, Лента или Биржа (services/notificationRoute.ts)',
    'Нижняя панель переключает 5 вкладок: Поиск · Мэтчи · Биржа · Чаты · Профиль',
]

ZONE_TITLES = {
    0: ('Вход и регистрация', '#8B5CF6'),
    1: ('Основные вкладки', ORANGE),
    2: ('Вторичные экраны', BLUE),
    3: ('Не связаны навигацией', RED),
}


def esc(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def frame_xy(sc):
    return 80 + sc['col'] * COL, 200 + sc['row'] * ROW


def draw_body(x, y, body):
    """Схематичное содержимое экрана. Возвращает список svg-строк."""
    out = []
    cy = y + 96          # под шапкой телефона
    px = x + 18
    iw = W - 36
    for item in body:
        kind = item[0]
        if kind == 'gap':
            cy += 18
        elif kind == 'h':
            out.append(f'<text x="{px}" y="{cy+22}" font-size="24" font-weight="800" fill="{INK}">{esc(item[1])}</text>')
            cy += 42
        elif kind == 't':
            out.append(f'<text x="{px}" y="{cy+14}" font-size="13" fill="{MUTED}">{esc(item[1])}</text>')
            cy += 26
        elif kind == 'b':
            out.append(f'<rect x="{px}" y="{cy}" width="{iw}" height="44" rx="14" fill="{ORANGE}"/>')
            out.append(f'<text x="{x+W/2}" y="{cy+28}" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">{esc(item[1])}</text>')
            cy += 54
        elif kind == 'o':
            out.append(f'<rect x="{px}" y="{cy}" width="{iw}" height="44" rx="14" fill="none" stroke="{LINE}" stroke-width="1.5"/>')
            out.append(f'<text x="{x+W/2}" y="{cy+28}" font-size="14" font-weight="600" fill="{INK}" text-anchor="middle">{esc(item[1])}</text>')
            cy += 54
        elif kind == 'row':
            out.append(f'<rect x="{px}" y="{cy}" width="{iw}" height="40" rx="12" fill="#fff" stroke="{LINE}"/>')
            out.append(f'<text x="{px+12}" y="{cy+25}" font-size="13" fill="{INK}">{esc(item[1])}</text>')
            out.append(f'<text x="{px+iw-16}" y="{cy+25}" font-size="13" fill="{MUTED}" text-anchor="end">›</text>')
            cy += 48
        elif kind == 'chips':
            cx = px
            for label in item[1]:
                wid = max(38, 11 + len(label) * 7)
                out.append(f'<rect x="{cx}" y="{cy}" width="{wid}" height="30" rx="15" fill="#fff" stroke="{LINE}"/>')
                out.append(f'<text x="{cx+wid/2}" y="{cy+20}" font-size="11.5" fill="{INK}" text-anchor="middle">{esc(label)}</text>')
                cx += wid + 7
            cy += 40
        elif kind == 'tabs':
            cx = px
            for i, label in enumerate(item[1]):
                wid = max(60, 16 + len(label) * 7)
                fill = '#FFF3ED' if i == 0 else '#fff'
                stroke = ORANGE if i == 0 else LINE
                col = ORANGE if i == 0 else MUTED
                out.append(f'<rect x="{cx}" y="{cy}" width="{wid}" height="30" rx="15" fill="{fill}" stroke="{stroke}"/>')
                out.append(f'<text x="{cx+wid/2}" y="{cy+20}" font-size="11.5" fill="{col}" text-anchor="middle">{esc(label)}</text>')
                cx += wid + 7
            cy += 40
        elif kind == 'card':
            lines = item[1]
            ch = 20 + len(lines) * 22
            out.append(f'<rect x="{px}" y="{cy}" width="{iw}" height="{ch}" rx="16" fill="#fff" stroke="{LINE}"/>')
            for i, ln in enumerate(lines):
                weight = '700' if i == 0 else '400'
                size = 14 if i == 0 else 12
                col = INK if i == 0 else MUTED
                out.append(f'<text x="{px+14}" y="{cy+26+i*22}" font-size="{size}" font-weight="{weight}" fill="{col}">{esc(ln)}</text>')
            cy += ch + 12
        elif kind == 'nav':
            ny = y + H - 74
            out.append(f'<rect x="{x+14}" y="{ny}" width="{W-28}" height="58" rx="26" fill="#fff" stroke="{LINE}"/>')
            for i, label in enumerate(['Поиск', 'Мэтчи', 'Биржа', 'Чаты', 'Профиль']):
                tx = x + 14 + (W - 28) * (i + 0.5) / 5
                col = ORANGE if i == 0 else MUTED
                out.append(f'<circle cx="{tx}" cy="{ny+22}" r="7" fill="none" stroke="{col}" stroke-width="1.6"/>')
                out.append(f'<text x="{tx}" y="{ny+48}" font-size="9.5" fill="{col}" text-anchor="middle">{label}</text>')
    return out


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
             f'{len(SCREENS)} экранов, {len(EDGES)} переходов. Собрано из кода: app/*.tsx</text>')
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
        o.append(f'<rect x="{x}" y="{y}" width="{W}" height="{H}" rx="34" fill="{BG}" stroke="{zc}" stroke-width="2.5"/>')
        # строка состояния
        o.append(f'<rect x="{x+130}" y="{y+12}" width="{W-260}" height="20" rx="10" fill="#E9EAED"/>')
        o.append(f'<text x="{x+26}" y="{y+27}" font-size="11" fill="{MUTED}">9:41</text>')
        if sc.get('orphan'):
            o.append(f'<rect x="{x+W-118}" y="{y-30}" width="112" height="22" rx="11" fill="#FEF2F2" stroke="{RED}"/>')
            o.append(f'<text x="{x+W-62}" y="{y-15}" font-size="10.5" fill="{RED}" text-anchor="middle">нет входа в код</text>')
        o.extend(draw_body(x, y, sc['body']))
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
