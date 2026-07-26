import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, PanResponder } from 'react-native';
import { Colors } from '@/constants/theme';

/**
 * Полоска-ручка сверху окна.
 *
 * Она же и подсказка: за неё окно тянут вниз. Раньше часть окон закрывалась
 * крестиком, часть ручкой, а кое-где было и то и другое — и понять, смахнётся
 * окно или нет, было нельзя.
 */
export function SheetHandle() {
  return (
    <View style={s.handleWrap}>
      <View style={s.handle} />
    </View>
  );
}

/**
 * Смахивание окна вниз.
 *
 * Тянуть даём только за верх окна, а не за всё подряд: внутри почти всегда
 * прокручиваемый список, и если перехватывать любое движение, читать его
 * станет невозможно.
 */
export function useSwipeToDismiss(onClose: () => void, visible = true) {
  const ty = useRef(new Animated.Value(0)).current;

  // onClose пересоздаётся на каждый кадр, а PanResponder делается один раз.
  // Без ссылки он бы навсегда запомнил первый вариант.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => { if (visible) ty.setValue(0); }, [visible, ty]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => { if (g.dy > 0) ty.setValue(g.dy); },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 110 || g.vy > 1.1) {
          Animated.timing(ty, { toValue: 900, duration: 180, useNativeDriver: true })
            .start(() => closeRef.current());
        } else {
          Animated.spring(ty, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 14 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(ty, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 14 }).start();
      },
    }),
  ).current;

  return {
    /** Вешается на верхнюю часть окна — за неё и тянут */
    panHandlers: pan.panHandlers,
    /** Вешается на само окно */
    animStyle: { transform: [{ translateY: ty }] },
  };
}

const s = StyleSheet.create({
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.inputBorder },
});
