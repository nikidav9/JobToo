from pathlib import Path

p = Path('app/(tabs)/feed.tsx')
s = p.read_text()

# Partner cards: remove explicit source/open-source copy while preserving branding.
s = s.replace("""                          <Text style={styles.metroHint}>
                            {'external' in currentCard
                              ? `Источник: ${(currentCard as PartnerShiftCard).external.sourceName ?? 'партнёр'} · отклик на его сайте`
                              : currentCard.metroStation}
                          </Text>""", """                          <Text style={styles.metroHint}>
                            {'external' in currentCard ? (currentCard.metroStation ?? '') : currentCard.metroStation}
                          </Text>""")

s = s.replace("""                      <Text style={styles.metroHint} numberOfLines={1}>
                        {isExternal ? `Источник: ${sourceName ?? 'партнёр'}` : (v.metroStation ?? 'Постоянная вакансия')}
                      </Text>""", """                      <Text style={styles.metroHint} numberOfLines={1}>
                        {v.metroStation ?? (isExternal ? '' : 'Постоянная вакансия')}
                      </Text>""")

source_cta = """            {/* «Подробнее о вакансии» убрали: всё описание уже в карточке
                («Читать ещё»). Для партнёрских оставляем переход к источнику. */}
            {isExternal ? (
              <TouchableOpacity style={styles.detailHintRow} activeOpacity={0.7} onPress={() => openExternalVacancy(v as ExternalVacancy)}>
                <Text style={styles.detailHintText}>Открыть у источника</Text>
                <Text style={styles.detailHintArrow}>→</Text>
              </TouchableOpacity>
            ) : null}

"""
if source_cta in s:
    s = s.replace(source_cta, '')

# Middle action always uses the chat icon, including partner cards.
s = s.replace("name={'external' in currentCard ? 'open-outline' : 'chatbubble-outline'}", 'name="chatbubble-outline"')
s = s.replace("<Ionicons name={isExternal ? 'open-outline' : 'chatbubble-outline'} size={23} color={Colors.blue} />", '<Ionicons name="chatbubble-outline" size={24} color={Colors.blue} />')
s = s.replace('<Ionicons name="chatbubble-outline" size={23} color={Colors.blue} />', '<Ionicons name="chatbubble-outline" size={24} color={Colors.blue} />')

# Permanent-card read-more is based on the actual full rendered line count.
perm_start = s.index('function WorkerPermMode(')
head = s[:perm_start]
perm = s[perm_start:]

state_old = """  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });"""
state_new = """  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [truncatedDescriptions, setTruncatedDescriptions] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const rememberDescriptionLines = (id: string, lines: number) => {
    setTruncatedDescriptions(prev => {
      const shouldShow = lines > 5;
      if (prev.has(id) === shouldShow) return prev;
      const next = new Set(prev);
      shouldShow ? next.add(id) : next.delete(id);
      return next;
    });
  };"""
if state_old in perm:
    perm = perm.replace(state_old, state_new, 1)

desc_new = """                    <View style={{ position: 'relative' }}>
                      <Text style={pS.desc} numberOfLines={isOpen ? undefined : 5}>{description}</Text>
                      {!isOpen ? (
                        <Text
                          accessible={false}
                          style={[pS.desc, { position: 'absolute', opacity: 0, left: 0, right: 0, top: 0 }]}
                          onTextLayout={(e) => rememberDescriptionLines(v.id, e.nativeEvent.lines.length)}
                        >
                          {description}
                        </Text>
                      ) : null}
                    </View>
                    {(isOpen || truncatedDescriptions.has(v.id)) ? (
                      <TouchableOpacity style={pS.readMore} onPress={() => toggleExpanded(v.id)} activeOpacity={0.7}>
                        <Text style={pS.readMoreTxt}>{isOpen ? 'Свернуть' : 'Читать ещё'}</Text>
                        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.primary} />
                      </TouchableOpacity>
                    ) : null}"""

desc_old = """                    <Text style={pS.desc} numberOfLines={isOpen ? undefined : 5}>{description}</Text>
                    {description.length > 140 ? (
                      <TouchableOpacity style={pS.readMore} onPress={() => toggleExpanded(v.id)} activeOpacity={0.7}>
                        <Text style={pS.readMoreTxt}>{isOpen ? 'Свернуть' : 'Читать ещё'}</Text>
                        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.primary} />
                      </TouchableOpacity>
                    ) : null}"""
