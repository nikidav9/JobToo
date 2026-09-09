from pathlib import Path

p = Path('app/(tabs)/feed.tsx')
s = p.read_text()

s = s.replace(
    '<Ionicons name="lock-closed" size={13} color={Colors.textMuted} />\n        <Text style={[sst.txt, sst.txtLocked]}>Регулярная</Text>',
    '<Ionicons name="repeat-outline" size={13} color={value === \'regular\' ? Colors.textPrimary : Colors.textMuted} />\n        <Text style={[sst.txt, value === \'regular\' && sst.txtActive]}>Регулярная</Text>',
    1,
)

old = '''// Заглушка «Регулярной»: раздел ещё готовим — вместо ленты замок и «Скоро».
function RegularLocked() {
  return (
    <View style={rl.wrap}>
      <View style={rl.ring}>
        <Ionicons name="lock-closed" size={30} color={Colors.primary} />
      </View>
      <Text style={rl.title}>Регулярные подработки</Text>
      <Text style={rl.desc}>
        Постоянные смены у одного работодателя — график на неделю вперёд.
        Готовим этот раздел.
      </Text>
      <View style={rl.soon}>
        <Text style={rl.soonTxt}>СКОРО</Text>
      </View>
    </View>
  );
}
'''
new = '''// «Регулярная» — не разовая смена на конкретную дату, а повторяющаяся
// сменная/гибкая подработка из внешнего источника. В первую очередь сюда
// попадает «Работа в России»: у неё такие предложения приходят как обычные
// вакансии с графиком «Сменная работа», поэтому не превращаем их в фиктивные
// смены JobToo и не придумываем дату/время.
function isRegularExternalVacancy(v: ExternalVacancy): boolean {
  if (v.kind !== 'permanent') return false;
  const source = `${v.sourceName ?? ''} ${v.sourceId}`.toLowerCase();
  const text = `${v.title} ${v.schedule ?? ''} ${v.description ?? ''}`.toLowerCase();
  const looksRegular = /сменн|подработ|частичн|неполн|гибк|вахт|совместитель/.test(text);
  return looksRegular && source.length > 0;
}

function RegularLocked() {
  const { currentUser, showToast } = useApp();
  const [items, setItems] = useState<ExternalVacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const rows = await dbGetExternalVacancies();
      setItems(rows.filter(isRegularExternalVacancy));
    } catch {
      showToast('Не удалось обновить регулярные подработки', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const openSource = useCallback((v: ExternalVacancy) => {
    if (currentUser && !currentUser.isGuest) {
      dbRecordExternalClick(v.id, v.sourceId, currentUser.id).catch(() => {});
    }
    Linking.openURL(v.url).catch(() => showToast('Не удалось открыть источник', 'error'));
  }, [currentUser, showToast]);

  if (loading) {
    return <View style={rl.wrap}><ActivityIndicator color={Colors.primary} /></View>;
  }

  if (items.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={[rl.wrap, { flexGrow: 1 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={Colors.primary} colors={[Colors.primary]} />}
      >
        <View style={rl.ring}>
          <Ionicons name="repeat-outline" size={30} color={Colors.primary} />
        </View>
        <Text style={rl.title}>Регулярных подработок пока нет</Text>
        <Text style={rl.desc}>Потяните вниз, чтобы обновить предложения партнёров.</Text>
      </ScrollView>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={v => v.id}
      contentContainerStyle={rl.list}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={Colors.primary} colors={[Colors.primary]} />}
      renderItem={({ item: v }) => {
        const salary = typeof v.salary === 'number' && v.salary > 0
          ? `${v.salary.toLocaleString('ru-RU')} ₽${v.payPeriod === 'hour' ? '/ч' : v.payPeriod === 'shift' ? '/смена' : '/мес'}`
          : null;
        const sourceName = v.sourceName ?? (v.sourceId.toLowerCase().includes('trudvsem') ? 'Работа в России' : 'Партнёр');
        return (
          <TouchableOpacity style={rl.card} onPress={() => openSource(v)} activeOpacity={0.9}>
            <View style={rl.cardHead}>
              <CompanyMark company={v.company ?? sourceName} size={46} />
              <View style={{ flex: 1 }}>
                <Text style={rl.company} numberOfLines={1}>{v.company ?? sourceName}</Text>
                <Text style={rl.source} numberOfLines={1}>{sourceName}</Text>
              </View>
              <Ionicons name="open-outline" size={18} color={Colors.textMuted} />
            </View>
            <Text style={rl.jobTitle} numberOfLines={2}>{v.title}</Text>
            <View style={rl.chips}>
              {salary ? <Chip label={salary} variant="salary" icon="wallet-outline" /> : null}
              {v.schedule ? <Chip label={v.schedule} variant="time" icon="repeat-outline" /> : null}
            </View>
            {(v.metroStation || v.address) ? (
              <View style={rl.address}>
                <Ionicons name="location-outline" size={15} color={Colors.textMuted} />
                <Text style={rl.addressTxt} numberOfLines={2}>{[v.metroStation, v.address].filter(Boolean).join(' · ')}</Text>
              </View>
            ) : null}
            {v.description ? <Text style={rl.description} numberOfLines={4}>{v.description}</Text> : null}
            <View style={rl.footer}>
              <Text style={rl.footerTxt}>Регулярная подработка</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}
'''
if old not in s:
    raise SystemExit('RegularLocked block not found')
