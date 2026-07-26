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
import { LAVKA_LOGO_DATA_URI } from '@/constants/lavkaLogoData';
import { dbAddressSuggest } from '@/services/db';
import { normalizeCompany } from '@/services/storage';

// Одна карточка в шторке над картой: минимум полей, чтобы список
// одинаково собирался и для смен, и для постоянных вакансий.
export type MapListItem = {
  id: string;
  station: string;
  title: string;
  company: string;
  pay?: string;
  meta?: string;
  /** Адрес — к нему и привязана метка; станция остаётся только для фильтра */
  address?: string;
  lat?: number;
  lng?: number;
};

/** Точка на карте — один адрес со всеми вакансиями, которые на нём висят */
type Place = {
  key: string;
  address: string;
  station: string;
  company: string;
  count: number;
  lat: number | null;
  lng: number | null;
  /** Координаты взяты от станции метро: адрес ещё не найден на карте */
  approx: boolean;
};

const { height: SH } = Dimensions.get('window');
// Точки остановки шторки: наполовину — карта ещё видна, вверх — почти весь экран
const SHEET_HALF = Math.round(SH * 0.46);
const SHEET_FULL = Math.round(SH * 0.86);

/** Ключ места: один адрес — одна метка. Без адреса собираем по станции. */
function placeKey(i: MapListItem): string {
  const a = (i.address ?? '').trim().toLowerCase();
  return a ? `a:${a}` : `s:${i.station}`;
}

