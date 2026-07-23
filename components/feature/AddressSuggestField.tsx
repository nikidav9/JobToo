import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Platform, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { Colors } from '@/constants/theme';
import { YANDEX_MAPS_API_KEY, MOSCOW_CENTER } from '@/constants/metroCoords';

export type PickedAddress = { address: string; lat: number | null; lng: number | null };

// Подсказки адресов берём из JS-API Яндекс.Карт прямо в WebView (тем же ключом,
// что и карта метро). Серверный Suggest API у Яндекса только для браузера, поэтому
// используем ymaps.suggest внутри страницы. При выборе адреса геокодируем его и
// возвращаем в приложение и текст, и координаты (lat/lng), чтобы их сохранить.
function buildHtml(initial: string): string {
  const center = JSON.stringify(MOSCOW_CENTER);
  const init = JSON.stringify(initial || '');
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<style>
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
  html,body{margin:0;padding:0;height:100%;font-family:-apple-system,Roboto,Segoe UI,sans-serif;background:#fff;}
  #wrap{padding:12px;}
  #q{width:100%;font-size:16px;padding:14px 14px;border:1px solid #E2E5EA;border-radius:12px;outline:none;}
  #q:focus{border-color:#2F6FED;}
  #list{margin-top:8px;}
  .item{padding:14px 12px;border-bottom:1px solid #F0F1F4;font-size:15px;color:#1A1D23;cursor:pointer;}
  .item:active{background:#F2F6FF;}
  .item small{display:block;color:#8A909A;font-size:12px;margin-top:2px;}
  #hint{color:#8A909A;font-size:13px;padding:16px 12px;text-align:center;}
</style>
<script src="https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_MAPS_API_KEY}&lang=ru_RU"></script>
</head><body>
<div id="wrap">
  <input id="q" placeholder="Начните вводить адрес…" autocomplete="off" value=${init}/>
  <div id="list"></div>
  <div id="hint">Введите улицу и дом — подскажем адрес</div>
</div>
<script>
function send(obj){
  var s=JSON.stringify(obj);
  try{
    if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage){window.ReactNativeWebView.postMessage(s);}
    else if(window.parent){window.parent.postMessage({jt_addr:obj},'*');}
  }catch(e){}
}
ymaps.ready(function(){
  var q=document.getElementById('q');
  var list=document.getElementById('list');
  var hint=document.getElementById('hint');
  var timer=null, reqId=0;
  q.focus();
  function setHint(t){ hint.textContent=t; hint.style.display='block'; }
  // Геокодер отдаёт и адрес, и координаты сразу — второй запрос при выборе не нужен.
  function render(objs){
    list.innerHTML='';
    if(!objs||!objs.length){ setHint('Ничего не нашлось. Уточните улицу и дом.'); return; }
    hint.style.display='none';
    objs.forEach(function(obj){
      var name = obj.getAddressLine ? obj.getAddressLine() : (obj.properties.get('text')||'');
      var c = obj.geometry.getCoordinates();
      var short = name.replace(/^Россия,\\s*/,'').replace(/^Москва,\\s*/,'');
      var d=document.createElement('div');
      d.className='item';
      d.innerHTML='<span>'+short+'</span><small>'+name+'</small>';
      d.addEventListener('click',function(){
        send({address:name, lat:c?c[0]:null, lng:c?c[1]:null});
      });
      list.appendChild(d);
    });
  }
  function search(v){
    var my=++reqId;
    setHint('Ищем адрес…');
    ymaps.geocode('Москва, '+v, {results:7, boundedBy:[[55.14,36.80],[56.02,37.97]]}).then(function(res){
      if(my!==reqId) return; // пришёл устаревший ответ — игнорируем
      var objs=[]; res.geoObjects.each(function(o){ objs.push(o); });
      render(objs);
    }).catch(function(e){
      if(my!==reqId) return;
      setHint('Не удалось загрузить подсказки. Впишите адрес вручную ниже.');
    });
  }
  q.addEventListener('input',function(){
    clearTimeout(timer);
    var v=q.value.trim();
    if(v.length<3){ list.innerHTML=''; setHint('Введите улицу и дом — подскажем адрес'); return; }
    timer=setTimeout(function(){ search(v); },350);
  });
});
</script>
</body></html>`;
}

export function AddressSuggestField({
  value, onChange, placeholder, error,
}: {
  value: string;
  onChange: (address: string, lat: number | null, lng: number | null) => void;
  placeholder?: string;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const handlePicked = useCallback((p: PickedAddress) => {
    onChange(p.address, p.lat, p.lng);
    setOpen(false);
  }, [onChange]);

  // Веб: слушаем postMessage из iframe
  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const handler = (e: any) => {
      const a = e?.data?.jt_addr;
      if (a && typeof a.address === 'string') handlePicked(a);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [open, handlePicked]);

  const html = buildHtml(value);

  return (
    <>
      <TouchableOpacity
        style={[s.field, error ? s.fieldError : null]}
        onPress={() => setOpen(true)}
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

          <View style={{ flex: 1 }}>
            {Platform.OS === 'web' ? (
              React.createElement('iframe', {
                srcDoc: html,
                style: { border: 'none', width: '100%', height: '100%' },
              })
            ) : (
              <WebView
                originWhitelist={['*']}
                source={{ html, baseUrl: 'https://jobtoo.ru' }}
                onMessage={(e) => {
                  try {
                    const a = JSON.parse(e.nativeEvent.data);
                    if (a && typeof a.address === 'string') handlePicked(a);
                  } catch {}
                }}
                keyboardDisplayRequiresUserAction={false}
                hideKeyboardAccessoryView
              />
            )}
          </View>

          {/* Ручной ввод как запасной вариант, если подсказок нет */}
          <View style={s.manualRow}>
            <Text style={s.manualHint}>Нет нужного адреса? Впишите вручную:</Text>
            <TextInput
              style={s.manualInput}
              defaultValue={value}
              placeholder="ул. Складская, д. 5"
              placeholderTextColor={Colors.textMuted}
              onSubmitEditing={(e) => {
                const t = e.nativeEvent.text.trim();
                if (t) { onChange(t, null, null); setOpen(false); }
              }}
              returnKeyType="done"
            />
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface ?? '#fff',
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
  manualRow: {
    borderTopWidth: 1, borderTopColor: Colors.divider,
    paddingHorizontal: 16, paddingVertical: 12, gap: 8,
    backgroundColor: Colors.bg,
  },
  manualHint: { fontSize: 12, color: Colors.textMuted },
  manualInput: {
    borderWidth: 1, borderColor: Colors.divider, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: Colors.textPrimary,
  },
});
