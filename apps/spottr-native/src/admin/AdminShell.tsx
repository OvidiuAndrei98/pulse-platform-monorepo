import React from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePreferences } from '../PreferencesProvider';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { adminSections, adminLabel, type AdminSection } from '../../../pulse-app/src/features/admin/navigation';

export function AdminShell({section,children}: {section:AdminSection;children:React.ReactNode}) {
  const navigation = useNavigation<any>(), {language} = usePreferences(), ro = language === 'ro', insets = useSafeAreaInsets(), wide = useWindowDimensions().width >= 1000;
  return <View style={{flex:1,backgroundColor:colors.bg,paddingTop:insets.top}}>
    <View style={{flex:1,flexDirection:wide?'row':'column'}}>
      <View style={{width:wide?230:'100%',padding:16,borderBottomWidth:wide?0:1,borderColor:colors.line,gap:12}}>
        <Text style={{fontSize:14,fontWeight:'700',color:colors.text}}>SPOTTR <Text style={{color:colors.muted}}>Admin</Text></Text>
        <ScrollView horizontal={!wide} showsHorizontalScrollIndicator={!wide} style={wide?{flex:1}:{maxHeight:52}} contentContainerStyle={{gap:6,flexDirection:wide?'column':'row',paddingBottom:4}} accessibilityLabel={ro?'Secțiuni administrare':'Administration sections'}>
          {adminSections.map(key => <Pressable key={key} accessibilityRole="button" accessibilityState={{selected:key===section}} onPress={() => navigation.navigate('Admin',{section:key,organizerId:undefined})} style={{minHeight:44,paddingHorizontal:14,paddingVertical:12,borderRadius:12,backgroundColor:section===key?'#ff004418':'transparent',justifyContent:'center'}}><Text style={{fontSize:14,fontWeight:'600',color:section===key?colors.accent:colors.text}}>{adminLabel(key,ro)}</Text></Pressable>)}
        </ScrollView>
      </View><View style={{flex:1,minWidth:0}}>{children}</View>
    </View>
  </View>;
}

export function AdminOverview() {
  const {language} = usePreferences(), ro=language==='ro', navigation=useNavigation<any>();
  return <ScrollView contentContainerStyle={{padding:24,gap:24,maxWidth:1100,width:'100%',alignSelf:'center'}}>
    <Text accessibilityRole="header" style={{fontSize:28,fontWeight:'700',color:colors.text}}>{adminLabel('overview',ro)}</Text>
    <Text style={{fontSize:14,lineHeight:22,color:colors.muted}}>{ro?'Conturi, operațiuni financiare și starea aplicației.':'Accounts, financial operations and application health.'}</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{adminSections.filter(key=>key!=='overview').map(key=><Pressable accessibilityRole="button" key={key} onPress={()=>navigation.navigate('Admin',{section:key,organizerId:undefined})} style={{flexGrow:1,flexBasis:260,minHeight:120,borderRadius:16,borderWidth:1,borderColor:colors.line,padding:20,justifyContent:'space-between',gap:20}}><Text style={{color:colors.accent,fontSize:20}}>↗</Text><Text style={{fontSize:17,fontWeight:'600',color:colors.text}}>{adminLabel(key,ro)}</Text></Pressable>)}</View>
    <Pressable accessibilityRole="button" onPress={()=>navigation.navigate('Tabs',{screen:'Profile'})} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:colors.text,textDecorationLine:'underline'}}>{ro?'Înapoi la profil':'Back to profile'}</Text></Pressable>
  </ScrollView>;
}
