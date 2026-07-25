import { Vacancy } from '@/constants/types';
import { formatDate } from '@/services/storage';

// Готовые фразы для чата сразу после мэтча: поле ввода пустое, и обе стороны
// молчат, не зная, с чего начать. Нажатие подставляет текст в поле — не
// отправляет, чтобы можно было дописать под себя.

export type ChatSuggestion = {
  id: string;
  /** Короткая надпись на чипе */
  label: string;
  /** Текст, который подставится в поле ввода */
  text: string;
};

export function getChatSuggestions(
  role: 'worker' | 'employer',
  vacancy?: Vacancy | null,
): ChatSuggestion[] {
  const day = vacancy?.date ? formatDate(vacancy.date) : '';
  const time = vacancy?.timeStart ?? '';
  const when = day && time ? `${day} к ${time}` : day || '';
  const address = vacancy?.address ?? '';
  const station = vacancy?.metroStation ?? '';

  if (role === 'employer') {
    const out: ChatSuggestion[] = [
      { id: 'thanks', label: 'Спасибо за отклик', text: 'Спасибо за отклик на смену!' },
      { id: 'lavka', label: 'Опыт в Лавке?', text: 'Был ли у вас опыт работы в Лавке?' },
      { id: 'warehouse', label: 'Опыт на складе?', text: 'Работали раньше на складе — сборка, приёмка, выкладка?' },
    ];
    if (when) {
      out.push({ id: 'confirm', label: 'Подтвердите выход', text: `Подтвердите, пожалуйста, выход ${when}.` });
    }
    out.push({ id: 'early', label: 'Прийти заранее', text: 'Подойдите, пожалуйста, за 15 минут до начала смены.' });
    out.push({ id: 'passport', label: 'Взять паспорт', text: 'Возьмите с собой паспорт.' });
    if (address || station) {
      const parts = [address ? `Адрес: ${address}.` : '', station ? `Ближайшее метро — ${station}.` : '']
        .filter(Boolean).join(' ');
      out.push({ id: 'address', label: 'Адрес', text: parts });
    }
    out.push({ id: 'pay', label: 'Вопросы по оплате?', text: 'Остались вопросы по нормативам и оплате?' });
    return out;
  }

  return [
    {
      id: 'confirm',
      label: 'Подтверждаю выход',
      text: when
        ? `Здравствуйте! Подтверждаю, что выйду на смену ${when}.`
        : 'Здравствуйте! Подтверждаю, что выйду на смену.',
    },
    { id: 'where', label: 'Куда подойти?', text: 'Подскажите, куда подойти и к кому обратиться?' },
    { id: 'take', label: 'Что взять?', text: 'Что взять с собой?' },
    { id: 'exp', label: 'Есть опыт', text: 'Есть опыт работы на складе.' },
    { id: 'earlier', label: 'Приеду раньше', text: 'Смогу подъехать чуть раньше.' },
    { id: 'pay', label: 'Как считается оплата?', text: 'Подскажите, как считается оплата за смену?' },
  ];
}
