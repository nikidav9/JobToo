import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, FlatList, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { dbAddressSuggest, AddressSuggestion } from '@/services/db';

// Поле адреса с подсказками. Подсказки приходят с нашего сервера
// (jobtoo.ru/api → OpenStreetMap/Nominatim), поэтому не нужен ни ключ, ни WebView.
// При выборе возвращаем и адрес, и координаты (Nominatim отдаёт их сразу).
export function AddressSuggestField({
  value, onChange, placeholder, error,
}: {
  value: string;
  onChange: (address: string, lat: number | null, lng: number | null) => void;
  placeholder?: string;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = useRef(0);

  const openModal = () => {
    setQuery(value || '');
    setResults([]);
    setTouched(false);
    setOpen(true);
  };

  const pick = useCallback((addr: string, lat: number | null, lng: number | null) => {
    onChange(addr, lat, lng);
    setOpen(false);
  }, [onChange]);

  // Дебаунс + защита от устаревших ответов (гонки)
  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 3) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const my = ++reqId.current;
    timer.current = setTimeout(async () => {
      const r = await dbAddressSuggest(q);
      if (my !== reqId.current) return; // пришёл старый ответ
      setResults(r);
      setLoading(false);
      setTouched(true);
    }, 450);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, open]);

  const trimmed = query.trim();

  return (
    <>
      <TouchableOpacity
        style={[s.field, error ? s.fieldError : null]}
        onPress={openModal}
        activeOpacity={0.8}
      >
        <Ionicons name="location-outline" size={18} color={Colors.primary} style={{ marginRight: 8 }} />
        <Text style={[s.fieldTxt, !value ? s.placeholder : null]} numberOfLines={2}>
          {value || placeholder || 'Указать адрес'}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
          <View style={s.header}>
            <Text style={s.title} numberOfLines={1}>Адрес</Text>
            <TouchableOpacity onPress={() => setOpen(false)} style={s.closeBtn} activeOpacity={0.8}>
              <Ionicons name="close" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={s.searchBox}>
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput
              style={s.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Начните вводить адрес…"
              placeholderTextColor={Colors.textMuted}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 ? (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <FlatList
            data={results}
            keyExtractor={(item, i) => item.name + '::' + i}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const short = item.name.split(',').slice(0, 2).join(',').trim();
              return (
                <TouchableOpacity style={s.row} onPress={() => pick(item.name, item.lat, item.lng)} activeOpacity={0.7}>
                  <Ionicons name="location-sharp" size={18} color={Colors.primary} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowHead}>{short}</Text>
                    <Text style={s.rowSub} numberOfLines={1}>{item.name}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
            ListHeaderComponent={
              loading ? (
                <View style={s.statusRow}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={s.statusTxt}>Ищем адрес…</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              loading ? null : (
                <Text style={s.hint}>
                  {trimmed.length < 3
                    ? 'Введите улицу и дом — подскажем адрес'
                    : touched
                      ? 'Ничего не нашлось. Проверьте написание или впишите вручную ниже.'
                      : 'Введите улицу и дом — подскажем адрес'}
                </Text>
              )
            }
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4 }}
          />

          {/* Ручной ввод — принять как есть, без координат */}
          {trimmed.length > 0 ? (
            <TouchableOpacity style={s.manualRow} onPress={() => pick(trimmed, null, null)} activeOpacity={0.8}>
              <Ionicons name="create-outline" size={18} color={Colors.textSecondary} />
              <Text style={s.manualTxt} numberOfLines={1}>Использовать: «{trimmed}»</Text>
            </TouchableOpacity>
          ) : null}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.divider,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
  },
  fieldError: { borderColor: '#E03A3A' },
  fieldTxt: { flex: 1, fontSize: 15, color: Colors.textPrimary },
  placeholder: { color: Colors.textMuted },
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  title: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, flex: 1 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.divider,
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.inputBorder,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    marginHorizontal: 16, marginTop: 12, marginBottom: 6,
  },
  searchInput: { flex: 1, fontSize: 16, color: Colors.textPrimary, padding: 0 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14 },
  statusTxt: { fontSize: 14, color: Colors.textMuted },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  rowHead: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  rowSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  hint: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingVertical: 24, paddingHorizontal: 8 },
  manualRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderTopWidth: 1, borderTopColor: Colors.divider,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  manualTxt: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
});
