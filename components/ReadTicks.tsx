import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';
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
    // На синем пузыре свои цвета: серая галочка там сливается с фоном,
    // и «доставлено» выглядело бы как «ничего не показано».
    const color = seen
        ? (onDark ? '#fff' : Colors.primary)
        : (onDark ? 'rgba(255,255,255,0.6)' : Colors.textMuted);

    return (
        <View style={styles.row}>
            <Ionicons name="checkmark" size={13} color={color} />
            {/* Вторая галочка с наездом на первую — так их читают как одну
                отметку, а не как две разные иконки подряд. */}
            {seen ? (
                <Ionicons name="checkmark" size={13} color={color} style={styles.second} />
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center' },
    second: { marginLeft: -7 },
});
