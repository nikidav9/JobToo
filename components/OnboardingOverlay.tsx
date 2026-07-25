import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform, Animated, Easing,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/theme';
import { useApp } from '@/hooks/useApp';
import { getOnboardingTarget, getOnboardingFlag, subscribeOnboardingTargets } from '@/lib/onboardingTargets';
import { LavkaLogo } from '@/components/ui/LavkaLogo';

const KEY = (uid: string) => `jm_onboarding_done_${uid}`;

// Подписка, чтобы «Показать обучение снова» из профиля мгновенно перезапускало оверлей
const replayListeners = new Set<() => void>();

// Кто ждёт окончания обучения. Предложение включить уведомления показывается
// только после него — иначе два окна наезжают друг на друга при первом входе.
const doneListeners = new Set<() => void>();

/** Обучение уже пройдено этим пользователем? */
export async function isOnboardingDone(uid: string): Promise<boolean> {
  try { return (await AsyncStorage.getItem(KEY(uid))) === '1'; } catch { return true; }
}

/** Позвать, когда обучение завершится. Возвращает функцию отписки. */
export function onOnboardingDone(cb: () => void): () => void {
  doneListeners.add(cb);
  return () => doneListeners.delete(cb);
}

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
  demo?: boolean;       // шаг про свайп: при отсутствии реальной карточки показываем демо
};

/**
 * Плавно пульсирующее кольцо вокруг подсвеченного элемента: расходится и
 * гаснет, как круги по воде. Один и тот же указатель на всех шагах, чтобы
 * подсказка читалась одинаково.
 */
function PulseRing({ rect, radius }: { rect: Rect; radius: number }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1, duration: 1250, easing: Easing.out(Easing.quad), useNativeDriver: true,
        }),
        Animated.delay(220),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const common = {
    position: 'absolute' as const,
    left: rect.x, top: rect.y, width: rect.w, height: rect.h,
    borderRadius: radius,
    borderWidth: 2.5,
    borderColor: Colors.primary,
  };

  return (
    // absoluteFill обязателен: у View без размеров Android обрезает
    // абсолютных детей, выходящих за его границы, — кольцо бы пропало
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* постоянный контур — видно, что именно выделено */}
      <View style={[common, { opacity: 0.95 }]} />
      {/* расходящееся кольцо */}
      <Animated.View
        style={[common, {
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
        }]}
      />
    </View>
  );
}