if desc_old in perm:
    perm = perm.replace(desc_old, desc_new, 1)

limited_old = """                    <Text
                      style={pS.desc}
                      numberOfLines={isOpen ? undefined : 5}
                      onTextLayout={(e) => { if (!isOpen) rememberDescriptionLines(v.id, e.nativeEvent.lines.length); }}
                    >{description}</Text>
                    {(isOpen || truncatedDescriptions.has(v.id)) ? (
                      <TouchableOpacity style={pS.readMore} onPress={() => toggleExpanded(v.id)} activeOpacity={0.7}>
                        <Text style={pS.readMoreTxt}>{isOpen ? 'Свернуть' : 'Читать ещё'}</Text>
                        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.primary} />
                      </TouchableOpacity>
                    ) : null}"""
if limited_old in perm:
    perm = perm.replace(limited_old, desc_new, 1)

s = head + perm

# Reference proportions: X and heart equal, chat smaller.
old_styles = """  deckFloatingAction: {
    width: rs(66), height: rs(66), borderRadius: rs(33),
    alignItems: 'center', justifyContent: 'center',
    // elevation выше карточки (у неё 10), иначе на Android круги уходят ПОД
    // карточку и видны лишь верхушки над её нижним краем.
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 16,
  },
  deckFloatingSkip: { backgroundColor: '#FFFFFF' },
  deckFloatingChat: { width: rs(54), height: rs(54), borderRadius: rs(27), backgroundColor: '#FFFFFF' },
  deckFloatingWant: { width: rs(66), height: rs(66), borderRadius: rs(33), backgroundColor: Colors.primary, borderColor: Colors.primary },"""
new_styles = """  deckFloatingAction: {
    width: rs(68), height: rs(68), borderRadius: rs(34),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF', borderWidth: 0.75, borderColor: '#EEF0F3',
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.10, shadowRadius: 12, elevation: 16,
  },
  deckFloatingSkip: { backgroundColor: '#FFFFFF' },
  deckFloatingChat: { width: rs(54), height: rs(54), borderRadius: rs(27), backgroundColor: '#FFFFFF' },
  deckFloatingWant: { width: rs(68), height: rs(68), borderRadius: rs(34), backgroundColor: Colors.primary, borderColor: Colors.primary },"""
if old_styles in s:
    s = s.replace(old_styles, new_styles, 1)

s = s.replace("""  shiftDeckActions: {
    position: 'absolute', left: rs(24), right: rs(24), bottom: rs(28), zIndex: 20, elevation: 20,
    alignItems: 'center', gap: rs(8),
  },
  shiftDeckRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(24),
  },
  swipeHintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(8) },
  swipeHint: { fontSize: rf(12), color: Colors.textMuted, fontWeight: '500' },""", """  shiftDeckActions: {
    position: 'absolute', left: rs(24), right: rs(24), bottom: rs(28), zIndex: 20, elevation: 20,
    alignItems: 'center', gap: rs(10),
  },
  shiftDeckRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(30),
  },
  swipeHintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(9), marginTop: rs(1) },
  swipeHint: { fontSize: rf(12), lineHeight: rf(16), color: '#9AA3B2', fontWeight: '500' },""")

# Lower cluster: circles only barely overlap the bottom edge of the card.
s = s.replace('{ bottom: tabBarHeight + rs(54) }', '{ bottom: tabBarHeight + rs(18) }')

# Icon weight and curved arrows.
s = s.replace('<Ionicons name="close" size={30} color={Colors.red} />', '<Ionicons name="close" size={34} color={Colors.red} />')
s = s.replace('<Ionicons name="heart" size={29} color="#fff" />', '<Ionicons name="heart" size={31} color="#fff" />')
s = s.replace('<Ionicons name="arrow-undo-outline" size={18} color={Colors.textMuted} />', '<Ionicons name="arrow-undo-outline" size={20} color="#9AA3B2" />')
s = s.replace('<Ionicons name="arrow-redo-outline" size={18} color={Colors.textMuted} />', '<Ionicons name="arrow-redo-outline" size={20} color="#9AA3B2" />')

p.write_text(s)
