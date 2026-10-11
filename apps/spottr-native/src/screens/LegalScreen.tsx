import React from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { publicLegalDocuments } from '../../../pulse-app/src/features/legal/publicLegalDocuments';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { usePreferences } from '../PreferencesProvider';
import type { RootParamList } from '../navigation/types';
export function LegalScreen({ route, navigation }: NativeStackScreenProps<RootParamList, 'Legal'>) {
  const { language, copy } = usePreferences(), inset = useSafeAreaInsets(), document = publicLegalDocuments[language][route.params.document === 'privacy' ? 'privacy' : 'terms'];
  return <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: Math.max(48, inset.top + 16), paddingBottom: inset.bottom + 40 }} style={{ flex: 1, backgroundColor: colors.bg }}>
    <Text style={{ fontSize: 12, color: colors.accent, fontWeight: '600' }}>SPOTTR</Text>
    <Pressable accessibilityRole="button" onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs', { screen: 'Home' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 }}><ArrowLeft size={16} color={colors.muted}/><Text style={{ color: colors.muted, fontSize: 14 }}>{copy('common.back')}</Text></Pressable>
    <View style={{ marginTop: 28, paddingBottom: 28, borderBottomWidth: 1, borderColor: '#ffffff1a' }}><Text style={{ color: colors.accent, fontWeight: '700', fontSize: 11, letterSpacing: 2 }}>{document.eyebrow.toUpperCase()}</Text><Text style={{ color: colors.text, fontWeight: '600', fontSize: 30, marginTop: 8 }}>{document.title}</Text><Text style={{ color: colors.muted, fontSize: 14, lineHeight: 24, marginTop: 16 }}>{document.intro}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 16 }}>{copy('legal.lastUpdated', { date: document.updatedAt })}</Text></View>
    {document.sections.map(section => <View key={section.title} style={{ marginTop: 32 }}><Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>{section.title}</Text>{section.paragraphs?.map(text => <Text key={text} style={{ marginTop: 12, color: colors.muted, fontSize: 14, lineHeight: 24 }}>{text}</Text>)}{section.items && <View style={{ marginTop: 12, paddingLeft: 16, borderLeftWidth: 1, borderColor: '#ff00444d', gap: 8 }}>{section.items.map(text => <Text key={text} style={{ fontSize: 14, lineHeight: 24, color: colors.muted }}>{text}</Text>)}</View>}{section.links?.map(link => <Pressable key={link.href} accessibilityRole="link" onPress={() => void Linking.openURL(link.href).catch(() => {})} style={{ marginTop: 16 }}><Text style={{ color: colors.accent, fontSize: 14 }}>{link.label}</Text></Pressable>)}</View>)}
  </ScrollView>;
}
