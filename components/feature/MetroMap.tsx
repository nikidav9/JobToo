import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Platform, ActivityIndicator,
  Animated, PanResponder, ScrollView, Dimensions, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { Colors } from '@/constants/theme';
import { METRO_LINES } from '@/constants/metro';
import { METRO_COORDS, MOSCOW_CENTER, YANDEX_MAPS_API_KEY } from '@/constants/metroCoords';
import { dbAddressSuggest } from '@/services/db';

export type StationCount = { station: string; count: number };

// Одна карточка в шторке над картой: минимум полей, чтобы список
// одинаково собирался и для смен, и для постоянных вакансий.
export type MapListItem = {
  id: string;
  station: string;
  title: string;
  company: string;
  pay?: string;
  meta?: string;
};

const { height: SH } = Dimensions.get('window');
// Точки остановки шторки: наполовину — карта ещё видна, вверх — почти весь экран
const SHEET_HALF = Math.round(SH * 0.46);
const SHEET_FULL = Math.round(SH * 0.86);

// Собираем HTML с картой Яндекса и метками-кружками (число смен/вакансий у станции).
// Координаты приходят готовыми: геокодер Яндекса у нашего ключа не подключён.
function buildHtml(points: { station: string; count: number; lat: number | null; lng: number | null }[]): string {
  const markers = JSON.stringify(points);
  const center = JSON.stringify(MOSCOW_CENTER);
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;}</style>
<script src="https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_MAPS_API_KEY}&lang=ru_RU"></script>
</head><body>
<div id="map"></div>
<script>
function send(name){
  try{
    if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage){window.ReactNativeWebView.postMessage(name);}
    else if(window.parent){window.parent.postMessage({jt_station:name},'*');}
  }catch(e){}
}
var PTS=${markers};
ymaps.ready(function(){
  var map=new ymaps.Map('map',{center:${center},zoom:10,controls:['zoomControl','geolocationControl']},{suppressMapOpenBlock:true});
  var coords=[];
  function addMarker(p,c){
    var pm=new ymaps.Placemark(c,{iconContent:String(p.count),hintContent:p.station,balloonContent:p.station+' — '+p.count},
      {preset:'islands#violetCircleIcon',iconColor:'#7C3AED'});
    pm.events.add('click',function(){send(p.station);});
    map.geoObjects.add(pm);
  }
  PTS.forEach(function(p){
    if(p.lat!=null&&p.lng!=null){ addMarker(p,[p.lat,p.lng]); coords.push([p.lat,p.lng]); }
  });
  if(coords.length===1){map.setCenter(coords[0],13);}
  else if(coords.length>1){
    try{map.setBounds(ymaps.util.bounds.fromPoints(coords),{checkZoomRange:true,zoomMargin:60});}catch(e){}
  }
});
</script>
</body></html>`;
}

export function MetroMap({
  visible, title, points, items = [], onSelect, onClose,
}: {
  visible: boolean;
  title: string;
  points: StationCount[];
  /** Вакансии/смены, которые стоят за метками: из них собирается шторка */
  items?: MapListItem[];
  onSelect: (station: string) => void;
  onClose: () => void;
}) {
  // Координаты станций, которых нет в справочнике, — догружаем через наш
  // сервер (OpenStreetMap). Так на карте окажется даже станция, добавленная
  // впервые: полагаться на геокодер Яндекса нельзя, он у ключа не подключён.
  const [extra, setExtra] = useState<Record<string, [number, number]>>({});
  // Станция, выбранная на карте. Карта при этом остаётся открытой —
  // список выезжает шторкой поверх неё, и её всегда можно вернуть.
  const [sheetStation, setSheetStation] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const unknown = points.map(p => p.station).filter(st => !METRO_COORDS[st] && !extra[st]);
    if (unknown.length === 0) return;
    let cancelled = false;
    (async () => {
      const found: Record<string, [number, number]> = {};
      for (const st of unknown) {
        const res = await dbAddressSuggest(`метро ${st}, Москва`);
        const hit = res.find(r => r.lat != null && r.lng != null);
        if (hit) found[st] = [hit.lat as number, hit.lng as number];
      }
      if (!cancelled && Object.keys(found).length) setExtra(prev => ({ ...prev, ...found }));
    })();
    return () => { cancelled = true; };
  }, [visible, points]);

  // Закрыли карту — забываем выбранную станцию, чтобы в следующий раз
  // открылась чистая карта, а не прошлая шторка.
  useEffect(() => { if (!visible) setSheetStation(null); }, [visible]);

  const mapped = useMemo(() => points.map(p => {
    const c = METRO_COORDS[p.station] ?? extra[p.station];
    return { station: p.station, count: p.count, lat: c ? c[0] : null, lng: c ? c[1] : null };
  }), [points, extra]);

  // Источник WebView мемоизируем: иначе любое движение шторки пересоздаёт
  // объект source, и карта перезагружается прямо под пальцем.
  const source = useMemo(
    () => ({ html: buildHtml(mapped), baseUrl: 'https://jobtoo.ru' }),
    [mapped],
  );

  const stationItems = useMemo(
    () => (sheetStation ? items.filter(i => i.station === sheetStation) : []),
    [items, sheetStation],
  );
  const sheetLine = sheetStation
    ? METRO_LINES.find(l => l.stations.includes(sheetStation)) ?? null
    : null;

  // ── Шторка ───────────────────────────────────────────────────────────
  // Высота у шторки постоянная (SHEET_FULL), меняется только сдвиг вниз:
  // так вся анимация уходит в нативный драйвер и не дёргается при перетаскивании.
  //   0                        — раскрыта на весь экран
  //   SHEET_FULL - SHEET_HALF  — наполовину, карта сверху видна
  //   HIDDEN                   — убрана за нижний край
  const HIDDEN = SHEET_FULL + 40;
  const HALF_Y = SHEET_FULL - SHEET_HALF;
  const ty = useRef(new Animated.Value(HIDDEN)).current;
  const baseY = useRef(HIDDEN);

  const settle = (to: number) => {
    baseY.current = to;
    Animated.spring(ty, { toValue: to, useNativeDriver: true, bounciness: 0, speed: 14 }).start();
  };

  const closeSheet = () => {
    baseY.current = HIDDEN;
    Animated.timing(ty, { toValue: HIDDEN, duration: 180, useNativeDriver: true })
      .start(() => setSheetStation(null));
  };

  const openSheet = (st: string) => {
    ty.setValue(HIDDEN);
    baseY.current = HALF_Y;
    setSheetStation(st);
    Animated.spring(ty, { toValue: HALF_Y, useNativeDriver: true, bounciness: 0, speed: 12 }).start();
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_e, g) => {
        const next = baseY.current + g.dy;
        ty.setValue(Math.max(0, Math.min(HIDDEN, next)));
      },
      onPanResponderRelease: (_e, g) => {
        const expanded = baseY.current <= 1;
        if (g.dy > 90 || g.vy > 1.1) {
          // Смахнули вниз: из раскрытой — на половину, с половины — совсем убрали
          if (expanded) { settle(HALF_Y); return; }
          closeSheet(); return;
        }
        if (!expanded && (g.dy < -60 || g.vy < -0.8)) { settle(0); return; }
        settle(baseY.current);
      },
      onPanResponderTerminate: () => settle(baseY.current),
    }),
  ).current;

  // Аппаратная кнопка «назад» на Android: сначала убираем шторку, и только
  // вторым нажатием закрываем карту — иначе не вернуться к карте.
  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheetStation) { closeSheet(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [visible, sheetStation]);

  const handleMarker = (st: string) => {
    if (!st) return;
    // Если карточек по станции нет (например, список не передали) — работаем
    // по-старому: применяем фильтр и уходим в список.
    if (!items.some(i => i.station === st)) { onSelect(st); return; }
    if (sheetStation === st) return;
    if (sheetStation) { setSheetStation(st); return; }
    openSheet(st);
  };

  // Веб: слушаем postMessage из iframe
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const handler = (e: any) => {
      const st = e?.data?.jt_station;
      if (st) handleMarker(st);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [visible, items, sheetStation]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => { if (sheetStation) closeSheet(); else onClose(); }}
      statusBarTranslucent
    >
      <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
        <View style={s.header}>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={s.listBtn} activeOpacity={0.8}>
            <Ionicons name="list" size={16} color="#fff" />
            <Text style={s.listTxt}>Список</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1 }}>
          {mapped.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="map-outline" size={48} color={Colors.textMuted} />
              <Text style={s.emptyTxt}>Пока нет точек на карте</Text>
            </View>
          ) : Platform.OS === 'web' ? (
            // react-native-web отрендерит настоящий iframe
            React.createElement('iframe', {
              srcDoc: source.html,
              style: { border: 'none', width: '100%', height: '100%' },
              allow: 'geolocation',
            })
          ) : (
            <WebView
              originWhitelist={['*']}
              // baseUrl → чтобы Яндекс видел referrer jobtoo.ru, если ключ ограничен по домену
              source={source}
              onMessage={(e) => handleMarker(e.nativeEvent.data)}
              startInLoadingState
              renderLoading={() => (
                <View style={s.empty}><ActivityIndicator size="large" color={Colors.primary} /></View>
              )}
              geolocationEnabled
            />
          )}

          {/* Шторка со списком: карта под ней остаётся живой, шторку можно
              смахнуть вниз и снова оказаться на карте */}
          {sheetStation ? (
            <Animated.View
              style={[s.sheet, { height: SHEET_FULL, transform: [{ translateY: ty }] }]}
            >
              <View {...pan.panHandlers}>
                <View style={s.grabWrap}><View style={s.grab} /></View>
                <View style={s.sheetHead}>
                  {sheetLine ? <View style={[s.lineDot, { backgroundColor: sheetLine.color }]} /> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={s.sheetTitle} numberOfLines={1}>м. {sheetStation}</Text>
                    <Text style={s.sheetSub}>
                      {stationItems.length} {plural(stationItems.length, 'вариант', 'варианта', 'вариантов')}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={closeSheet} style={s.sheetClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Кнопка «все» закреплена сразу под шапкой: в половинном
                  положении низ шторки уходит за край экрана */}
              <TouchableOpacity style={s.allBtn} activeOpacity={0.85} onPress={() => onSelect(sheetStation)}>
                <Text style={s.allBtnTxt}>Смотреть все на станции</Text>
                <Ionicons name="arrow-forward" size={15} color="#fff" />
              </TouchableOpacity>

              <ScrollView
                contentContainerStyle={s.sheetList}
                showsVerticalScrollIndicator={false}
              >
                {stationItems.map(it => (
                  <TouchableOpacity
                    key={it.id}
                    style={s.row}
                    activeOpacity={0.85}
                    onPress={() => onSelect(it.station)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle} numberOfLines={1}>{it.title}</Text>
                      <Text style={s.rowCompany} numberOfLines={1}>{it.company}</Text>
                      {it.meta ? <Text style={s.rowMeta} numberOfLines={1}>{it.meta}</Text> : null}
                    </View>
                    {it.pay ? <Text style={s.rowPay}>{it.pay}</Text> : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Animated.View>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
  return many;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  title: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, flex: 1 },
  listBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8,
  },
  listTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTxt: { fontSize: 14, color: Colors.textMuted },

  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 }, elevation: 16,
    overflow: 'hidden',
  },
  grabWrap: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  grab: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.divider },
  sheetHead: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  lineDot: { width: 10, height: 10, borderRadius: 5 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  sheetSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  sheetClose: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg,
  },
  sheetList: { padding: 14, gap: 10, paddingBottom: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.bg, borderRadius: 14, padding: 12,
  },
  rowTitle: { fontSize: 14.5, fontWeight: '700', color: Colors.textPrimary },
  rowCompany: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 2 },
  rowMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 3 },
  rowPay: { fontSize: 15, fontWeight: '800', color: Colors.primary },
  allBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 12,
    marginHorizontal: 14, marginTop: 12,
  },
  allBtnTxt: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
});
