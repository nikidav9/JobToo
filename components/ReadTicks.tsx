import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import type { Chat } from '@/constants/types';

/**
 * Галочки о прочтении — как в мессенджерах: одна значит отправлено,
 * две значат, что собеседник переписку открыл.
 *
 * Отметки хранит чат, а не сообщение: у каждой стороны время последнего
 * захода. Поэтому «прочитано» — это сравнение, а не поле, и одно открытие
 * чата отмечает всё, что там было, вместо правки сотни строк.
 *
 * Показываем только у своих сообщений. У чужих галочка сообщала бы человеку
 * то, что он и так знает: он их читает прямо сейчас.
 *
 * Значки взяты из набора Material: там двойная галочка — один цельный знак.
 * Первая версия складывала две одиночных с наездом друг на друга, и они
 * получались тонкими и разъезжались. Заодно этот набор рисует линию заметно
 * плотнее — прежние было почти не разглядеть на оранжевом пузыре.
 */

/** Прочитал ли собеседник сообщение, отправленное в это время. */
export function isSeenByOther(
    chat: Pick<Chat, 'workerReadAt' | 'employerReadAt'> | null | undefined,
    myRole: 'worker' | 'employer',
    sentAt: string | undefined,
): boolean {
    if (!chat || !sentAt) return false;
    const seenAt = myRole === 'worker' ? chat.employerReadAt : chat.workerReadAt;
    if (!seenAt) return false;
    // Не строгое сравнение: открытие чата отмечает и то сообщение, что
    // пришло ровно в эту секунду.
    return new Date(sentAt).getTime() <= new Date(seenAt).getTime();
}

export function ReadTicks({ seen, onDark = false }: { seen: boolean; onDark?: boolean }) {
    // На оранжевом пузыре свои цвета. Полупрозрачный белый там сливался с
    // фоном, и «доставлено» выглядело как «ничего не показано».
    const color = seen
        ? (onDark ? '#fff' : Colors.primary)
        : (onDark ? 'rgba(255,255,255,0.9)' : Colors.textSecondary);

    return (
        <MaterialCommunityIcons
            name={seen ? 'check-all' : 'check'}
            size={15}
            color={color}
        />
    );
}
