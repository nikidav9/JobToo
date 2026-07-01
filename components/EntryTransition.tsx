import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';

// Sorce-style entry: logo on white, playful bouncing dots, then the whole
// overlay dissolves to reveal the app content underneath.

const DOTS = [
  { color: '#FF6B1A', delay: 0 },
  { color: '#FFB27A', delay: 120 },
  { color: '#FF8A47', delay: 240 },
];

const HOLD_MS = 550;   // logo + dots visible
const FADE_MS = 450;   // overlay dissolve

export default function EntryTransition() {
  const [done, setDone] = useState(false);
  const overlay = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.94)).current;
  const dotAnims = useRef(DOTS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // Logo settles in
    Animated.spring(logoScale, {
      toValue: 1, tension: 120, friction: 10, useNativeDriver: true,
    }).start();

    // Dots bounce while we hold
    dotAnims.forEach((v, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(DOTS[i].delay),
          Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      ).start();
    });

    // Dissolve the overlay
    const t = setTimeout(() => {
      Animated.timing(overlay, {
        toValue: 0, duration: FADE_MS,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start(() => setDone(true));
    }, HOLD_MS);

    return () => clearTimeout(t);
  }, []);

  if (done) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity: overlay }]} pointerEvents="none">
      <Animated.View style={{ alignItems: 'center', transform: [{ scale: logoScale }] }}>
        <Text style={styles.logo}>
          <Text style={styles.logoBlack}>Job</Text>
          <Text style={styles.logoOrange}>Too</Text>
        </Text>
        <View style={styles.dotsRow}>
          {DOTS.map((d, i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: d.color },
                {
                  transform: [{
                    translateY: dotAnims[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -9],
                    }),
                  }],
                },
              ]}
            />
          ))}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    elevation: 999,
  },
  logo: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  logoBlack: { color: '#111111' },
  logoOrange: { color: '#FF6B1A' },
  dotsRow: { flexDirection: 'row', gap: 8, marginTop: 22, height: 20, alignItems: 'flex-end' },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
