import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useApp } from '@/hooks/useApp';

// Sorce-style entry: logo on white with playful bouncing dots. The overlay
// stays up while real data loads (dataReady from AppContext), then dissolves.

const DOTS = [
  { color: '#FF6B1A', delay: 0 },
  { color: '#FFB27A', delay: 120 },
  { color: '#FF8A47', delay: 240 },
];

const MIN_SHOW_MS = 2000;  // never dissolve before this
const MAX_SHOW_MS = 5000;  // dissolve even if data is still loading
const FADE_MS = 450;

// Shared visual: JobToo logo + bouncing dots. Used by the entry overlay here
// and by the boot splash in app/index.tsx so the two read as one screen.
export function LogoDots() {
  const dotAnims = useRef(DOTS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const loops = dotAnims.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(DOTS[i].delay),
          Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, []);

  return (
    <View style={{ alignItems: 'center' }}>
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
    </View>
  );
}

export default function EntryTransition() {
  const app = useApp();
  const dataReady = app?.dataReady ?? false;

  const [done, setDone] = useState(false);
  const [minPassed, setMinPassed] = useState(false);
  const overlay = useRef(new Animated.Value(1)).current;
  const dissolving = useRef(false);

  function dissolve() {
    if (dissolving.current) return;
    dissolving.current = true;
    Animated.timing(overlay, {
      toValue: 0, duration: FADE_MS,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start(() => setDone(true));
  }

  useEffect(() => {
    const minT = setTimeout(() => setMinPassed(true), MIN_SHOW_MS);
    const maxT = setTimeout(dissolve, MAX_SHOW_MS);
    return () => { clearTimeout(minT); clearTimeout(maxT); };
  }, []);

  useEffect(() => {
    if (minPassed && dataReady) dissolve();
  }, [minPassed, dataReady]);

  if (done) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity: overlay }]} pointerEvents="none">
      <LogoDots />
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
