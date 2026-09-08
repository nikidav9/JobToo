from pathlib import Path

p = Path('app/(tabs)/feed.tsx')
s = p.read_text()

start = s.index('function WorkerFeed(')
end = s.index('// ─────────────────────────────────────────────────\n// Worker Permanent mode')
head, worker, tail = s[:start], s[start:end], s[end:]

state_old = """  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });"""
state_new = """  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [truncatedShiftDescriptions, setTruncatedShiftDescriptions] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const rememberShiftDescriptionLines = (id: string, lines: number) => {
    setTruncatedShiftDescriptions(prev => {
      const shouldShow = lines > 6;
      if (prev.has(id) === shouldShow) return prev;
      const next = new Set(prev);
      shouldShow ? next.add(id) : next.delete(id);
      return next;
    });
  };"""
if state_old in worker:
    worker = worker.replace(state_old, state_new, 1)

body_old = """                            <Text style={pS.desc} numberOfLines={expanded.has(currentCard.id) ? undefined : 6}>
                              {currentCard.conditions}
                            </Text>
                            {currentCard.conditions.length > 160 ? (
                              <TouchableOpacity style={pS.readMore} onPress={() => toggleExpanded(currentCard.id)} activeOpacity={0.7}>
                                <Text style={pS.readMoreTxt}>{expanded.has(currentCard.id) ? 'Свернуть' : 'Читать ещё'}</Text>
                                <Ionicons name={expanded.has(currentCard.id) ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.primary} />
                              </TouchableOpacity>
                            ) : null}"""
body_new = """                            <View style={{ position: 'relative' }}>
                              <Text style={pS.desc} numberOfLines={expanded.has(currentCard.id) ? undefined : 6}>
                                {currentCard.conditions}
                              </Text>
                              {!expanded.has(currentCard.id) ? (
                                <Text
                                  accessible={false}
                                  style={[pS.desc, { position: 'absolute', opacity: 0, left: 0, right: 0, top: 0 }]}
                                  onTextLayout={(e) => rememberShiftDescriptionLines(currentCard.id, e.nativeEvent.lines.length)}
                                >
                                  {currentCard.conditions}
                                </Text>
                              ) : null}
                            </View>
                            {(expanded.has(currentCard.id) || truncatedShiftDescriptions.has(currentCard.id)) ? (
                              <TouchableOpacity style={pS.readMore} onPress={() => toggleExpanded(currentCard.id)} activeOpacity={0.7}>
                                <Text style={pS.readMoreTxt}>{expanded.has(currentCard.id) ? 'Свернуть' : 'Читать ещё'}</Text>
                                <Ionicons name={expanded.has(currentCard.id) ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.primary} />
                              </TouchableOpacity>
                            ) : null}"""
if body_old in worker:
    worker = worker.replace(body_old, body_new, 1)

p.write_text(head + worker + tail)
