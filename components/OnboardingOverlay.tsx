import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';
import { getOnboardingTarget, subscribeOnboardingTargets } from '@/lib/onboardingTargets';

const KEY = (uid: string) => `jm_onboarding_done_${uid}`;

// Подписка, чтобы «Показать обучение снова» из профиля мгновенно перезапускало оверлей
const replayListeners = new Set<() => void>();

// Внешний ключ — сбрасывает флаг и просит смонтированный оверлей показаться заново
export async function resetOnboarding(uid: string) {
  try { await AsyncStorage.removeItem(KEY(uid)); } catch {}
  replayListeners.forEach(fn => fn());
}

type Rect = { x: number; y: number; w: number; h: number };
type Step = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  spot?: Rect;          // подсветка элемента; нет → центрированный экран-приветствие
  hint: 'below' | 'above' | 'center';
};

export function OnboardingOverlay() {
  const app = useApp();
  const user = app?.currentUser ?? null;
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = Dimensions.get('window');

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [, force] = useState(0);

  // Перерисовка, когда элементы сообщают свои измеренные позиции
  useEffect(() => subscribeOnboardingTargets(() => force(n => n + 1)), []);

  useEffect(() => {
    if (!user) { setVisible(false); return; }
    let cancelled = false;
    AsyncStorage.getItem(KEY(user.id)).then(v => {
      if (!cancelled && !v) { setStep(0); setVisible(true); }
    }).catch(() => {});
    const replay = () => { setStep(0); setVisible(true); };
    replayListeners.add(replay);
    return () => { cancelled = true; replayListeners.delete(replay); };
  }, [user?.id]);

  if (!visible || !user) return null;

  const isWorker = user.role === 'worker';
  const top = insets.top;
  const tabBarH = (Platform.OS === 'web' ? 76 : insets.bottom + 64 + 12);
  const seg = (W - 32) / 5;

  // Измеренные позиции элементов (приходят из feed.tsx через реестр),
  // с запасным вычислением по геометрии экрана, если замер ещё не пришёл
  const pad = (r: Rect, p: number): Rect => ({ x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 });
  const rSwitcher: Rect = pad(getOnboardingTarget('switcher') ?? { x: 14, y: top + 52, w: W - 28, h: 48 }, 6);
  const rCard: Rect = pad(getOnboardingTarget('card') ?? { x: 16, y: top + 150, w: W - 32, h: H * 0.4 }, 4);
  const rFab: Rect = pad(getOnboardingTarget('fab') ?? { x: W - 16 - 60, y: H - tabBarH - 14 - 60, w: 62, h: 62 }, 6);
  // Верхняя кнопка Telegram и вкладка «Мэтчи» — тоже по замеру, с запасным расчётом
  const rTelegram: Rect = pad(getOnboardingTarget('telegram') ?? { x: W - 108, y: top + 2, w: 92, h: 46 }, 6);
  const rMatchesTab: Rect = pad(getOnboardingTarget('matchesTab') ?? { x: 16 + seg, y: H - tabBarH - 2, w: seg, h: 62 }, 4);

  const steps: Step[] = isWorker
    ? [
        { icon: 'hand-left', title: `Привет, ${user.firstName}! 👋`, hint: 'center',
          body: 'Это JobToo — смены и постоянная работа рядом с домом. Покажем за 20 секунд, куда нажимать.' },
        { icon: 'swap-horizontal', title: 'Смены или Работа', spot: rSwitcher, hint: 'below',
          body: 'Переключайся: «Смены» — подработка на день, «Работа» — постоянное место.' },
        { icon: 'heart', title: 'Откликайся свайпом', spot: rCard, hint: 'below',
          body: 'Свайп карточки вправо или ❤️ — откликнуться на смену. Влево — пропустить.' },
        { icon: 'people', title: 'Твои отклики', spot: rMatchesTab, hint: 'above',
          body: 'Вкладка «Мэтчи»: здесь ответы директоров и статусы твоих откликов.' },
        { icon: 'notifications', title: 'Не пропусти смену', spot: rTelegram, hint: 'below',
          body: 'Привяжи Telegram и включи уведомления — о новых сменах рядом узнаешь первым.' },
      ]
    : [
        { icon: 'hand-left', title: `Привет, ${user.firstName}! 👋`, hint: 'center',
          body: 'Это JobToo — публикуйте смены и вакансии, кладовщики рядом откликнутся. Покажем, куда нажимать.' },
        { icon: 'swap-horizontal', title: 'Смены или Работа', spot: rSwitcher, hint: 'below',
          body: '«Смены» — подработка на день, «Работа» — постоянный сотрудник. Переключайтесь здесь.' },
        { icon: 'add-circle', title: 'Создать вакансию', spot: rFab, hint: 'above',
          body: 'Кнопка «+» — опубликовать смену или постоянную вакансию за минуту.' },
        { icon: 'people', title: 'Отклики кандидатов', spot: rMatchesTab, hint: 'above',
          body: 'Вкладка «Мэтчи»: сюда падают отклики. Одобряйте или отклоняйте в один тап.' },
        { icon: 'notifications', title: 'Отвечайте быстрее', spot: rTelegram, hint: 'below',
          body: 'Привяжите Telegram — отклики придут с кнопками, отвечайте не заходя в приложение.' },
      ];

  const s = steps[step];
  const isLast = step === steps.length - 1;

  const finish = () => {
    AsyncStorage.setItem(KEY(user.id), '1').catch(() => {});
    setVisible(false);
  };
  const next = () => { if (isLast) finish(); else setStep(step + 1); };

  // Карточка-подсказка: над или под подсветкой, не перекрывая подсвеченный элемент.
  // Для 'above' прижимаем НИЗ карточки к элементу (высота карточки динамическая — так надёжнее).
  const cardW = W - 40;
  const cardPos: { top?: number; bottom?: number } =
    (!s.spot || s.hint === 'center')
      ? { top: H / 2 - 150 }
      : s.hint === 'below'
      ? { top: Math.min(s.spot.y + s.spot.h + 16, H - 260) }
      : { bottom: Math.max(H - (s.spot.y - 16), 20) };

  // Затемнение с «дыркой»: 4 прямоугольника вокруг подсветки
  const dim = 'rgba(17,17,17,0.72)';
  const Spot = () => {
    if (!s.spot) return <View style={[StyleSheet.absoluteFill, { backgroundColor: dim }]} />;
    const { x, y, w, h } = s.spot;
    return (
      <>
        <View style={{ position: 'absolute', left: 0, top: 0, right: 0, height: y, backgroundColor: dim }} />
        <View style={{ position: 'absolute', left: 0, top: y, width: x, height: h, backgroundColor: dim }} />
        <View style={{ position: 'absolute', left: x + w, top: y, right: 0, height: h, backgroundColor: dim }} />
        <View style={{ position: 'absolute', left: 0, top: y + h, right: 0, bottom: 0, backgroundColor: dim }} />
        <View pointerEvents="none" style={{
          position: 'absolute', left: x - 3, top: y - 3, width: w + 6, height: h + 6,
          borderRadius: 16, borderWidth: 2.5, borderColor: '#fff',
        }} />
      </>
    );
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <Spot />

      {/* Пропустить */}
      <TouchableOpacity
        style={[st.skip, { top: top + 8 }]}
        onPress={finish}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={st.skipTxt}>Пропустить</Text>
      </TouchableOpacity>

      {/* Карточка-подсказка */}
      <View style={[st.card, { left: 20, width: cardW, ...cardPos }]}>
        <View style={st.iconWrap}><Ionicons name={s.icon} size={22} color="#fff" /></View>
        <Text style={st.title}>{s.title}</Text>
        <Text style={st.body}>{s.body}</Text>

        <View style={st.dots}>
          {steps.map((_, i) => (
            <View key={i} style={[st.dot, i === step && st.dotActive]} />
          ))}
        </View>

        <TouchableOpacity style={st.btn} onPress={next} activeOpacity={0.85}>
          <Text style={st.btnTxt}>{isLast ? 'Понятно, начать!' : 'Далее'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  skip: {
    position: 'absolute', right: 16,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 100,
  },
  skipTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  card: {
    position: 'absolute', backgroundColor: '#fff', borderRadius: 20,
    padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 24, elevation: 16,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: 6 },
  body: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  dots: { flexDirection: 'row', gap: 6, marginTop: 16, marginBottom: 14 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#E4E4E7' },
  dotActive: { backgroundColor: Colors.primary, width: 20 },
  btn: {
    backgroundColor: Colors.primary, borderRadius: 100,
    paddingVertical: 13, alignItems: 'center',
  },
  btnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
