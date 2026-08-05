<?php
/**
 * Что бот умеет отвечать сам.
 *
 * Появилось после первого же вечера живой переписки: люди отвечают охотно и
 * спрашивают одно и то же — «какие смены рядом», «сколько платят», «как
 * откликнуться». Держать это на живом человеке значит отвечать до полуночи и
 * всё равно кого-то пропустить; а молчание мы уже проходили — из-за него
 * директор написала «не удобно, ни кто не писал».
 *
 * Правила, а не языковая модель. Вопросы однотипные, ответы должны быть
 * одинаковыми и проверяемыми, а за ключ к чужой модели пришлось бы платить
 * и отвечать. Чего правила не узнали — уходит человеку, и это тоже ответ:
 * лучше честная передача, чем уверенная выдумка.
 *
 * Возвращаемое значение bot_answer():
 *   text     — что сказать человеку
 *   button   — показывать ли кнопку «Открыть JobToo»
 *   topic    — что распознали (для сводки в дашборде)
 *   escalate — 'fyi'    копия администратору, вмешательство не нужно
 *              'need'   нужен живой ответ
 *              'urgent' жалоба или деньги — смотреть сразу
 * null — не поняли; тогда зовущая сторона передаёт сообщение человеку.
 *
 * Требует функций sb_select() / sb_one() из tg.php.
 */

const BOT_APP_URL = 'https://t.me/JobToo_bot/app';

/** Схема метро: та же, что у приложения (см. scripts/gen-metro-php.js). */
function bot_metro(): array {
    static $cache = null;
    if ($cache === null) {
        $p = __DIR__ . '/metro_stations.php';
        $v = is_readable($p) ? @include $p : null;
        $cache = is_array($v) ? $v : ['lines' => [], 'stations' => []];
    }
    return $cache;
}

/** Станция → id ветки (первой из тех, на которых она стоит). */
function bot_stations(): array {
    static $flat = null;
    if ($flat === null) {
        $flat = [];
        foreach (bot_metro()['stations'] ?? [] as $name => $on) $flat[$name] = $on[0][0] ?? '';
    }
    return $flat;
}

/**
 * Сколько остановок между станциями, если ехать без пересадок.
 * null — общей ветки нет, то есть «рядом» это назвать нельзя.
 *
 * Пересадки не считаем нарочно: одна ветка — это «сел и доехал», а маршрут
 * с пересадкой человек и сам найдёт, если захочет.
 */
function bot_stops_between(?string $a, ?string $b): ?int {
    if ($a === null || $b === null) return null;
    if ($a === $b) return 0;
    $st = bot_metro()['stations'] ?? [];
    if (empty($st[$a]) || empty($st[$b])) return null;
    $best = null;
    foreach ($st[$a] as [$lineA, $iA]) {
        foreach ($st[$b] as [$lineB, $iB]) {
            if ($lineA !== $lineB) continue;
            $d = abs($iA - $iB);
            if ($best === null || $d < $best) $best = $d;
        }
    }
    return $best;
}

function bot_line_name(?string $station): string {
    $st = bot_metro()['stations'][$station] ?? null;
    if (!$st) return '';
    return (string)(bot_metro()['lines'][$st[0][0]] ?? '');
}

/** Докуда считаем, что «рядом»: одна ветка и не больше часа дороги. */
const BOT_NEAR_STOPS = 12;

/** Для сравнения: нижний регистр, ё как е, только буквы и цифры. */
function bot_norm(string $s): string {
    $s = mb_strtolower(trim($s), 'UTF-8');
    $s = str_replace(['ё', 'й'], ['е', 'и'], $s);
    return trim(preg_replace('/[^\p{L}\p{N}]+/u', ' ', $s));
}

function bot_has(string $text, array $words): bool {
    $n = bot_norm($text);
    foreach ($words as $w) if (mb_strpos($n, bot_norm($w), 0, 'UTF-8') !== false) return true;
    return false;
}

/**
 * Станция, названная в сообщении. Ищем самое длинное совпадение: «Проспект
 * Мира» не должен проигрывать «Мира», а «Улица 1905 года» — «года».
 */
