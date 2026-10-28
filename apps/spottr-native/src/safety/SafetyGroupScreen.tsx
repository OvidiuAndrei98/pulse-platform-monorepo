import { GlassPressable } from '../ui/GlassPressable';
import { ActionIcon } from '../ui/ActionIcon';
import { FormInput as TextInput } from '../ui/FormInput';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Check, Clock3, MapPin, MessageCircle, Send, UserPlus, UsersRound, X } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { usePreferences } from '../PreferencesProvider';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { formatDate } from '../data/events';
import { useSafetyGroup } from './useSafetyGroup';
import { selectedSafetyFriends, type SafetyFriend } from './data';
import { HoldForHelp } from './HoldForHelp';

export type SafetyGroupScreenProps = { eventId: string; onBack: () => void; onLogin: () => void; bottomBar?: React.ReactNode };
export function SafetyGroupScreen(props: SafetyGroupScreenProps) {
  const { user } = useAuth();
  // Draft messages, selections and permission-dependent timers belong to one account.
  return <SafetyScreen key={props.eventId + ':' + (user?.id ?? 'guest')} {...props} />;
}
function SafetyScreen({ eventId, onBack, onLogin, bottomBar }: SafetyGroupScreenProps) {
  const state = useSafetyGroup(eventId), { copy, language } = usePreferences(), safe = useSafeAreaInsets();
  const [selected, setSelected] = useState<string[]>([]), [inviteOpen, setInviteOpen] = useState(false), [message, setMessage] = useState('');
  const [layoutHeight, setLayoutHeight] = useState(0), viewport = useKeyboardViewport();
  const [feedback, setFeedback] = useState<string | null>(null), [feedbackError, setFeedbackError] = useState(false);
  const messages = useRef<ScrollView>(null), login = useRef(onLogin); login.current = onLogin;
  const group = state.data?.group, chosen = state.data ? selectedSafetyFriends(state.data, selected) : [];
  const compact = viewport.open && ((viewport.height ?? layoutHeight) - safe.top < 360);
  useEffect(() => { if (state.ready && !state.user) login.current(); }, [state.ready, state.user]);
  useEffect(() => {
    if (!state.notice && !state.actionError) return;
    setFeedback(state.actionError ? state.actionError.message ?? copy(state.actionError.key) : copy(state.notice!)); setFeedbackError(!!state.actionError);
    const timer = setTimeout(() => setFeedback(null), 5000); return () => clearTimeout(timer);
  }, [state.notice, state.actionError, copy]);
  useEffect(() => { if (state.data) setSelected(current => selectedSafetyFriends(state.data!, current)); }, [state.data]);
  const choose = (friendId: string) => setSelected(current => current.includes(friendId) ? current.filter(v => v !== friendId) : selectedSafetyFriends(state.data!, [...current, friendId]));
  const send = async () => {
    const submitted = message;
    if (await state.controller.run({ kind: 'messages', content: submitted })) setMessage(current => current === submitted ? '' : current);
  };
  const create = async () => { if (await state.controller.run({ kind: 'create', friendIds: chosen })) setSelected([]); };
  const invite = async () => { if (await state.controller.run({ kind: 'invite', friendIds: chosen })) { setSelected([]); setInviteOpen(false); } };
  const accepted = group?.members.filter(member => member.status === 'accepted') ?? [];
  const canInvite = !!group && group.ownerId === state.user?.id && group.members.length < 8 && !!state.data?.eligibleFriends.length;
  const keyboardWeb = Platform.OS === 'web' ? { onKeyDown: (event: { key: string; shiftKey: boolean; preventDefault(): void }) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } } } : {};

  return <View testID="safety-group-page" style={[s.root, viewport.height !== null && { height: viewport.height, flex: 0 }]}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View onLayout={event => setLayoutHeight(event.nativeEvent.layout.height)} style={[s.inner, { paddingTop: safe.top + (compact ? 4 : 12), paddingBottom: viewport.open ? Math.max(8, safe.bottom) : 96 + safe.bottom }]}>
        <View style={[s.header, compact && { paddingVertical: 0, gap: 8 }]}>
          <GlassPressable fallback={Pressable} testID="safety-back" accessibilityRole="button" accessibilityLabel={copy('common.back')} onPress={onBack} style={[s.back, compact && { width: 36, height: 36 }]}><ActionIcon name="back" color={colors.text} size={24} /></GlassPressable>
          <View><Text style={[s.heading, compact && { fontSize: 14 }]}>{copy('safetyGroup.title')}</Text>{!compact && <Text style={s.small}>{copy('safetyGroup.private')}</Text>}</View>
        </View>
        {!state.ready || !state.user || state.pending ? <View style={s.loading}><ActivityIndicator color={colors.accent} accessibilityLabel={copy('common.loading')} /></View>
          : state.error || !state.data ? <View style={s.errorPanel}><Text style={[s.body, { textAlign: 'center' }]}>{state.error?.message ?? copy(state.error?.key ?? 'safetyGroup.loadFailed')}</Text><Action testID="safety-retry" title={copy('common.retry')} onPress={() => void state.controller.load()} style={{ marginTop: 20 }} /></View>
          : !group ? <ScrollView testID="safety-create-panel" style={{ flex: 1, marginTop: 12 }} contentContainerStyle={{ paddingVertical: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}><View style={s.createIcon}><UsersRound color={colors.accent} size={24} /></View><View style={{ flex: 1 }}><Text style={s.sectionTitle}>{copy('safetyGroup.createTitle')}</Text><Text style={[s.body, { color: colors.muted, lineHeight: 24, marginTop: 4 }]}>{copy('safetyGroup.createHint')}</Text></View></View>
            {state.data.eligibleFriends.length ? <View style={{ gap: 8 }}><Text style={[s.label, { marginBottom: 4 }]}>{copy('safetyGroup.inviteFriends')}</Text>{state.data.eligibleFriends.map(friend => <FriendChoice key={friend.userId} friend={friend} selected={chosen.includes(friend.userId)} onToggle={() => choose(friend.userId)} />)}</View>
              : <Text style={[s.body, { padding: 16, borderRadius: 16, backgroundColor: '#ffffff0d', color: colors.muted }]}>{copy('safetyGroup.noEligibleFriends')}</Text>}
            <Action testID="safety-create" icon={<UserPlus size={20} color="white" />} title={copy(state.working ? 'safetyGroup.creating' : 'safetyGroup.create')} disabled={!state.data.canCreate || !chosen.length || state.working} onPress={() => void create()} style={{ marginTop: 4, minHeight: 56 }} />
            {!state.data.canCreate && <Text style={[s.small, { textAlign: 'center', marginTop: -8 }]}>{copy('safetyGroup.ticketRequired')}</Text>}
          </ScrollView>
          : group.currentMemberStatus === 'pending' ? <ScrollView contentContainerStyle={{ paddingTop: 32, gap: 20 }}>
            <View testID="safety-invitation" style={s.invitation}><UserPlus color={colors.accent} size={40} /><Text style={[s.heading, { marginTop: 16 }]}>{copy('safetyGroup.invitationTitle')}</Text><Text style={[s.body, { marginTop: 8, color: colors.muted, textAlign: 'center' }]}>{copy('safetyGroup.invitationBody', { event: group.eventTitle })}</Text><View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
              <Action testID="safety-decline" secondary icon={<X size={16} color="white" />} title={copy('common.decline')} disabled={state.working} onPress={() => void state.controller.run({ kind: 'respond', status: 'declined' })} style={{ flex: 1 }} />
              <Action testID="safety-accept" icon={<Check size={16} color="white" />} title={copy('common.accept')} disabled={state.working} onPress={() => void state.controller.run({ kind: 'respond', status: 'accepted' })} style={{ flex: 1 }} />
            </View></View><Retention />
          </ScrollView>
          : <View style={{ flex: 1, minHeight: 0 }}>
            {state.connectionLost && !compact && <Text testID="safety-connection-lost" accessibilityLiveRegion="polite" style={s.connection}>{copy('safetyGroup.connectionLost')}</Text>}
            <View style={[s.event, compact && { minHeight: 28, paddingBottom: 4 }]}>
              <View style={{ flex: 1 }}><Text numberOfLines={1} style={[s.body, { fontSize: compact ? 14 : 16, fontWeight: '600' }]}>{group.eventTitle}</Text>{!compact && <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 5 }}><MapPin color={colors.accent} size={14} /><Text numberOfLines={1} style={[s.small, { flexShrink: 1 }]}>{group.eventLocation}</Text><Text style={s.small}>·</Text><Clock3 color={colors.accent} size={14} /><Text style={s.small}>{formatDate(group.startTime, language, true)}</Text></View>}</View>
              {!compact && <View style={{ flexDirection: 'row', alignItems: 'center' }}>{accepted.slice(0, 3).map((member, index) => <View key={member.userId} style={{ marginLeft: index ? -8 : 0, borderWidth: 2, borderColor: '#000', borderRadius: 99 }}><Avatar person={member} size={28} /></View>)}{accepted.length > 3 && <Text style={s.memberOverflow}>+{accepted.length - 3}</Text>}{canInvite && <Pressable testID="safety-invite-open" accessibilityRole="button" accessibilityLabel={copy('safetyGroup.inviteMore')} accessibilityState={{ expanded: inviteOpen }} onPress={() => { setSelected([]); setInviteOpen(v => !v); }} style={s.inviteIcon}><UserPlus color="white" size={16} /></Pressable>}</View>}
            </View>
            <View style={{ paddingVertical: compact ? 4 : 12 }}>
              {group.currentUserNeedsHelp ? <Action testID="safety-resolve-help" title={copy('safetyGroup.iAmSafe')} icon={<Check size={16} color="#6ee7b7" />} disabled={state.working || !state.active} onPress={() => void state.controller.run({ kind: 'help-resolved', content: copy('safetyGroup.safeMessage') })} style={[s.safeButton, compact && { minHeight: 36, paddingVertical: 4 }]} labelStyle={{ color: '#6ee7b7', fontSize: 14 }} />
                : <HoldForHelp compact={compact} disabled={!group.canSendHelp || state.working || !state.active} onComplete={() => void state.controller.run({ kind: 'help', content: copy('safetyGroup.helpMessage') })} />}
              {!group.canSendHelp && !compact && <Text style={[s.small, { fontSize: 11, marginTop: 6, textAlign: 'center' }]}>{copy('safetyGroup.helpAfterValidation')}</Text>}
            </View>
            <View style={[s.chat, compact && { paddingTop: 0 }]}>
              {!compact && <View style={s.chatHeader}><MessageCircle size={16} color={colors.accent} /><Text style={[s.body, { fontWeight: '600' }]}>{copy('safetyGroup.messages')}</Text></View>}
              <ScrollView ref={messages} testID="safety-messages" style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 12, paddingRight: 4, gap: 10 }} keyboardShouldPersistTaps="handled" onContentSizeChange={() => messages.current?.scrollToEnd({ animated: true })}>
                {!compact && <Retention compact />}{!group.messages.length && <Text style={[s.body, { color: colors.muted, textAlign: 'center', paddingVertical: 32 }]}>{copy('safetyGroup.noMessages')}</Text>}
                {group.messages.map(item => <View key={item.id} testID={'safety-message-' + item.id} style={[s.bubble, item.senderId === state.user?.id && { alignSelf: 'flex-end', backgroundColor: colors.accent }, item.kind === 'help' && s.alertBubble, item.kind === 'help_resolved' && s.resolvedBubble]}><Text style={{ color: 'white', opacity: 0.7, fontSize: 11, fontWeight: '600' }}>{item.senderUsername}</Text><Text style={[s.body, { marginTop: 2, lineHeight: 20 }]}>{item.content}</Text></View>)}
              </ScrollView>
              <View style={s.composer}><TextInput variant="bare" {...keyboardWeb} testID="safety-message-input" accessibilityLabel={copy('safetyGroup.messagePlaceholder')} value={message} onChangeText={setMessage} onFocus={() => setInviteOpen(false)} maxLength={500} multiline placeholder={copy('safetyGroup.messagePlaceholder')} placeholderTextColor={colors.muted} style={s.input} />
                <Pressable testID="safety-send" accessibilityRole="button" accessibilityLabel={copy('safetyGroup.send')} disabled={!message.trim() || state.working} onPress={() => void send()} style={[s.send, (!message.trim() || state.working) && { opacity: 0.4 }]}><Send size={20} color="white" /></Pressable>
              </View>
            </View>
            {inviteOpen && canInvite && <View testID="safety-invite-panel" style={[s.invitePanel, { maxHeight: (viewport.height ?? layoutHeight) * 0.55 }]}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Text style={[s.label, { flex: 1 }]}>{copy('safetyGroup.inviteMore')}</Text><Pressable accessibilityRole="button" accessibilityLabel={copy('common.close')} onPress={() => setInviteOpen(false)} style={s.close}><X color="white" size={16} /></Pressable></View><ScrollView contentContainerStyle={{ gap: 8, paddingRight: 4 }} style={{ marginTop: 8, flexShrink: 1 }} keyboardShouldPersistTaps="handled">{state.data.eligibleFriends.map(friend => <FriendChoice key={friend.userId} friend={friend} selected={chosen.includes(friend.userId)} onToggle={() => choose(friend.userId)} />)}</ScrollView><Action testID="safety-invite-send" icon={<UserPlus size={16} color="white" />} title={copy(state.working ? 'safetyGroup.inviting' : 'safetyGroup.sendInvites')} disabled={!chosen.length || state.working} onPress={() => void invite()} style={{ marginTop: 12, minHeight: 40 }} /></View>}
          </View>}
      </View>
    </KeyboardAvoidingView>
    {!viewport.open && bottomBar}
    {!!feedback && <Pressable testID="safety-feedback" accessibilityLiveRegion="polite" onPress={() => setFeedback(null)} style={[s.toast, { top: safe.top + 72, borderColor: feedbackError ? '#f8717180' : '#ffffff26' }]}><Text style={s.body}>{feedback}</Text></Pressable>}
  </View>;
}

