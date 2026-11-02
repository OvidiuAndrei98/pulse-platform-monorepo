import { CancellationReviewPanel } from "./presentation/CancellationReviewPanel";
import { RefundReviewPanel } from "./presentation/RefundReviewPanel";
import { PromotionInvoiceReviewPanel } from "./presentation/PromotionInvoiceReviewPanel";
import { OrganizerVerificationPanel } from "./presentation/OrganizerVerificationPanel";
import { styles, Action } from "./presentation/primitives";

import { useAdminController } from "./useAdminController";

import { ActionIcon } from '../ui/ActionIcon';
import { FormInput as TextInput } from '../ui/FormInput';
import { useEffect } from 'react';
import { Modal, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRoute } from '@react-navigation/native';

import { LogOut, RefreshCw, ShieldCheck, Ticket } from 'lucide-react-native';
import { useAuth } from '../auth/AuthProvider';
import { usePreferences } from '../usePreferences';
import { Feedback, IconButton } from '../ui/common';
import { Text } from '../ui/Text';
import { CommissionsPanel } from './CommissionsPanel';
import { ClientErrorsPanel } from './ClientErrorsPanel';
import { colors } from '../ui/theme';

import { AdminShell, AdminOverview } from './AdminShell';
import { OrganizerDirectory } from './OrganizerDirectory';
import { adminSection, adminLabel } from '@packages/app-core/admin/navigation';
import { queryClient } from '../data/queries';

export function AdminScreen() {
  const route = useRoute<any>(), {user,controller}=useAuth(), {language}=usePreferences('copy');
  const section=adminSection(route.params?.section), organizerId=typeof route.params?.organizerId==='string'?route.params.organizerId:undefined;
  useEffect(()=>{if(user?.role!=='admin')queryClient.removeQueries({predicate:query=>String(query.queryKey[0]).startsWith('admin-')||query.queryKey[0]==='client-errors'});},[user?.role,user?.id]);
  if(user?.role!=='admin'||!controller.getToken())return <SafeAreaView edges={['top']} style={{flex:1,paddingHorizontal:20}}><Feedback title={language==='ro'?'Acces rezervat administratorilor':'Administrator access required'}/></SafeAreaView>;
  return <AdminShell section={section}>{section==='overview'?<AdminOverview/>:section==='organizers'?<OrganizerDirectory key={user.id+':'+(organizerId??'directory')} organizerId={organizerId}/>:<AdminOperationsScreen key={user.id+':'+section} section={section}/>}</AdminShell>;
}
function AdminOperationsScreen(props: Parameters<typeof useAdminController>[0]) {
  const model = useAdminController(props);
  const {
    logout,
    allowed,
    back,
    busy,
    confirm,
    copy,
    error,
    insets,
    language,
    link,
    loading,
    note,
    notice,
    organizers,
    refresh,
    section,
    setNote,
    setTarget,
    target,
    viewport,
    visible,
  } = model;

  if (!allowed) return <View style={{ flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: insets.top + 20 }}><IconButton label={copy('common.back')} onPress={back}><ActionIcon name="back" color="white" size={22} /></IconButton><Feedback title={language === 'ro' ? 'Acces rezervat administratorilor' : 'Administrator access required'} /></View>;

  const grid = viewport.width >= 768;

  return <View style={{ flex: 1, backgroundColor: colors.bg }}><ScrollView refreshControl={<RefreshControl refreshing={loading && !organizers.isPending} onRefresh={() => { void refresh(); }} tintColor={colors.accent} />} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: insets.bottom + 40, gap: 24, width: '100%', maxWidth: 1152, alignSelf: 'center' }}>
    <View style={{ gap: 16, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#ffffff18' }}><IconButton label={copy('common.back')} onPress={back}><ActionIcon name="back" color="white" size={22} /></IconButton><View style={styles.row}><View style={styles.brandIcon}><ShieldCheck size={22} color={colors.accent} /></View><View style={{ flex: 1, gap: 5 }}><Text style={styles.eyebrow}>{copy('admin.eyebrow')}</Text><Text style={styles.title}>{adminLabel(section, language === 'ro')}</Text></View></View><View style={styles.row}><Action title={copy('admin.refresh')} disabled={loading || busy} onPress={() => { void refresh(); }}><RefreshCw size={16} color={colors.text} /></Action><Action title={copy('dashboardNav.logout')} disabled={busy} onPress={logout}><LogOut size={16} color={colors.text} /></Action></View></View>
    {notice ? <Text accessibilityLiveRegion="polite" style={[styles.body, { color: colors.accent }]}>{notice}</Text> : null}{error || link.error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error || copy('feedback.actionFailed')}</Text> : null}
    {section === 'commissions' && <CommissionsPanel initiallyOpen />}
    {section === 'errors' && <ClientErrorsPanel initiallyOpen />}
    {section === 'cancellations' && <CancellationReviewPanel model={model} />}
    {section === 'refunds' && <RefundReviewPanel model={model} grid={grid}/>}
    {section === 'invoices' && <PromotionInvoiceReviewPanel model={model} />}
    {section === 'verifications' && <OrganizerVerificationPanel model={model} grid={grid}/>}
  </ScrollView>
  <Modal transparent visible={!!target} animationType="fade" onRequestClose={() => { if (!busy) setTarget(undefined); }}><View style={styles.modalBackdrop}><View accessibilityViewIsModal style={[styles.modal, { maxHeight: viewport.height - insets.top - insets.bottom - 40 }]}><ScrollView contentContainerStyle={{ gap: 16 }} keyboardShouldPersistTaps="handled">
    <Ticket color={colors.accent} size={24} /><Text style={[styles.heading, { fontSize: 19 }]}>{target?.kind === 'organizer' ? copy(target.status === 'approved' ? 'admin.approveTitle' : 'admin.rejectTitle') : target?.action === 'retry' ? copy('adminCancellations.retry') : target ? copy('adminCancellations.confirm.' + target.action) : ''}</Text>
    <Text style={styles.body}>{target?.kind === 'organizer' ? copy('admin.reviewHint', { company: target.request.companyName }) : target?.action === 'retry' ? target.request.eventTitle : target ? copy('adminCancellations.confirmHint.' + target.action) : ''}</Text>
    {target?.kind === 'cancellation' && target.action !== 'retry' ? <TextInput accessibilityLabel={copy('adminCancellations.note')} placeholder={copy('adminCancellations.note')} placeholderTextColor={colors.muted} value={note} onChangeText={setNote} maxLength={2000} editable={!busy} multiline style={styles.input} /> : null}
    {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}<View style={styles.row}><View style={{ flex: 1 }}><Action title={copy('common.cancel')} disabled={busy} onPress={() => setTarget(undefined)} /></View><View style={{ flex: 1 }}><Action title={copy('common.confirm')} disabled={busy} primary onPress={confirm} /></View></View>
  </ScrollView></View></View></Modal></View>;
}
