from pathlib import Path

# --- TabHeader: allow replacing Telegram slot with a contextual action ---
header = Path('components/ui/TabHeader.tsx')
h = header.read_text()
h = h.replace(
"""export function TabHeader({
  title, tgAnchor = false, badge, right,
}: {
  title?: string;
  tgAnchor?: boolean;
  badge?: React.ReactNode;
  right?: React.ReactNode;
}) {""",
"""export function TabHeader({
  title, tgAnchor = false, badge, right, primaryAction,
}: {
  title?: string;
  tgAnchor?: boolean;
  badge?: React.ReactNode;
  right?: React.ReactNode;
  primaryAction?: React.ReactNode;
}) {"""
)
h = h.replace(
"""        <View style={h.right}>
          <TelegramConnectButton size={22} pad={4} onboardingAnchor={tgAnchor} />
          <NotifBell />
        </View>""",
"""        <View style={h.right}>
          {primaryAction ?? <TelegramConnectButton size={22} pad={4} onboardingAnchor={tgAnchor} />}
          <NotifBell />
        </View>"""
)
header.write_text(h)

# --- Permanent job swipe deck layout ---
path = Path('app/(tabs)/feed.tsx')
src = path.read_text()

src = src.replace(
"function WorkerPermMode() {",
"function WorkerPermMode({ onUndoChange }: { onUndoChange?: (action: (() => void) | null) => void } = {}) {",
1,
)

undo_old = """  const swUndo = () => {
    setSwHistory(h => {
      if (!h.length) return h;
      const last = h[h.length - 1];
      setSwSkipped(s => { const n = new Set(s); n.delete(last); return n; });
      return h.slice(0, -1);
    });
  };
  swWantRef.current = swWant;"""
undo_new = """  const swUndo = useCallback(() => {
    setSwHistory(h => {
      if (!h.length) return h;
      const last = h[h.length - 1];
      setSwSkipped(s => { const n = new Set(s); n.delete(last); return n; });
      return h.slice(0, -1);
    });
  }, []);
  useEffect(() => {
    onUndoChange?.(swHistory.length ? swUndo : null);
    return () => onUndoChange?.(null);
  }, [swHistory.length, swUndo, onUndoChange]);
  swWantRef.current = swWant;"""
if undo_old not in src:
    raise SystemExit('undo anchor not found')
src = src.replace(undo_old, undo_new, 1)

address_old = """                {(v.metroStation || v.address) ? (
                  <View style={styles.addressChip}>
                    <Ionicons name=\"location-outline\" size={15} color=\"#92400E\" style={{ marginTop: 1 }} />
                    <Text style={styles.addressChipText} numberOfLines={2}>
                      {[v.metroStation, v.address].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                ) : null}"""
address_new = """                {(v.metroStation || v.address) ? (
                  <View style={styles.addressChip}>
                    <Ionicons name=\"location-outline\" size={17} color={Colors.textMuted} />
                    <Text style={styles.addressChipText} numberOfLines={1}>
                      {[v.metroStation, v.address].filter(Boolean).join(' · ')}
                    </Text>
                    <Ionicons name=\"chevron-forward\" size={16} color={Colors.textMuted} />
                  </View>
                ) : null}"""
if address_old not in src:
    raise SystemExit('address anchor not found')
src = src.replace(address_old, address_new, 1)

actions_old = """            <View style={styles.cardActionsRow}>
              <TouchableOpacity
                style={[styles.cardActionItem, !swHistory.length && { opacity: 0.3 }]}
                onPress={swUndo}
                disabled={!swHistory.length}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name=\"arrow-undo\" size={20} color={Colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity style={[styles.cardActionItem, styles.cardActionSkip]} onPress={() => swSkip(0.5)} activeOpacity={0.7}>
                <Ionicons name=\"close\" size={24} color={Colors.red} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cardActionItem}
                onPress={() => { if (!isExternal) openPermChat(v as PermVacancy, displayCompany); }}
                activeOpacity={0.7}
              >
                <Ionicons name={isExternal ? 'open-outline' : 'chatbubble-outline'} size={20} color={Colors.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity style={[styles.cardActionItem, styles.cardActionWant]} onPress={() => swWant(0.5)} activeOpacity={0.7}>
                <Ionicons name=\"heart\" size={22} color=\"#fff\" />
              </TouchableOpacity>
            </View>
"""
if actions_old not in src:
    raise SystemExit('actions anchor not found')
src = src.replace(actions_old, '', 1)

card_end_old = """          </View>
        </Animated.View>
      </View>
    );
  };

  return ("""
