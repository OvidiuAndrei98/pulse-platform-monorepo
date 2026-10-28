import { GlassPressable } from '../ui/GlassPressable';
import { ActionIcon } from '../ui/ActionIcon';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, G, Image, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Copy, Download, Share2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Text } from '../ui/Text';
import { DesktopWordmark } from '../ui/DesktopWordmark';
import { usePreferences } from '../PreferencesProvider';
import { eventUrl, type Event } from '../data/events';
import { WEB_URL } from '../config';
import { colors } from '../ui/theme';
import { exportStory, prepareStoryImage } from './exportStory';
import { STORY_TITLE_LEADING, storyDate, storyLocation, storyTitle } from './layout';
import { StoryText } from './StoryText';

export function EventStory({ event, onClose }: { event: Event; onClose: () => void }) {
  const { copy, language } = usePreferences(), viewport = useWindowDimensions(), safe = useSafeAreaInsets();
  const [image, setImage] = useState<string>(), [loaded, setLoaded] = useState(false), [retry, setRetry] = useState(0);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const svg = useRef<Svg>(null), alive = useRef(true), locked = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true; setImage(undefined); setLoaded(false); setError('');
    if (!event.bannerUrl) { setError('eventStory.missingImage'); return; }
    const timeout = setTimeout(() => { if (active) { active = false; setError('eventStory.imageFailed'); } }, 20000);
    void prepareStoryImage(event.bannerUrl).then(value => { if (active) setImage(value); }).catch(() => { if (active) setError('eventStory.imageFailed'); }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); };
  }, [event.bannerUrl, retry]);
  useEffect(() => {
    if (!image || loaded) return;
    const timeout = setTimeout(() => { setImage(undefined); setError('eventStory.imageFailed'); }, 15000);
    return () => clearTimeout(timeout);
  }, [image, loaded]);
  const width = Math.max(120, Math.min(380, viewport.width - 40, (viewport.height - safe.top - safe.bottom - 250) * 9 / 16));
  const title = storyTitle(event.title);
  const titleTop = 1334 - (title.lines.length - 1) * title.size * STORY_TITLE_LEADING - title.size * 0.75;
  const location = storyLocation(event.locationName || event.city);
  const date = storyDate(event.startTime, language);
  const save = async () => {
    if (locked.current || !image || !loaded || !svg.current) return;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Export timeout')), 15000);
        svg.current!.toDataURL(value => { clearTimeout(timeout); value ? resolve(value) : reject(new Error('Empty image')); }, { width: 1080, height: 1920 });
      });
      if (alive.current) await exportStory(result, () => alive.current);
      if (alive.current && Platform.OS === 'web') setNotice('eventStory.saved');
    } catch { if (alive.current) setError('eventStory.failed'); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  };
  return <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
    <View testID="event-story" style={[s.screen, { paddingTop: Math.max(safe.top, 16), paddingBottom: Math.max(safe.bottom, 16) }]}>
      <View style={s.header}><GlassPressable fallback={Pressable} testID="story-close" accessibilityRole="button" accessibilityLabel={copy('common.back')} onPress={onClose} style={s.back}><ActionIcon name="back" size={20} color="white" /></GlassPressable><Text style={s.title}>{copy('eventStory.title')}</Text><View style={{ width: 44 }} /></View>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        {!image ? <View style={{ width, aspectRatio: 9 / 16, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, borderRadius: 20, backgroundColor: '#131012' }}>{error ? <><Text accessibilityRole="alert" style={s.hint}>{copy(error)}</Text><Pressable accessibilityRole="button" testID="story-image-retry" onPress={() => setRetry(x => x + 1)} style={[s.back, { paddingHorizontal: 16 }]}><Text style={{ color: colors.accent }}>{copy('common.retry')}</Text></Pressable></> : <ActivityIndicator color={colors.accent} />}</View> :
          <Svg ref={svg} testID="story-artwork" width={width} height={width * 16 / 9} viewBox="0 0 1080 1920" style={{ overflow: 'hidden' }} accessibilityLabel={event.title}>
            <Defs><LinearGradient id="storyShade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#000" stopOpacity="0.72" /><Stop offset="0.27" stopColor="#000" stopOpacity="0.08" /><Stop offset="0.52" stopColor="#080206" stopOpacity="0.5" /><Stop offset="0.78" stopColor="#080206" stopOpacity="0.97" /><Stop offset="1" stopColor="#080206" /></LinearGradient></Defs>
            <Rect width="1080" height="1920" fill="#080206" />
            <Image href={{ uri: image }} x="0" y="0" width="1080" height="1560" preserveAspectRatio="xMidYMid slice" onLoad={() => setLoaded(true)} />
            <Rect width="1080" height="1920" fill="url(#storyShade)" />
            <DesktopWordmark x={370} y={178} width={340} />
            <Path d="M82 222 H252 M828 222 H998" stroke="#ffffff66" strokeWidth={2} />
            {!!event.category && <StoryText x={540} y={titleTop - 46} size={27} spacing={6} anchor="middle" weight="bold" color="#ffffff">{event.category.toUpperCase()}</StoryText>}
            {title.lines.map((line, i) => <StoryText key={i} x={540} y={1334 - (title.lines.length - 1 - i) * title.size * STORY_TITLE_LEADING}
              size={title.size} width={Math.min(916, Array.from(line).length * title.size * 0.86)} anchor="middle"
              spacing={-title.size * 0.045} weight="black" color="#f5f2eb">{line}</StoryText>)}
            <G transform="rotate(-4 540 1450)">
              <Rect x="-24" y="1396" width="1128" height="112" fill="#ff0044" />
              <StoryText x={108} y={1470} size={57} spacing={-1.5} weight="black" color="#080206">{date.date}</StoryText>
              <Path d="M618 1419 L586 1481" stroke="#080206" strokeWidth={3} />
              <StoryText x={972} y={1470} size={57} spacing={-1.5} weight="black" color="#080206" anchor="end">{date.time}</StoryText>
            </G>
            {location.lines.map((line, i) => <StoryText key={i} x={540} y={1616 + i * 48} size={location.size} weight="bold" anchor="middle" color="#f5f2eb">{line}</StoryText>)}
            {!!event.locationName && !!event.city && event.locationName.trim().toLowerCase() !== event.city.trim().toLowerCase() &&
              <StoryText x={540} y={1616 + location.lines.length * 48} size={25} spacing={1} anchor="middle" color="#aaa4a8">{event.city}</StoryText>}
            <Path d="M498 1732 H582" stroke="#ff0044" strokeWidth={3} />
            <StoryText x={540} y={1796} size={24} spacing={4} anchor="middle" weight="bold" color="#f5f2eb">SPOTTR.RO</StoryText>
          </Svg>}
      </View>
      <View style={s.actions}>
        <Text style={s.hint}>{copy('eventStory.hint')}</Text>
        {!!image && !!error && <Text accessibilityRole="alert" style={[s.hint, { color: '#f87171' }]}>{copy(error)}</Text>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={[s.hint, { color: colors.accent }]}>{copy(notice)}</Text>}
        <Pressable testID="story-export" accessibilityRole="button" accessibilityState={{ disabled: !image || !loaded || busy, busy }} disabled={!image || !loaded || busy} onPress={() => void save()} style={[s.button, { opacity: !image || !loaded || busy ? 0.45 : 1 }]}>{busy ? <ActivityIndicator size="small" color="white" /> : Platform.OS === 'web' ? <Download size={17} color="white" /> : <Share2 size={17} color="white" />}<Text style={s.buttonText}>{copy(busy ? 'eventStory.preparing' : Platform.OS === 'web' ? 'eventStory.download' : 'eventStory.export')}</Text></Pressable>
        <Pressable testID="story-copy-link" accessibilityRole="button" onPress={() => { void Clipboard.setStringAsync(eventUrl(WEB_URL, event.id)).then(ok => { if (alive.current) { if (!ok) setError('feedback.shareFailed'); else setNotice('eventStory.copied'); } }).catch(() => { if (alive.current) setError('feedback.shareFailed'); }); }} style={[s.button, { backgroundColor: '#ffffff0d' }]}><Copy size={16} color="white" /><Text style={s.buttonText}>{copy('eventStory.copyLink')}</Text></Pressable>
      </View>
    </View>
  </Modal>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#000', paddingHorizontal: 20, gap: 12 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, back: { minWidth: 44, minHeight: 44, borderRadius: 99, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff0d' }, title: { color: 'white', fontSize: 18, fontWeight: '600', flexShrink: 1 }, hint: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' }, actions: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 10 }, button: { minHeight: 44, borderRadius: 99, backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, buttonText: { color: 'white', fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'center' } });
