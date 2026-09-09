from pathlib import Path

feed = Path('app/(tabs)/feed.tsx')
s = feed.read_text()

old_filter = """function isRegularExternalVacancy(v: ExternalVacancy): boolean {\n  if (v.kind !== 'permanent') return false;\n  const source = `${v.sourceName ?? ''} ${v.sourceId}`.toLowerCase();\n  const text = `${v.title} ${v.schedule ?? ''} ${v.description ?? ''}`.toLowerCase();\n  const looksRegular = /сменн|подработ|частичн|неполн|гибк|вахт|совместитель/.test(text);\n  return looksRegular && source.length > 0;\n}\n"""
new_filter = """function isRegularExternalVacancy(v: ExternalVacancy): boolean {\n  if (v.kind !== 'permanent') return false;\n  const source = `${v.sourceName ?? ''} ${v.sourceId}`.toLowerCase();\n  // Arbihunter остаётся только в разделе «Работа»: его постоянные вакансии\n  // не дублируем в регулярной подработке даже при гибком/сменном графике.\n  if (/arbihunter|арби.?хантер/.test(source)) return false;\n  const text = `${v.title} ${v.schedule ?? ''} ${v.description ?? ''}`.toLowerCase();\n  const looksRegular = /сменн|подработ|частичн|неполн|гибк|вахт|совместитель/.test(text);\n  return looksRegular && source.length > 0;\n}\n"""
if old_filter not in s:
    raise SystemExit('regular filter block not found')
s = s.replace(old_filter, new_filter, 1)

old_card = """        return (\n          <TouchableOpacity style={rl.card} onPress={() => openSource(v)} activeOpacity={0.9}>\n            <View style={rl.cardHead}>\n              <CompanyMark company={v.company ?? sourceName} size={46} />\n              <View style={{ flex: 1 }}>\n                <Text style={rl.company} numberOfLines={1}>{v.company ?? sourceName}</Text>\n                <Text style={rl.source} numberOfLines={1}>{sourceName}</Text>\n              </View>\n              <Ionicons name=\"open-outline\" size={18} color={Colors.textMuted} />\n            </View>\n            <Text style={rl.jobTitle} numberOfLines={2}>{v.title}</Text>\n            <View style={rl.chips}>\n              {salary ? <Chip label={salary} variant=\"salary\" icon=\"wallet-outline\" /> : null}\n              {v.schedule ? <Chip label={v.schedule} variant=\"time\" icon=\"repeat-outline\" /> : null}\n            </View>\n            {(v.metroStation || v.address) ? (\n              <View style={rl.address}>\n                <Ionicons name=\"location-outline\" size={15} color={Colors.textMuted} />\n                <Text style={rl.addressTxt} numberOfLines={2}>{[v.metroStation, v.address].filter(Boolean).join(' · ')}</Text>\n              </View>\n            ) : null}\n            {v.description ? <Text style={rl.description} numberOfLines={4}>{v.description}</Text> : null}\n            <View style={rl.footer}>\n              <Text style={rl.footerTxt}>Регулярная подработка</Text>\n              <Ionicons name=\"chevron-forward\" size={16} color={Colors.primary} />\n            </View>\n          </TouchableOpacity>\n        );\n"""
new_card = """        return (\n          <TouchableOpacity style={rl.card} onPress={() => openSource(v)} activeOpacity={0.9}>\n            <View style={styles.cardTop}>\n              <View style={styles.companyRow}>\n                <CompanyMark company={v.company ?? sourceName} size={52} />\n                <View style={{ flex: 1 }}>\n                  <Text style={styles.companyName} numberOfLines={1}>{v.company ?? sourceName}</Text>\n                  <View style={styles.metroHintRow}>\n                    <Ionicons name=\"open-outline\" size={12} color={Colors.textMuted} />\n                    <Text style={styles.metroHint} numberOfLines={1}>{v.metroStation ?? sourceName}</Text>\n                  </View>\n                </View>\n                <SourceBadge partnerName={sourceName} />\n              </View>\n\n              <Text style={styles.jobTitle} numberOfLines={2}>{v.title}</Text>\n\n              <View style={styles.chipsRow}>\n                {salary ? <Chip label={salary} variant=\"salary\" icon=\"wallet-outline\" /> : null}\n                <Chip label=\"Регулярная\" variant=\"exp\" icon=\"repeat-outline\" />\n                {v.schedule ? <Chip label={v.schedule} variant=\"time\" icon=\"calendar-outline\" /> : null}\n              </View>\n\n              {(v.metroStation || v.address) ? (\n                <View style={styles.addressChip}>\n                  <Ionicons name=\"location-outline\" size={17} color={Colors.textMuted} />\n                  <Text style={styles.addressChipText} numberOfLines={2}>\n                    {[v.metroStation, v.address].filter(Boolean).join(' · ')}\n                  </Text>\n                  <Ionicons name=\"chevron-forward\" size={16} color={Colors.textMuted} />\n                </View>\n              ) : null}\n            </View>\n\n            {v.description ? (\n              <>\n                <View style={styles.cardDivider} />\n                <View style={styles.cardMiddle}>\n                  <Text style={pS.sectionHead}>Описание</Text>\n                  <Text style={pS.desc} numberOfLines={5}>{v.description}</Text>\n                </View>\n              </>\n            ) : null}\n          </TouchableOpacity>\n        );\n"""
if old_card not in s:
    raise SystemExit('regular card block not found')
s = s.replace(old_card, new_card, 1)

old_style = "  card: { backgroundColor: Colors.bg, borderRadius: rs(18), padding: rs(16), ...Shadow.card, gap: rs(11) },"
new_style = "  card: { backgroundColor: Colors.bg, borderRadius: rs(24), borderWidth: 1, borderColor: Colors.divider, overflow: 'hidden', ...Shadow.card },"
if old_style not in s:
    raise SystemExit('regular card style not found')
s = s.replace(old_style, new_style, 1)
feed.write_text(s)

api = Path('php-proxy/trudvsem.php')
t = api.read_text()
old_base = "$BASE = rtrim(tv_cfg('TRUDVSEM_API_BASE', 'https://opendata.trudvsem.ru/api/v1/vacancies/region'), '/');"
new_base = "$BASE = rtrim(tv_cfg('TRUDVSEM_API_BASE', 'http://opendata.trudvsem.ru/api/v1/vacancies/region'), '/');"
if old_base not in t:
    raise SystemExit('trudvsem base not found')
t = t.replace(old_base, new_base, 1)
old_proto = '    CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,'
new_proto = '    // Официальный мануал API публикует opendata.trudvsem.ru по HTTP.\n    CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,'
if old_proto not in t:
    raise SystemExit('trudvsem protocol setting not found')
t = t.replace(old_proto, new_proto, 1)
api.write_text(t)
