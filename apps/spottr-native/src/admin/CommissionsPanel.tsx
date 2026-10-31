import { AccentPressable } from '../ui/AccentPressable';
import React, { useRef, useState } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { accountApi, useAuth } from '../auth/AuthProvider';
import { usePreferences } from '../usePreferences';
import { Text } from '../ui/Text';
import { FormInput } from '../ui/FormInput';
import { colors } from '../ui/theme';
import { commissionFormula, commissionText, parseCommissionInputs, parseCommissionSettings, type OrganizerCommission, type CommissionSettings } from '../../../pulse-app/src/features/admin/commissions';
import type { DirectoryDetail } from '../../../pulse-app/src/features/admin/organizers';

export function CommissionsPanel({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const { user, controller } = useAuth();
  // Remount on identity change, so a previous account's edit cannot survive logout.
  return user?.role === 'admin' ? <Panel key={user.id + controller.getToken()} initiallyOpen={initiallyOpen} /> : null;
}
function Panel({ initiallyOpen }: { initiallyOpen: boolean }) {
  const { user, controller } = useAuth(), { language } = usePreferences(), ro = language === 'ro', t = commissionText(ro);
  const [open, setOpen] = useState(initiallyOpen), [search, setSearch] = useState(''), [editing, setEditing] = useState<'standard' | OrganizerCommission | null>(null);
  const query = useQuery({ queryKey: ['admin-commissions', user?.id], enabled: open, retry: false, queryFn: async ({ signal }) => parseCommissionSettings(await accountApi('/admin/commissions', { token: controller.getToken(), signal })) });
  const data = query.data;
  const editor = (target: 'standard' | OrganizerCommission) => <Editor target={target} data={data!} close={() => setEditing(null)} saved={() => { setEditing(null); void query.refetch(); }} />;
  return <View style={s.section}>
    <Button label={t.title} id="admin-commissions" disabled={!!editing} onPress={() => { setOpen(!open); if (!open) void query.refetch(); }} />
    {open && <>
      <Text style={s.hint}>{t.hint}</Text>
      {query.isPending ? <Text style={s.hint}>{t.loading}</Text> : query.isError ? <><Text style={s.error}>{t.loadFailed}</Text><Button label={t.retry} onPress={() => void query.refetch()} /></> : data && <>
        <View style={s.card}><Text style={s.title}>{t.standard}</Text><Text style={s.formula}>{commissionFormula(data.standard, ro)}</Text><Text style={s.hint}>{t.future}</Text>{editing === 'standard' ? editor('standard') : <Button label={t.edit} id="commission-edit-standard" disabled={!!editing} onPress={() => setEditing('standard')} />}</View>
        <FormInput accessibilityLabel={t.search} placeholder={t.search} value={search} onChangeText={setSearch} editable={!editing} style={s.input} />
        {data.organizers.filter(o => `${o.companyName} ${o.email}`.toLowerCase().includes(search.trim().toLowerCase())).map(o => <View key={o.organizerId} style={s.card}>
          <View style={s.row}><Text style={[s.title, { flex: 1 }]}>{o.companyName}</Text><Text style={s.badge}>{o.override ? t.negotiated : t.inherited}</Text></View>
          <Text style={s.hint}>{o.email}</Text><Text style={s.formula}>{commissionFormula(o.override ?? data.standard, ro)}</Text>{typeof editing === 'object' && editing?.organizerId === o.organizerId ? editor(editing) : <Button label={t.edit} id={'commission-edit-' + o.organizerId} disabled={!!editing} onPress={() => setEditing(o)} />}
        </View>)}
        {!data.organizers.some(o => `${o.companyName} ${o.email}`.toLowerCase().includes(search.trim().toLowerCase())) && <Text style={s.hint}>{t.empty}</Text>}
      </>}
    </>}
  </View>;
}
export function OrganizerCommissionSettings({ organizer, saved }: { organizer: DirectoryDetail; saved: () => void }) {
  const { language } = usePreferences(), ro = language === 'ro', t = commissionText(ro), [editing,setEditing] = useState(false);
  const target: OrganizerCommission = { organizerId: organizer.userId, companyName: organizer.companyName, email: organizer.email, override: organizer.commissionOverride, revision: organizer.commissionRevision };
  return <View style={s.card}><Text style={s.title}>{t.title}</Text><Text style={s.formula}>{commissionFormula(target.override ?? organizer.standard,ro)}</Text><Text style={s.hint}>{t.future}</Text>{editing ? <Editor key={target.organizerId + ':' + target.revision} target={target} data={{standard:organizer.standard,organizers:[target]}} close={() => setEditing(false)} saved={() => { setEditing(false); saved(); }} /> : <Button label={t.edit} onPress={() => setEditing(true)} />}</View>;
}
function Editor({ target, data, close, saved }: { target: 'standard' | OrganizerCommission; data: CommissionSettings; close: () => void; saved: () => void }) {
  const { controller } = useAuth(), { language } = usePreferences(), ro = language === 'ro', t = commissionText(ro);
  const standard = target === 'standard', original = standard ? data.standard : target.override ?? data.standard;
  const [inherit, setInherit] = useState(!standard && !target.override), [rate, setRate] = useState(String(original.rateBps / 100)), [fixed, setFixed] = useState(String(original.perTicketBani / 100)), [error, setError] = useState(''), [busy, setBusy] = useState(false), lock = useRef(false);
  const revision = useRef(standard ? data.standard.revision : target.revision).current;
  const save = async () => {
    if (lock.current || controller.getSnapshot().user?.role !== 'admin') return;
    const terms = parseCommissionInputs(rate, fixed);
    if (!inherit && !terms) { setError(t.invalid); return; }
    lock.current = true; setBusy(true); setError(''); const token = controller.getToken();
    try {
      await accountApi(standard ? '/admin/commissions/standard' : '/admin/organizers/' + target.organizerId + '/commission', { method: 'PUT', token, body: standard ? { ...terms, revision } : { override: inherit ? null : terms, revision } });
      if (token === controller.getToken()) saved();
    } catch { if (token === controller.getToken()) setError(t.failed); }
    finally { lock.current = false; setBusy(false); }
  };
  return <View style={[s.card, { borderColor: colors.accent }]} testID="commission-editor">
    <Text style={s.title}>{standard ? t.standard : target.companyName}</Text>
    {!standard && <View style={s.row}><Button label={t.reset} active={inherit} disabled={busy} onPress={() => setInherit(true)} /><Button label={t.custom} active={!inherit} disabled={busy} onPress={() => setInherit(false)} /></View>}
    {inherit ? <Text style={s.formula}>{commissionFormula(data.standard, ro)}</Text> : <>
      <Text style={s.hint}>{t.percent}</Text><FormInput testID="commission-percent" accessibilityLabel={t.percent} keyboardType="decimal-pad" value={rate} onChangeText={setRate} editable={!busy} style={s.input} />
      <Text style={s.hint}>{t.fixed}</Text><FormInput testID="commission-fixed" accessibilityLabel={t.fixed} keyboardType="decimal-pad" value={fixed} onChangeText={setFixed} editable={!busy} style={s.input} />
    </>}
    <Text style={s.hint}>{t.future}</Text>{error ? <Text accessibilityLiveRegion="assertive" style={s.error}>{error}</Text> : null}
    <Button label={t.save} id="commission-save" active disabled={busy} onPress={() => void save()} /><Button label={t.cancel} disabled={busy} onPress={close} />
  </View>;
}
function Button({ label, onPress, disabled, active, id }: { label: string; onPress: () => void; disabled?: boolean; active?: boolean; id?: string }) {
  return <AccentPressable fallback={Pressable} testID={id} accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, active && { backgroundColor: colors.accent, borderColor: colors.accent }, { opacity: disabled ? .5 : pressed ? .7 : 1 }]}><Text style={{ color: active ? '#000' : colors.text, fontWeight: '600', fontSize: 13 }}>{label}</Text></AccentPressable>;
}
const s = StyleSheet.create({ section: { gap: 14 }, card: { gap: 12, borderWidth: 1, borderColor: '#ffffff1a', borderRadius: 16, backgroundColor: '#ffffff06', padding: 16 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, title: { color: colors.text, fontSize: 16, fontWeight: '600' }, hint: { color: colors.muted, fontSize: 13, lineHeight: 20 }, formula: { color: colors.text, fontWeight: '600', fontSize: 17 }, badge: { color: colors.accent, fontSize: 11, fontWeight: '600' }, input: { color: colors.text, backgroundColor: '#ffffff08', borderWidth: 1, borderColor: '#ffffff1a', borderRadius: 12, minHeight: 44, padding: 12, fontSize: 15 }, button: { minHeight: 42, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#18181b' }, error: { color: '#fca5a5', fontSize: 13, lineHeight: 20 } });