card_end_new = """          </View>
        </Animated.View>

        <View style={styles.deckFloatingActions} pointerEvents=\"box-none\">
          <TouchableOpacity
            accessibilityLabel=\"Отклонить вакансию\"
            style={[styles.deckFloatingAction, styles.deckFloatingSkip]}
            onPress={() => swSkip(0.5)}
            activeOpacity={0.75}
          >
            <Ionicons name=\"close\" size={30} color={Colors.red} />
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityLabel={isExternal ? 'Открыть вакансию у источника' : 'Написать работодателю'}
            style={[styles.deckFloatingAction, styles.deckFloatingChat]}
            onPress={() => { if (isExternal) openExternalVacancy(v as ExternalVacancy); else openPermChat(v as PermVacancy, displayCompany); }}
            activeOpacity={0.75}
          >
            <Ionicons name={isExternal ? 'open-outline' : 'chatbubble-outline'} size={23} color={Colors.blue} />
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityLabel=\"Откликнуться на вакансию\"
            style={[styles.deckFloatingAction, styles.deckFloatingWant]}
            onPress={() => swWant(0.5)}
            activeOpacity={0.75}
          >
            <Ionicons name=\"heart\" size={29} color=\"#fff\" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return ("""
if card_end_old not in src:
    raise SystemExit('card end anchor not found')
src = src.replace(card_end_old, card_end_new, 1)

career_old = """function WorkerCareer() {
  const { currentUser } = useApp();

  if (!currentUser) return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <TabHeader title=\"Работа\" />
      <WorkerPermMode />
    </SafeAreaView>
  );
}"""
career_new = """function WorkerCareer() {
  const { currentUser } = useApp();
  const [undoAction, setUndoAction] = useState<(() => void) | null>(null);
  const handleUndoChange = useCallback((action: (() => void) | null) => {
    setUndoAction(() => action);
  }, []);

  if (!currentUser) return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <TabHeader
        title=\"Работа\"
        primaryAction={undoAction ? (
          <TouchableOpacity
            accessibilityLabel=\"Вернуть предыдущую вакансию\"
            onPress={undoAction}
            activeOpacity={0.7}
            style={{ width: rs(30), height: rs(30), alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name=\"arrow-undo-outline\" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        ) : undefined}
      />
      <WorkerPermMode onUndoChange={handleUndoChange} />
    </SafeAreaView>
  );
}"""
if career_old not in src:
    raise SystemExit('career anchor not found')
src = src.replace(career_old, career_new, 1)

src = src.replace(
"cardArea: { flex: 1, flexDirection: 'column', paddingHorizontal: rs(10), paddingTop: rs(10), paddingBottom: rs(80) },",
"cardArea: { flex: 1, flexDirection: 'column', paddingHorizontal: rs(10), paddingTop: rs(10), paddingBottom: rs(96) },",
1,
)
src = src.replace(
"ghost1: { position: 'absolute', left: rs(10), right: rs(10), top: rs(10), bottom: rs(80),",
"ghost1: { position: 'absolute', left: rs(10), right: rs(10), top: rs(10), bottom: rs(96),",
1,
)
src = src.replace(
"ghost2: { position: 'absolute', left: rs(10), right: rs(10), top: rs(10), bottom: rs(80),",
"ghost2: { position: 'absolute', left: rs(10), right: rs(10), top: rs(10), bottom: rs(96),",
1,
)

styles_old = """  addressChip: {
    flexDirection: 'row', alignItems: 'flex-start', gap: rs(8),
    backgroundColor: '#FFF7ED', borderRadius: rs(12), paddingHorizontal: rs(10), paddingVertical: rs(7),
    borderWidth: 1, borderColor: '#FDBA74',
  },
  addressChipIcon: { fontSize: rf(15), marginTop: rs(1) },
  addressChipText: { flex: 1, fontSize: rf(14), fontWeight: '600', color: '#92400E', lineHeight: rf(20) },"""
styles_new = """  addressChip: {
    flexDirection: 'row', alignItems: 'center', gap: rs(8),
    backgroundColor: '#F3F4F6', borderRadius: rs(13), paddingHorizontal: rs(12), paddingVertical: rs(10),
  },
  addressChipIcon: { fontSize: rf(15), marginTop: rs(1) },
  addressChipText: { flex: 1, fontSize: rf(14), fontWeight: '600', color: Colors.textSecondary, lineHeight: rf(20) },"""
if styles_old not in src:
    raise SystemExit('address styles anchor not found')
src = src.replace(styles_old, styles_new, 1)

float_anchor = """  cardActionsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    paddingVertical: rs(10), paddingHorizontal: rs(20),
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },"""
float_new = float_anchor + """
  deckFloatingActions: {
    position: 'absolute', left: rs(24), right: rs(24), bottom: rs(10), zIndex: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
  },
  deckFloatingAction: {
    width: rs(58), height: rs(58), borderRadius: rs(29),
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 6,
  },
  deckFloatingSkip: { backgroundColor: '#FFFFFF' },
  deckFloatingChat: { width: rs(52), height: rs(52), borderRadius: rs(26), backgroundColor: '#FFFFFF' },
  deckFloatingWant: { width: rs(66), height: rs(66), borderRadius: rs(33), backgroundColor: Colors.primary, borderColor: Colors.primary },"""
if float_anchor not in src:
    raise SystemExit('floating styles anchor not found')
src = src.replace(float_anchor, float_new, 1)

path.write_text(src)
