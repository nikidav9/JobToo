import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { Colors } from '@/constants/theme';
import { METRO_COORDS, MOSCOW_CENTER, YANDEX_MAPS_API_KEY } from '@/constants/metroCoords';

export type StationCount = { station: string; count: number };

// Собираем HTML с картой Яндекса и метками-кружками (число смен/вакансий у станции).
// У станций с известными координатами (lat/lng) метка ставится сразу; у остальных
// координаты определяются геокодером Яндекса прямо в браузере (JS-API, тем же ключом),
// чтобы на карте появилась ЛЮБАЯ станция, где разместили вакансию.
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
    else {
      // Координат нет — определяем через геокодер Яндекса по названию станции
      ymaps.geocode('Москва, метро '+p.station,{results:1}).then(function(res){
        var obj=res.geoObjects.get(0);
        if(obj){ addMarker(p,obj.geometry.getCoordinates()); }
      }).catch(function(){});
    }
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
  visible, title, points, onSelect, onClose,
}: {
  visible: boolean;
  title: string;
  points: StationCount[];
  onSelect: (station: string) => void;
  onClose: () => void;
}) {
  // Все станции: у известных берём зашитые координаты, у остальных — null
  // (их геокодит сам Яндекс в HTML, чтобы появилась любая станция).
  const mapped = points.map(p => {
    const c = METRO_COORDS[p.station];
    return { station: p.station, count: p.count, lat: c ? c[0] : null, lng: c ? c[1] : null };
  });

  const html = buildHtml(mapped);

  // Веб: слушаем postMessage из iframe
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const handler = (e: any) => {
      const st = e?.data?.jt_station;
      if (st) onSelect(st);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [visible, onSelect]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
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
              srcDoc: html,
              style: { border: 'none', width: '100%', height: '100%' },
              allow: 'geolocation',
            })
          ) : (
            <WebView
              originWhitelist={['*']}
              // baseUrl → чтобы Яндекс видел referrer jobtoo.ru, если ключ ограничен по домену
              source={{ html, baseUrl: 'https://jobtoo.ru' }}
              onMessage={(e) => { const st = e.nativeEvent.data; if (st) onSelect(st); }}
              startInLoadingState
              renderLoading={() => (
                <View style={s.empty}><ActivityIndicator size="large" color={Colors.primary} /></View>
              )}
              geolocationEnabled
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
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
});