function Avatar({ person, size }: { person: SafetyFriend; size: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [person.avatarUrl]);
  return <View accessibilityLabel={person.username} style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#ffffff1a', alignItems: 'center', justifyContent: 'center' }}>{person.avatarUrl && !failed ? <Image source={{ uri: person.avatarUrl }} style={{ width: size, height: size }} contentFit="cover" draggable={false} onError={() => setFailed(true)} /> : <Text style={{ color: 'white', fontWeight: '600', fontSize: size < 32 ? 11 : 16 }}>{person.username.slice(0, 1).toUpperCase()}</Text>}</View>;
}
function FriendChoice({ friend, selected, onToggle }: { friend: SafetyFriend; selected: boolean; onToggle: () => void }) {
  return <Pressable testID={'safety-friend-' + friend.userId} accessibilityRole="button" accessibilityState={{ selected }} onPress={onToggle} style={[s.friend, selected && { borderColor: '#ff004480', backgroundColor: '#ff00441a' }]}><Avatar person={friend} size={40} /><Text style={[s.body, { flex: 1, fontSize: 16, fontWeight: '500' }]}>{friend.username}</Text><View style={[s.check, selected && { backgroundColor: colors.accent, borderColor: colors.accent }]}>{selected && <Check size={16} color="white" />}</View></Pressable>;
}
function Retention({ compact }: { compact?: boolean }) { const { copy } = usePreferences(); return <Text style={[s.small, { textAlign: 'center', lineHeight: compact ? 16 : 20 }, compact && { fontSize: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#ffffff09', marginBottom: 2 }]}>{copy('safetyGroup.retention')}</Text>; }
function Action({ title, onPress, disabled, secondary, icon, style, labelStyle, testID }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; icon?: React.ReactNode; style?: React.ComponentProps<typeof View>['style']; labelStyle?: React.ComponentProps<typeof Text>['style']; testID?: string }) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={[s.action, secondary && { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#ffffff26' }, style, disabled && { opacity: 0.4 }]}>{icon}<Text style={[s.body, { fontSize: 16, fontWeight: '600', textAlign: 'center' }, labelStyle]}>{title}</Text></Pressable>;
}
function useKeyboardViewport() {
  const dimensions = useWindowDimensions(), [open, setOpen] = useState(false), [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const viewport = window.visualViewport;
      const update = () => {
        const keyboard = !!viewport && Math.abs(viewport.scale - 1) < 0.01 && window.innerHeight - viewport.height > 100;
        setOpen(keyboard); setHeight(keyboard ? viewport!.height : null);
      };
      viewport?.addEventListener('resize', update); update();
      return () => viewport?.removeEventListener('resize', update);
    }
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return { open, height, windowHeight: dimensions.height };
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' }, inner: { flex: 1, minHeight: 0, width: '100%', maxWidth: 672, alignSelf: 'center', paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }, back: { width: 44, height: 44, borderRadius: 99, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff0d', alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '600', color: colors.text }, sectionTitle: { fontSize: 18, fontWeight: '600', color: colors.text }, small: { fontSize: 12, color: colors.muted }, body: { fontSize: 14, color: colors.text }, label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.7, color: colors.muted },
  loading: { height: 192, marginTop: 40, borderRadius: 28, backgroundColor: '#ffffff0d', justifyContent: 'center' }, errorPanel: { marginTop: 40, borderRadius: 28, borderWidth: 1, borderColor: '#ff00444d', backgroundColor: '#ff00441a', padding: 24 },
  createIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ff004426' },
  action: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 99, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  friend: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, borderColor: '#ffffff1a', padding: 12, backgroundColor: '#ffffff06' }, check: { width: 24, height: 24, borderRadius: 99, borderWidth: 1, borderColor: '#ffffff33', alignItems: 'center', justifyContent: 'center' },
  invitation: { borderRadius: 30, borderWidth: 1, borderColor: '#ff004440', backgroundColor: '#ff004414', padding: 24, alignItems: 'center' },
  event: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderColor: '#ffffff1a', paddingBottom: 12 }, memberOverflow: { width: 32, height: 32, textAlign: 'center', verticalAlign: 'middle', lineHeight: 28, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: '#000', backgroundColor: '#ffffff1a', fontSize: 10, fontWeight: '600', color: 'white', marginLeft: -8 }, inviteIcon: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#000', backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  connection: { marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: '#fbbf244d', backgroundColor: '#fbbf241a', paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, color: '#fde68a' }, safeButton: { minHeight: 44, backgroundColor: '#34d3991a', borderWidth: 1, borderColor: '#34d39966', paddingVertical: 10 },
  chat: { flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff09', paddingHorizontal: 12, paddingTop: 12 }, chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderColor: '#ffffff1a', paddingHorizontal: 4, paddingBottom: 10 },
  bubble: { maxWidth: '88%', alignSelf: 'flex-start', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#ffffff14' }, alertBubble: { borderWidth: 1, borderColor: '#f87171', backgroundColor: '#ef444426' }, resolvedBubble: { borderWidth: 1, borderColor: '#34d3994d', backgroundColor: '#34d3991a' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderTopWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#00000033', paddingVertical: 10 }, input: { flex: 1, minHeight: 44, maxHeight: 96, borderRadius: 16, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#0000004d', color: colors.text, fontSize: 14, fontFamily: 'Inter_400Regular', paddingHorizontal: 16, paddingVertical: 10 }, send: { width: 44, height: 44, borderRadius: 99, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  invitePanel: { position: 'absolute', left: 0, right: 0, top: 64, zIndex: 30, borderRadius: 24, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#080a09', padding: 12, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }, close: { width: 32, height: 32, borderRadius: 99, backgroundColor: '#ffffff0d', alignItems: 'center', justifyContent: 'center' }, toast: { position: 'absolute', zIndex: 50, left: 20, right: 20, alignSelf: 'center', maxWidth: 632, borderWidth: 1, borderRadius: 16, backgroundColor: '#141414', padding: 16 },
});