s = s.replace(old, new, 1)

old_style = '''const rl = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: rs(40), gap: rs(12) },
  ring: {
    width: rs(74), height: rs(74), borderRadius: rs(37),
    backgroundColor: Colors.primaryLight, borderWidth: 1, borderColor: Colors.primaryBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: rf(18), fontWeight: '800', color: Colors.textPrimary },
  desc: { fontSize: rf(13.5), color: Colors.textSecondary, textAlign: 'center', lineHeight: rf(20) },
  soon: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.divider,
    borderRadius: rs(100), paddingHorizontal: rs(14), paddingVertical: rs(6),
  },
  soonTxt: { fontSize: rf(12), fontWeight: '800', color: Colors.textSecondary, letterSpacing: 0.5 },
});'''
new_style = '''const rl = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: rs(40), gap: rs(12) },
  list: { padding: rs(16), paddingBottom: rs(120), gap: rs(12) },
  ring: {
    width: rs(74), height: rs(74), borderRadius: rs(37),
    backgroundColor: Colors.primaryLight, borderWidth: 1, borderColor: Colors.primaryBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: rf(18), fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  desc: { fontSize: rf(13.5), color: Colors.textSecondary, textAlign: 'center', lineHeight: rf(20) },
  card: { backgroundColor: Colors.bg, borderRadius: rs(18), padding: rs(16), ...Shadow.card, gap: rs(11) },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: rs(11) },
  company: { fontSize: rf(14), fontWeight: '700', color: Colors.textPrimary },
  source: { fontSize: rf(11.5), color: Colors.textMuted, marginTop: rs(2) },
  jobTitle: { fontSize: rf(18), lineHeight: rf(23), fontWeight: '800', color: Colors.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(7) },
  address: { flexDirection: 'row', alignItems: 'flex-start', gap: rs(6), backgroundColor: Colors.surface, borderRadius: rs(12), padding: rs(10) },
  addressTxt: { flex: 1, fontSize: rf(12.5), color: Colors.textSecondary, lineHeight: rf(17) },
  description: { fontSize: rf(13), color: Colors.textSecondary, lineHeight: rf(19) },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: rs(11) },
  footerTxt: { fontSize: rf(13), fontWeight: '700', color: Colors.primary },
});'''
if old_style not in s:
    raise SystemExit('rl style block not found')
s = s.replace(old_style, new_style, 1)
p.write_text(s)