function bot_find_station(string $text): ?string {
    $n = ' ' . bot_norm($text) . ' ';
    $best = null;
    foreach (array_keys(bot_stations()) as $st) {
        $k = bot_norm($st);
        if (mb_strlen($k, 'UTF-8') < 4) continue;      // «ЦСКА», «Депо» — ложных срабатываний больше, чем пользы
        if (mb_strpos($n, $k, 0, 'UTF-8') !== false) {
            if ($best === null || mb_strlen($k, 'UTF-8') > mb_strlen(bot_norm($best), 'UTF-8')) $best = $st;
        }
    }
    return $best;
}

function bot_date_ru(string $iso): string {
    $ts = strtotime($iso);
    if (!$ts) return $iso;
    $d = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    return $d[(int)date('w', $ts)] . ' ' . date('d.m', $ts);
}

/**
 * Открытые смены: сначала на нужной станции, потом всё остальное.
 *
 * Прятать чужие станции нельзя — иногда их всего одиннадцать на всю Москву,
 * и человек с Владыкина готов доехать до Марьиной Рощи. Но и врать, что это
 * «рядом», тоже нельзя: помечаем честно.
 */
function bot_shifts_near(?string $station, int $limit = 5): array {
    $today = gmdate('Y-m-d', time() + 3 * 3600);
    $rows = sb('GET', 'jm_vacancies', [
        'select' => 'id,title,company,metro_station,address,date,time_start,time_end,salary,norms_and_pay',
        'status' => 'eq.open',
        'date'   => 'gte.' . $today,
        'order'  => 'date.asc',
        'limit'  => '60',
    ]);
    if (empty($rows)) return [];

    // Ближе — выше, а при равной дороге раньше по дате. Расстояние считаем
    // один раз и кладём в строку: оно же нужно в тексте.
    foreach ($rows as $k => $v) {
        $rows[$k]['_stops'] = bot_stops_between($station, $v['metro_station'] ?? null);
    }
    usort($rows, function ($a, $b) {
        $sa = $a['_stops'] ?? 999; $sb = $b['_stops'] ?? 999;
        return $sa === $sb ? strcmp((string)$a['date'], (string)$b['date']) : $sa <=> $sb;
    });
    return array_slice($rows, 0, $limit);
}

/** Только то, куда человеку реально ехать: своя станция или своя ветка. */
function bot_shifts_really_near(?string $station, int $limit = 3): array {
    if ($station === null) return [];
    return array_values(array_filter(bot_shifts_near($station, 30),
        fn($v) => ($v['_stops'] ?? null) !== null && $v['_stops'] <= BOT_NEAR_STOPS));
}

/** Строка смены. Оплата — главное, поэтому она в строке всегда. */
function bot_shift_line(array $v): string {
    $when = bot_date_ru((string)($v['date'] ?? ''));
    $time = ($v['time_start'] ?? '') !== '' ? ' ' . $v['time_start'] . '–' . $v['time_end'] : '';
    $pay  = ((float)($v['salary'] ?? 0)) > 0
        ? number_format((float)$v['salary'], 0, ',', ' ') . ' ₽'
        : 'оплата сдельная, нормативы в карточке';
    $far  = '';
    if (isset($v['_stops'])) {
        if ($v['_stops'] === 0)              $far = ' (это ваша станция)';
        elseif ($v['_stops'] <= BOT_NEAR_STOPS) $far = ' (' . $v['_stops'] . ' ост. от вас)';
    }
    return '• ' . ($v['title'] ?? 'Смена') . ' — м. ' . ($v['metro_station'] ?? '?') . $far
         . ', ' . $when . $time . ', ' . $pay;
}