export function OnboardingOverlay() {
  const app = useApp();
  const user = app?.currentUser ?? null;
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = Dimensions.get('window');

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [, force] = useState(0);

  // Элементы сообщают геометрию через measureInWindow — это координаты ОКНА
  // (со статус-баром и т.п.), а оверлей живёт внутри контейнера вкладок со
  // своим нулём. Разница зависит от устройства, поэтому меряем собственное
  // положение и вычитаем его — так подсветка совпадает на любом экране.
  const rootRef = useRef<View>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const measureSelf = () => {
    rootRef.current?.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) {
        setOrigin(prev => (prev && prev.x === x && prev.y === y ? prev : { x, y }));
      }
    });
  };

  // Перерисовка, когда элементы сообщают свои измеренные позиции
  useEffect(() => subscribeOnboardingTargets(() => force(n => n + 1)), []);

  // Перемеряем себя на каждом шаге и чуть позже после появления: на Android
  // первый onLayout иногда приходит до того, как система применит отступы.
  useEffect(() => {
    if (!visible) return;
    measureSelf();
    const t = setTimeout(measureSelf, 250);
    return () => clearTimeout(t);
  }, [visible, step]);

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
  // Замер приводим к системе координат оверлея; запасные значения уже в ней
  const measured = (key: string): Rect | null => {
    const t = getOnboardingTarget(key);
    if (!t) return null;
    const o = origin ?? { x: 0, y: 0 };
    return { x: t.x - o.x, y: t.y - o.y, w: t.w, h: t.h };
  };
  const rSwitcher: Rect = pad(measured('switcher') ?? { x: 14, y: top + 52, w: W - 28, h: 48 }, 6);
  const cardTarget = measured('card') ?? { x: 16, y: top + 150, w: W - 32, h: H * 0.4 };
  // Есть ли реальная карточка смены. Если нет — покажем демо-карточку компактнее.
  const hasRealCard = getOnboardingFlag('hasShiftCard') !== false;
  const rCard: Rect = hasRealCard
    ? pad(cardTarget, 4)
    : { x: cardTarget.x + 8, y: cardTarget.y + 8, w: cardTarget.w - 16, h: 208 };
  const rFab: Rect = pad(measured('fab') ?? { x: W - 16 - 60, y: H - tabBarH - 14 - 60, w: 62, h: 62 }, 6);
  // Верхняя кнопка Telegram и вкладка «Мэтчи» — тоже по замеру, с запасным расчётом
  const rTelegram: Rect = pad(measured('telegram') ?? { x: W - 108, y: top + 2, w: 92, h: 46 }, 6);
  const rMatchesTab: Rect = pad(measured('matchesTab') ?? { x: 16 + seg, y: H - tabBarH - 2, w: seg, h: 62 }, 4);

  const steps: Step[] = isWorker
    ? [
        { icon: 'hand-left', title: `Привет, ${user.firstName}! 👋`, hint: 'center',
          body: 'Это JobToo — смены и постоянная работа рядом с домом. Покажем за 20 секунд, куда нажимать.' },
        { icon: 'swap-horizontal', title: 'Смены или Работа', spot: rSwitcher, hint: 'below',
          body: 'Переключайся: «Смены» — подработка на день, «Работа» — постоянное место.' },
        { icon: 'heart', title: 'Откликайся свайпом', spot: rCard, hint: 'below', demo: !hasRealCard,
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
    doneListeners.forEach(fn => fn());
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

  // Радиус подсветки: круглым кнопкам — круг, широким блокам — мягкое скругление
  const spotRadius = (r: Rect) =>
    Math.abs(r.w - r.h) < 14 ? Math.max(r.w, r.h) / 2 : 18;

  // Путь скруглённого прямоугольника — им вырезаем «дырку» в затемнении
  const roundedRect = (x: number, y: number, w: number, h: number, rad: number) => {
    const r = Math.max(0, Math.min(rad, w / 2, h / 2));
    return `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r}`
      + ` V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`
      + ` H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r}`
      + ` V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`;
  };

  // Затемнение с вырезом: рисуем одним SVG-путём с правилом evenodd, поэтому
  // «дырка» получается скруглённой, а не квадратной. В демо-режиме (реальной
  // карточки нет) выреза не делаем — иначе за демо-карточкой просвечивает фон.
  const dim = 'rgba(17,17,17,0.72)';
  const Spot = () => {
    if (!s.spot || s.demo) return <View style={[StyleSheet.absoluteFill, { backgroundColor: dim }]} />;
    const { x, y, w, h } = s.spot;
    return (
      <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path
          d={`M0 0 H${W} V${H} H0 Z ` + roundedRect(x, y, w, h, spotRadius(s.spot))}
          fill={dim}
          fillRule="evenodd"
        />
      </Svg>
    );
  };

  return (
    <View
      ref={rootRef}
      style={StyleSheet.absoluteFill}
      pointerEvents="auto"
      onLayout={measureSelf}
    >
      <Spot />

      {/* Демо-карточка смены — когда на выбранную дату реальных смен нет */}
      {s.demo && s.spot ? (
        <View style={[dc.card, { left: s.spot.x, top: s.spot.y, width: s.spot.w, height: s.spot.h }]}>
          <View style={dc.top}>
            <LavkaLogo size={38} />
            <View style={{ flex: 1 }}>
              <Text style={dc.company}>Лавка</Text>
              <View style={dc.metroRow}>
                <Ionicons name="subway-outline" size={12} color={Colors.textMuted} />
                <Text style={dc.metro}>м. Сокол</Text>
              </View>
            </View>
            <View style={dc.urgent}><Text style={dc.urgentTxt}>Пример</Text></View>
          </View>
          <Text style={dc.title}>Кладовщик</Text>
          <View style={dc.chips}>
            <View style={dc.chip}><Text style={dc.chipTxt}>🕐 09:00–18:00</Text></View>
            <View style={dc.chip}><Text style={dc.chipTxt}>💰 2 500 ₽</Text></View>
          </View>
          <View style={dc.actions}>
            <View style={[dc.actionBtn, { backgroundColor: '#FEE2E2' }]}><Ionicons name="close" size={20} color={Colors.red} /></View>
            <View style={[dc.actionBtn, { backgroundColor: Colors.primary }]}><Ionicons name="heart" size={20} color="#fff" /></View>
          </View>
        </View>
      ) : null}

      {/* Пульсирующее кольцо на элементе — единый указатель «нажми сюда».
          Рисуем после демо-карточки, иначе она бы его перекрыла. */}
      {s.spot ? <PulseRing rect={s.spot} radius={spotRadius(s.spot)} /> : null}

      {/* Пропустить */}
      <View style={[st.skipWrap, { top: top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity
          style={st.skip}
          onPress={finish}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={st.skipTxt}>Пропустить</Text>
        </TouchableOpacity>
      </View>

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

const dc = StyleSheet.create({
  card: {
    position: 'absolute', backgroundColor: '#fff', borderRadius: 18,
    padding: 14, justifyContent: 'flex-start', gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14, shadowRadius: 16, elevation: 10,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  company: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  metroRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metro: { fontSize: 12, color: Colors.textMuted },
  urgent: { backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  urgentTxt: { fontSize: 11, fontWeight: '700', color: '#92400E' },
  title: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { backgroundColor: '#F4F4F5', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  chipTxt: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 4 },
  actionBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});

const st = StyleSheet.create({
  skipWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  skip: {
    paddingHorizontal: 16, paddingVertical: 6,
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
