import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Modal, TextInput, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '@/constants/theme';
import { SheetHandle, useSwipeToDismiss } from '@/components/ui/Sheet';
import { METRO_LINES } from '@/constants/metro';

import { rs, rf } from '@/constants/scale';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (lineId: string, lineName: string, station: string) => void;
  selectedLineId?: string;
  selectedStation?: string;
}

// Плоский индекс всех станций по всем линиям — для поиска «начал вводить».
type FlatStation = { station: string; lineId: string; lineName: string; color: string };
const ALL_STATIONS: FlatStation[] = METRO_LINES.flatMap(l =>
  l.stations.map(st => ({ station: st, lineId: l.id, lineName: l.name, color: l.color }))
);

// Убираем диакритику/ё и регистр, чтобы «сокол», «Сокол», «щелк» находились
function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

export function MetroPicker({ visible, onClose, onSelect, selectedLineId, selectedStation }: Props) {
  const [selectedLine, setSelectedLine] = useState<typeof METRO_LINES[0] | null>(null);
  const [query, setQuery] = useState('');
  // Полоска сверху была, а смахивание — нет: обещание без исполнения
  const swipe = useSwipeToDismiss(onClose, visible);

  useEffect(() => {
    if (visible) {
      setSelectedLine(selectedLineId ? METRO_LINES.find(l => l.id === selectedLineId) ?? null : null);
      setQuery('');
    }
  }, [visible]);

  const handleLineTap = (line: typeof METRO_LINES[0]) => setSelectedLine(line);

  const handleStationTap = (station: string) => {
    if (selectedLine) {
      onSelect(selectedLine.id, selectedLine.name, station);
      onClose();
    }
  };

  const handleFlatTap = (f: FlatStation) => {
    onSelect(f.lineId, f.lineName, f.station);
    onClose();
  };

  // Результаты поиска: станции, чьё название содержит запрос. Совпадение с начала — выше.
  const results = useMemo(() => {
    const q = norm(query);
    if (!q) return [];
    const matched = ALL_STATIONS.filter(f => norm(f.station).includes(q));
    matched.sort((a, b) => {
      const as = norm(a.station).startsWith(q) ? 0 : 1;
      const bs = norm(b.station).startsWith(q) ? 0 : 1;
      if (as !== bs) return as - bs;
      return a.station.localeCompare(b.station, 'ru');
    });
    return matched;
  }, [query]);

  const searching = query.trim().length > 0;

  return (
    <Modal visible={visible} animationType="none" transparent statusBarTranslucent navigationBarTranslucent>
      <View style={styles.overlay} onStartShouldSetResponder={() => true}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[styles.sheet, swipe.animStyle]}>
          <View {...swipe.panHandlers}><SheetHandle /></View>

          {/* Поиск по станции — работает всегда, сверху */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Введите станцию…"
              placeholderTextColor={Colors.textMuted}
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 ? (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {searching ? (
            <FlatList
              data={results}
              keyExtractor={(item) => item.lineId + '::' + item.station}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = item.station === selectedStation && item.lineId === selectedLineId;
                return (
                  <TouchableOpacity
                    style={[styles.resultRow, isSelected && styles.resultRowActive]}
                    onPress={() => handleFlatTap(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.lineDot, { backgroundColor: item.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultStation}>{item.station}</Text>
                      <Text style={styles.resultLine}>{item.lineName}</Text>
                    </View>
                    {isSelected ? <Ionicons name="checkmark" size={18} color={Colors.primary} /> : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyTxt}>Станция не найдена. Проверьте написание.</Text>
              }
              showsVerticalScrollIndicator={false}
              style={styles.list}
              nestedScrollEnabled
            />
          ) : !selectedLine ? (
            <>
              <Text style={styles.title}>Или выберите линию</Text>
              <FlatList
                data={METRO_LINES}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.lineRow} onPress={() => handleLineTap(item)} activeOpacity={0.7}>
                    <View style={[styles.lineDot, { backgroundColor: item.color }]} />
                    <Text style={styles.lineName}>{item.name}</Text>
                    <Text style={styles.arrow}>›</Text>
                  </TouchableOpacity>
                )}
                showsVerticalScrollIndicator={false}
                style={styles.list}
                nestedScrollEnabled
              />
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.backRow} onPress={() => setSelectedLine(null)}>
                <View style={[styles.lineDotSm, { backgroundColor: selectedLine.color }]} />
                <Text style={styles.backLabel}>← {selectedLine.name}</Text>
              </TouchableOpacity>
              <Text style={styles.title}>Выберите станцию</Text>
              <FlatList
                data={selectedLine.stations}
                keyExtractor={item => item}
                numColumns={2}
                columnWrapperStyle={styles.columnWrapper}
                renderItem={({ item: st }) => {
                  const isSelected = st === selectedStation && selectedLine.id === selectedLineId;
                  return (
                    <TouchableOpacity
                      style={[styles.stationChip, isSelected && styles.stationChipActive]}
                      onPress={() => handleStationTap(st)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.stationText, isSelected && styles.stationTextActive]}>{st}</Text>
                    </TouchableOpacity>
                  );
                }}
                showsVerticalScrollIndicator={false}
                style={styles.list}
                contentContainerStyle={{ paddingBottom: 8 }}
                nestedScrollEnabled
              />
            </>
          )}

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Закрыть</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.bg,
    borderTopLeftRadius: rs(24),
    borderTopRightRadius: rs(24),
    paddingHorizontal: rs(20),
    paddingBottom: rs(32),
    height: '85%',
  },
  handle: {
    width: rs(36),
    height: rs(4),
    backgroundColor: Colors.inputBorder,
    borderRadius: rs(2),
    alignSelf: 'center',
    marginVertical: rs(12),
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(8),
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: rs(12),
    paddingHorizontal: rs(12),
    paddingVertical: rs(10),
    marginBottom: rs(14),
  },
  searchInput: { flex: 1, fontSize: rf(15), color: Colors.textPrimary, padding: 0 },
  title: {
    fontSize: rf(18),
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: rs(16),
  },
  list: {
    flex: 1,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(12),
    paddingVertical: rs(12),
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  resultRowActive: { backgroundColor: Colors.primaryLight, borderRadius: rs(10) },
  resultStation: { fontSize: rf(15), fontWeight: '600', color: Colors.textPrimary },
  resultLine: { fontSize: rf(12), color: Colors.textMuted, marginTop: rs(2) },
  emptyTxt: { fontSize: rf(14), color: Colors.textMuted, textAlign: 'center', paddingVertical: rs(24) },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rs(14),
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  lineDot: { width: rs(14), height: rs(14), borderRadius: rs(7), marginRight: rs(12) },
  lineDotSm: { width: rs(10), height: rs(10), borderRadius: rs(5), marginRight: rs(8) },
  lineName: { flex: 1, fontSize: rf(15), fontWeight: '600', color: Colors.textPrimary },
  arrow: { fontSize: rf(20), color: Colors.textMuted },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rs(12),
    marginBottom: rs(8),
  },
  backLabel: { fontSize: rf(15), fontWeight: '600', color: Colors.primary },
  columnWrapper: {
    gap: rs(8),
    marginBottom: rs(8),
  },
  stationChip: {
    flex: 1,
    borderRadius: rs(100),
    paddingHorizontal: rs(12),
    paddingVertical: rs(8),
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    alignItems: 'center',
  },
  stationChipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
    borderWidth: 1.5,
  },
  stationText: { fontSize: rf(13), fontWeight: '600', color: '#374151' },
  stationTextActive: { color: Colors.primary },
  closeBtn: {
    marginTop: rs(12),
    alignItems: 'center',
    paddingVertical: rs(14),
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
  },
  closeBtnText: { fontSize: rf(15), fontWeight: '600', color: Colors.textSecondary },
});