function bot_shifts_text(?string $station): string {
    $rows = bot_shifts_near($station, 5);
    if (empty($rows)) {
        return 'Сейчас открытых смен нет. Как появятся — сообщу.';
    }
    $near = array_filter($rows, fn($v) => ($v['_stops'] ?? null) !== null && $v['_stops'] <= BOT_NEAR_STOPS);
    $head = $station === null
        ? 'Открытые смены сейчас:'
        : ($near
            ? "Смены рядом с вами (метро {$station}):"
            : "Рядом с метро {$station} смен сейчас нет. Вот всё, что открыто — ехать дальше:");
    $lines = array_map('bot_shift_line', $rows);
    return $head . "\n" . implode("\n", $lines) . "\n\nОткликнуться — в приложении, в два тапа.";
}

/** Как устроена оплата. Тот же текст, что мы шлём в чаты. */
function bot_pay_text(): string {
    return "Как считается оплата\n\n"
         . "Нормативы и оплата привязаны к складу, а не к человеку. Выходите на другой склад — "
         . "считать будут по его нормативам, даже если на своём у вас другие.\n\n"
         . "• Уже работаете в компании — оформляется перевод на этот склад.\n"
         . "• Ещё не оформлены — сначала нужно устроиться в офисе, там же уточнить нормативы.\n\n"
         . "Спросите об этом в чате с работодателем до выхода на смену: какие нормативы, "
         . "сколько выходит и когда платят. Пусть ответит сообщением — останется подтверждение.\n\n"
         . "Вы никогда ничего не платите сами. Не сообщайте данные карты, CVV и коды из SMS.";
}

function bot_howto_text(): string {
    return "Как взять смену\n\n"
         . "1. Откройте приложение — кнопка ниже, ставить ничего не нужно.\n"
         . "2. На главной листайте смены. Подходит — нажмите «Хочу!».\n"
         . "3. Напишите пару слов о себе — это уходит работодателю первым сообщением.\n"
         . "4. Ответ придёт сюда же, в телеграм.\n\n"
         . "Если что-то не открывается или непонятно — напишите мне прямо здесь, разберёмся.";
}

/**
 * Ответ на цифру из опроса. Спрашивать «почему не откликаетесь» и молча
 * проглотить ответ было бы хуже, чем не спрашивать вовсе.
 */
function bot_digit_reply(string $d, array $user): ?array {
    $st = $user['metro_station'] ?? null;
    switch ($d) {
        case '1':
            return ['topic' => 'q_far', 'escalate' => 'fyi', 'button' => false,
                'text' => "Понял — далеко. Напишите, у какого метро вам удобно работать, "
                        . "и я подберу смены рядом, а как появятся новые — сообщу.\n\n"
                        . ($st ? "Сейчас у вас в профиле указано: {$st}. Если не так — поправьте здесь одним словом." : '')];
        case '2':
            return ['topic' => 'q_pay', 'escalate' => 'need', 'button' => true,
                'text' => bot_pay_text() . "\n\n"
                        . "И подскажите: какая оплата за смену была бы для вас нормальной? "
                        . "С этим я иду к директорам."];
        case '3':
            return ['topic' => 'q_time', 'escalate' => 'fyi', 'button' => false,
                'text' => "Понял. Какое время вам подходит — утро, день, вечер или ночь? "
                        . "Буду искать смены под него.\n\n" . bot_shifts_text($st)];
        case '4':
            return ['topic' => 'q_howto', 'escalate' => 'fyi', 'button' => true,
                'text' => bot_howto_text()];
        case '5':
            return ['topic' => 'q_employed', 'escalate' => 'fyi', 'button' => false,
                'text' => "Поздравляю! Напишите сюда, когда снова понадобится подработка — "
                        . "подберу рядом с вами. И скажите, у какого метро вам удобно, чтобы я знал заранее."];
        case '6':
            return ['topic' => 'q_other', 'escalate' => 'need', 'button' => false,
                'text' => "Расскажите своими словами, что мешает? Читаю всё и отвечаю лично."];
    }
    return null;
}

/**
 * Главная развилка. $user — строка из jm_users или пустой массив.
 */
