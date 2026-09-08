from pathlib import Path

path = Path('app/(tabs)/feed.tsx')
src = path.read_text()

card_old = """                  <SourceBadge partnerName={isExternal ? (sourceName ?? 'Партнёр') : undefined} />
                </View>

                <Text style={styles.jobTitle} numberOfLines={2}>{v.title}</Text>"""
card_new = """                  <SourceBadge partnerName={isExternal ? (sourceName ?? 'Партнёр') : undefined} />
                </View>

                {!isExternal ? (
                  <View style={pS.deckUtilityActions}>
                    <TouchableOpacity
                      accessibilityLabel=\"Поделиться вакансией\"
                      style={pS.deckUtilityBtn}
                      onPress={() => { void shareVacancy(v as PermVacancy); }}
                      activeOpacity={0.75}
                    >
                      <Ionicons name=\"share-outline\" size={18} color={Colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityLabel={permSavedIds.includes(v.id) ? 'Удалить из избранного' : 'Добавить в избранное'}
                      style={[pS.deckUtilityBtn, permSavedIds.includes(v.id) && pS.deckUtilityBtnSaved]}
                      onPress={() => toggleSaved(v as PermVacancy)}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={permSavedIds.includes(v.id) ? 'heart' : 'heart-outline'}
                        size={18}
                        color={permSavedIds.includes(v.id) ? Colors.red : Colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                ) : null}

                <Text style={styles.jobTitle} numberOfLines={2}>{v.title}</Text>"""

if 'deckUtilityActions' not in src:
    if src.count(card_old) != 1:
        raise SystemExit(f'card anchor count: {src.count(card_old)}')
    src = src.replace(card_old, card_new)

styles_old = """  tabChipsScroll: {
    flex: 1, flexShrink: 1, alignSelf: 'stretch',
  },
  tabChipsRow: {
    flexDirection: 'row', gap: rs(8),
    paddingHorizontal: rs(16), paddingVertical: rs(10),
  },
  tabChip: {
    flexDirection: 'row', alignItems: 'center', gap: rs(5),
    borderRadius: rs(100), paddingHorizontal: rs(12), paddingVertical: rs(8),
    borderWidth: 1.5, borderColor: Colors.inputBorder,
    backgroundColor: Colors.bg, flexShrink: 0,
  },
  tabChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  tabChipTxt: { fontSize: rf(13), fontWeight: '500', color: Colors.textSecondary },
  tabChipTxtActive: { color: Colors.primary, fontWeight: '700' },
  tabChipCount: { fontSize: rf(13), fontWeight: '600', color: Colors.textMuted },
  tabChipCountActive: { color: Colors.primary },"""
styles_new = """  tabChipsScroll: {
    flex: 1, flexShrink: 1, alignSelf: 'stretch', minWidth: 0,
  },
  tabChipsRow: {
    flexGrow: 1, flexDirection: 'row', gap: rs(6),
    paddingLeft: rs(12), paddingVertical: rs(10),
  },
  tabChip: {
    flex: 1, minWidth: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(4),
    borderRadius: rs(100), paddingHorizontal: rs(8), paddingVertical: rs(8),
    borderWidth: 1.5, borderColor: Colors.inputBorder,
    backgroundColor: Colors.bg,
  },
  tabChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  tabChipTxt: { fontSize: rf(12.5), fontWeight: '500', color: Colors.textSecondary, flexShrink: 1 },
  tabChipTxtActive: { color: Colors.primary, fontWeight: '700' },
  tabChipCount: { fontSize: rf(12.5), fontWeight: '600', color: Colors.textMuted, flexShrink: 0 },
  tabChipCountActive: { color: Colors.primary },
  deckUtilityActions: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: rs(8),
    marginTop: rs(-2),
  },
  deckUtilityBtn: {
    width: rs(38), height: rs(38), borderRadius: rs(12),
    borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  deckUtilityBtnSaved: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },"""

if "tabChipsScroll: {\n    flex: 1, flexShrink: 1, alignSelf: 'stretch', minWidth: 0," not in src:
    if src.count(styles_old) != 1:
        raise SystemExit(f'tab styles anchor count: {src.count(styles_old)}')
    src = src.replace(styles_old, styles_new)

path.write_text(src)