// Карта Яндекса с кластеризацией: издалека точки собираются в кружки с числом,
// при приближении расходятся на конкретные адреса. Кластеризацию делает штатный
// ymaps.Clusterer — он же по нажатию на кружок приближает карту к его точкам.
function buildHtml(places: Place[]): string {
  const markers = JSON.stringify(places.filter(p => p.lat != null && p.lng != null));
  const center = JSON.stringify(MOSCOW_CENTER);
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<style>
html,body,#map{margin:0;padding:0;width:100%;height:100%;}
.pin{
  /* inline-flex и max-content обязательны: Яндекс кладёт разметку метки в
     контейнер нулевой ширины, и обычный flex схлопывался до одних отступов —
     21 пиксель. От «таблетки» оставалась белая палочка, а логотип с названием
     вываливались наружу. */
  position:relative;display:inline-flex;width:max-content;
  align-items:center;gap:8px;
  background:#fff;border:1px solid #E5E7EB;border-radius:100px;
  padding:5px 14px 5px 5px;white-space:nowrap;
  box-shadow:0 2px 8px rgba(0,0,0,0.2);
  font:600 14px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  color:#111;transform:translate(-50%,-100%);
}
.pin img{width:45px;height:45px;border-radius:23px;display:block;}
.pin .n{
  background:${Colors.primary};color:#fff;border-radius:100px;
  padding:2px 9px;font-size:13px;font-weight:700;
}
</style>
<script src="https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_MAPS_API_KEY}&lang=ru_RU"></script>
</head><body>
<div id="map"></div>
<script>
function send(key){
  try{
    if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage){window.ReactNativeWebView.postMessage(key);}
    else if(window.parent){window.parent.postMessage({jt_place:key},'*');}
  }catch(e){}
}
var PTS=${markers};
var LOGO='${LAVKA_LOGO_DATA_URI}';
ymaps.ready(function(){
  var map=new ymaps.Map('map',{center:${center},zoom:10,controls:['zoomControl','geolocationControl']},{suppressMapOpenBlock:true});

  // Метка адреса: логотип компании и её название — как договаривались,
  // без суммы. Если на адресе несколько смен, рядом стоит их число.
  var PinLayout=ymaps.templateLayoutFactory.createClass(
    '<div class="pin">' +
      '<img src="'+LOGO+'"/>' +
      '<span>$[properties.company]</span>' +
      '{% if properties.count > 1 %}<span class="n">$[properties.count]</span>{% endif %}' +
    '</div>'
  );

  var clusterer=new ymaps.Clusterer({
    preset:'islands#invertedOrangeClusterIcons',
    groupByCoordinates:false,
    clusterDisableClickZoom:false,
    clusterOpenBalloonOnClick:false,
    gridSize:72,
    minClusterSize:2
  });

  var marks=[],coords=[];
  PTS.forEach(function(p){
    var pm=new ymaps.Placemark([p.lat,p.lng],
      {company:p.company,count:p.count,hintContent:p.address},
      {iconLayout:PinLayout,
       // Область метки нужна, иначе Яндекс не знает её размеров и клик
       // не попадает по «таблетке»
       iconShape:{type:'Rectangle',coordinates:[[-95,-62],[95,0]]}});
    pm.events.add('click',function(){send(p.key);});
    marks.push(pm);
    coords.push([p.lat,p.lng]);
  });
  clusterer.add(marks);
  map.geoObjects.add(clusterer);

  if(coords.length===1){map.setCenter(coords[0],14);}
  else if(coords.length>1){
    try{map.setBounds(ymaps.util.bounds.fromPoints(coords),{checkZoomRange:true,zoomMargin:60});}catch(e){}
  }
});
</script>
</body></html>`;
}

export function MetroMap({
  visible, title, items = [], onSelect, onClose,
}: {
  visible: boolean;
  title: string;
  /** Вакансии/смены: из них собираются и метки, и список в шторке */
  items?: MapListItem[];
  onSelect: (station: string) => void;
  onClose: () => void;
}) {
  // Координаты, которых нет в самой вакансии, — догружаем через наш сервер
  // (OpenStreetMap). Геокодер Яндекса у нашего ключа не подключён, поэтому
  // определять адрес прямо в браузере нельзя.
  const [extra, setExtra] = useState<Record<string, [number, number]>>({});
  // Выбранный адрес. Карта при этом остаётся открытой — список выезжает
  // шторкой поверх неё, и её всегда можно вернуть.
  const [sheetKey, setSheetKey] = useState<string | null>(null);

  // Группируем вакансии по адресу: у одного даркстора обычно много смен,
  // и на карте им положено быть одной меткой.
  const places = useMemo<Place[]>(() => {
    const m = new Map<string, Place>();
    for (const i of items) {
      const key = placeKey(i);
      const found = m.get(key);
      if (found) {
        found.count += 1;
        if (found.approx && i.lat != null) {
          found.lat = i.lat; found.lng = i.lng ?? null; found.approx = false;
        }
        continue;
      }
      // Порядок такой: координаты из базы → то, что нашёл геокодер → станция
      // метро. Станция здесь именно временная подстановка, а не ответ: метка
      // сразу видна на карте, а как только адрес найдётся, она переедет на
      // своё место. Раньше без координат метки просто не было — из тридцати
      // одной вакансии на карте висела одна.
      const geo = extra[key];
      const metro = i.station ? METRO_COORDS[i.station] : undefined;
      const exact = i.lat != null ? [i.lat, i.lng ?? null] : geo ?? null;
      m.set(key, {
        key,
        address: i.address?.trim() || (i.station ? `м. ${i.station}` : ''),
        station: i.station,
        // В базе у части вакансий в company лежит имя директора —
        // на карте всегда показываем название сети
        company: normalizeCompany(i.company),
        count: 1,
        lat: exact ? (exact[0] as number) : metro ? metro[0] : null,
        lng: exact ? (exact[1] as number) : metro ? metro[1] : null,
        approx: !exact && !!metro,
      });
    }
    return Array.from(m.values());
  }, [items, extra]);

  // Догеокодируем адреса, у которых координат так и не нашлось: у вакансий,
  // созданных до появления подсказок адреса, их просто нет.
  // Каждая находка меняет places и заново запускает этот эффект. Чтобы список
  // не пошёл по кругу, помним, какие адреса уже спрашивали, и не начинаем
  // второй проход, пока не закончился первый.
  const tried = useRef<Set<string>>(new Set());
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    if (!visible || running.current) return;
    // Ищем адреса, которые пока стоят у метро. Тех, у кого адреса нет вовсе,
    // не трогаем: станция для них и есть окончательный ответ.
    const unknown = places.filter(
      p => p.approx && !tried.current.has(p.key) && !p.address.startsWith('м. '),
    );
    if (unknown.length === 0) return;

    running.current = true;
    (async () => {
      for (const p of unknown) {
        tried.current.add(p.key);
        const res = await dbAddressSuggest(p.address).catch(() => []);
        const hit = res.find(r => r.lat != null && r.lng != null);
        // Записываем каждую находку сразу: метки переезжают на свои места по
        // одной, а не ждут, пока отработает весь список.
        if (hit && alive.current) {
          setExtra(prev => ({ ...prev, [p.key]: [hit.lat as number, hit.lng as number] }));
        }
      }
      running.current = false;
    })();
  }, [visible, places]);

  // Закрыли карту — забываем выбранный адрес, чтобы в следующий раз
  // открылась чистая карта, а не прошлая шторка.
  useEffect(() => { if (!visible) setSheetKey(null); }, [visible]);

  const placed = useMemo(() => places.filter(p => p.lat != null && p.lng != null), [places]);

  // Источник WebView мемоизируем: иначе любое движение шторки пересоздаёт
  // объект source, и карта перезагружается прямо под пальцем.
  const source = useMemo(
    () => ({ html: buildHtml(placed), baseUrl: 'https://jobtoo.ru' }),
    [placed],
  );

  const sheetPlace = sheetKey ? places.find(p => p.key === sheetKey) ?? null : null;
  const placeItems = useMemo(
    () => (sheetKey ? items.filter(i => placeKey(i) === sheetKey) : []),
    [items, sheetKey],
  );
  const sheetLine = sheetPlace?.station
    ? METRO_LINES.find(l => l.stations.includes(sheetPlace.station)) ?? null
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
      .start(() => setSheetKey(null));
  };

  const openSheet = (key: string) => {
    ty.setValue(HIDDEN);
    baseY.current = HALF_Y;
    setSheetKey(key);
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
      if (sheetKey) { closeSheet(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [visible, sheetKey]);

  const handleMarker = (key: string) => {
    if (!key) return;
    if (!items.some(i => placeKey(i) === key)) return;
    if (sheetKey === key) return;
    if (sheetKey) { setSheetKey(key); return; }
    openSheet(key);
  };

  // Веб: слушаем postMessage из iframe
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const handler = (e: any) => {
      const key = e?.data?.jt_place;
      if (key) handleMarker(key);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [visible, items, sheetKey]);

  return (
    <Modal statusBarTranslucent navigationBarTranslucent
      visible={visible}
      animationType="slide"
      onRequestClose={() => { if (sheetKey) closeSheet(); else onClose(); }}
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
          {placed.length === 0 ? (
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
          {sheetPlace ? (
            <Animated.View
              style={[s.sheet, { height: SHEET_FULL, transform: [{ translateY: ty }] }]}
            >
              <View {...pan.panHandlers}>
                <View style={s.grabWrap}><View style={s.grab} /></View>
                <View style={s.sheetHead}>
                  {sheetLine ? <View style={[s.lineDot, { backgroundColor: sheetLine.color }]} /> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={s.sheetTitle} numberOfLines={2}>{sheetPlace.address}</Text>
                    <Text style={s.sheetSub}>
                      {sheetPlace.station ? `м. ${sheetPlace.station} · ` : ''}
                      {placeItems.length} {plural(placeItems.length, 'вариант', 'варианта', 'вариантов')}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={closeSheet} style={s.sheetClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Кнопка «все» закреплена сразу под шапкой: в половинном
                  положении низ шторки уходит за край экрана */}
              {sheetPlace.station ? (
                <TouchableOpacity style={s.allBtn} activeOpacity={0.85} onPress={() => onSelect(sheetPlace.station)}>
                  <Text style={s.allBtnTxt}>Смотреть все на станции</Text>
                  <Ionicons name="arrow-forward" size={15} color="#fff" />
                </TouchableOpacity>
              ) : null}

              <ScrollView
                contentContainerStyle={s.sheetList}
                showsVerticalScrollIndicator={false}
              >
                {placeItems.map(it => (
                  <TouchableOpacity
                    key={it.id}
                    style={s.row}
                    activeOpacity={0.85}
                    onPress={() => onSelect(it.station)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle} numberOfLines={1}>{it.title}</Text>
                      <Text style={s.rowCompany} numberOfLines={1}>{normalizeCompany(it.company)}</Text>
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
  sheetTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, lineHeight: 20 },
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