function bot_answer(array $user, string $text): ?array {
    $t = trim($text);
    if ($t === '') return null;
    $n = bot_norm($t);

    // Жалобы и деньги — вперёд всего остального: тут ошибиться нельзя.
    if (bot_has($t, ['обман', 'не заплат', 'не оплат', 'кинул', 'мошен', 'жалоб', 'полици', 'украл'])) {
        return ['topic' => 'complaint', 'escalate' => 'urgent', 'button' => false,
            'text' => "Разберусь лично. Опишите, пожалуйста, что произошло: какой склад, "
                    . "какая дата смены и что именно случилось. Отвечу здесь же."];
    }

    // Просят человека — не отговариваемся ботом.
    if (bot_has($t, ['оператор', 'живои человек', 'никита', 'позвони', 'перезвон', 'телефон свои'])) {
        return ['topic' => 'human', 'escalate' => 'need', 'button' => false,
            'text' => "Передал. Отвечу здесь же лично — напишите пока, в чём вопрос."];
    }

    if (bot_has($t, ['не пишите', 'отписат', 'отпишит', 'хватит писат', 'не беспоко'])) {
        return ['topic' => 'stop', 'escalate' => 'need', 'button' => false,
            'text' => "Понял, больше не беспокою. Если понадобится подработка — напишите сюда, "
                    . "и я подберу смены рядом с вами."];
    }

    // Ответ на опрос: голая цифра, возможно с приветствием.
    if (preg_match('/(?:^|\s)([1-6])(?:\s|$)/u', $n, $m) && mb_strlen($n, 'UTF-8') <= 30) {
        $r = bot_digit_reply($m[1], $user);
        if ($r) return $r;
    }

    if (bot_has($t, ['оплат', 'зарплат', 'сколько плат', 'сколько получ', 'норматив',
                     'когда деньг', 'когда плат', 'аванс', 'ставка'])) {
        return ['topic' => 'pay', 'escalate' => 'fyi', 'button' => true, 'text' => bot_pay_text()];
    }

    if (bot_has($t, ['как отклик', 'не могу отклик', 'не разобра', 'не понима', 'как работа',
                     'что делат', 'как взят смен', 'не открывает'])) {
        return ['topic' => 'howto', 'escalate' => 'fyi', 'button' => true, 'text' => bot_howto_text()];
    }

    if (bot_has($t, ['документ', 'паспорт', 'патент', 'медкниж', 'оформл', 'самозанят', 'гражданств'])) {
        return ['topic' => 'docs', 'escalate' => 'need', 'button' => false,
            'text' => "По документам условия у каждого склада свои — обычно нужен паспорт, "
                    . "остальное уточняют при оформлении в офисе.\n\n"
                    . "Напишите, какой склад вас интересует, и я спрошу у директора точно."];
    }

    // Станция в тексте — самый частый способ спросить «а что есть у меня».
    $station = bot_find_station($t);
    if ($station !== null) {
        return ['topic' => 'shifts_station', 'escalate' => 'fyi', 'button' => true,
            'station' => $station, 'text' => bot_shifts_text($station)];
    }

    if (bot_has($t, ['смен', 'подработк', 'ваканс', 'работа ест', 'ест работа', 'что ест',
                     'ищу работ', 'нужна работа', 'хочу работат'])) {
        return ['topic' => 'shifts', 'escalate' => 'fyi', 'button' => true,
            'text' => bot_shifts_text($user['metro_station'] ?? null)];
    }

    if (bot_has($t, ['спасибо', 'благодар', 'рахмат'])) {
        return ['topic' => 'thanks', 'escalate' => 'none', 'button' => false,
            'text' => "Пожалуйста! Если что — пишите сюда."];
    }

    // Голое приветствие: не молчим, но и не гадаем.
    if (mb_strlen($n, 'UTF-8') <= 25 && bot_has($t, ['привет', 'здравств', 'добрыи ден',
                                                      'доброе утро', 'добрыи вечер', 'салам', 'ассалам'])) {
        return ['topic' => 'greeting', 'escalate' => 'fyi', 'button' => true,
            'text' => "Здравствуйте! Спрашивайте прямо здесь:\n"
                    . "• какие смены есть рядом — назовите своё метро\n"
                    . "• как считается оплата\n"
                    . "• как откликнуться на смену\n\n"
                    . "На что не отвечу сам — передам Никите, он ответит лично."];
    }

    return null;
}
