import {StyleSheet} from 'react-native';
import {colors,screenPadding,tokens} from '../ui/theme';

// One content scale for Friends, conversations, their pickers and outing details.
// The app's global navigation, controls and glass materials keep their own styles.
export const groupStyles=StyleSheet.create({
 root:{flex:1,backgroundColor:colors.bg},
 page:{padding:screenPadding,gap:tokens.spacing.xl,maxWidth:760,width:'100%',alignSelf:'center'},
 content:{padding:screenPadding,gap:tokens.spacing.xl,maxWidth:760,width:'100%',alignSelf:'center'},
 header:{flexDirection:'row',alignItems:'center',gap:tokens.spacing.md,paddingHorizontal:screenPadding,paddingVertical:tokens.spacing.md,minHeight:68,width:'100%',maxWidth:760,alignSelf:'center'},
 title:{fontSize:21,lineHeight:28,fontWeight:'600',color:colors.text,letterSpacing:-.5},
 heading:{fontSize:tokens.type.section.size,lineHeight:25,fontWeight:'600',color:colors.text},
 body:{fontSize:tokens.type.body.size,lineHeight:24,color:colors.text},
 muted:{fontSize:14,lineHeight:21,color:colors.muted},
 caption:{fontSize:tokens.type.caption.size,lineHeight:18,color:colors.muted},
 row:{flexDirection:'row',gap:tokens.spacing.md,alignItems:'center'},
 circle:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.raised},
 line:{height:1,backgroundColor:colors.line},
 bubble:{maxWidth:'88%',alignSelf:'flex-start',backgroundColor:colors.raised,borderRadius:tokens.radius.overlay,borderTopLeftRadius:tokens.spacing.xs,paddingHorizontal:tokens.spacing.lg,paddingVertical:tokens.spacing.md,gap:tokens.spacing.xs},
 mine:{alignSelf:'flex-end',backgroundColor:'#25131b',borderTopLeftRadius:tokens.radius.overlay,borderTopRightRadius:tokens.spacing.xs},
 summary:{marginHorizontal:screenPadding,paddingVertical:0,paddingHorizontal:tokens.spacing.md,minHeight:52,backgroundColor:colors.surface,borderRadius:tokens.radius.surface},
 message:{paddingHorizontal:screenPadding,paddingTop:tokens.spacing.md,paddingBottom:tokens.spacing.xs,width:'100%',maxWidth:760,alignSelf:'center'},
 composer:{paddingTop:10,flexDirection:'row',gap:8,alignItems:'flex-end',width:'100%',maxWidth:760,alignSelf:'center'},
 field:{flex:1,minHeight:44,maxHeight:220,paddingVertical:11},empty:{gap:tokens.spacing.lg,paddingVertical:tokens.spacing.xxl},
 tag:{backgroundColor:colors.accent,width:7,height:7,borderRadius:4},
 eventImage:{width:'100%',aspectRatio:1.9,borderRadius:tokens.radius.surface},
 eventRow:{gap:tokens.spacing.md,paddingVertical:tokens.spacing.md,flexDirection:'row',alignItems:'center'},
 setting:{minHeight:64,paddingVertical:tokens.spacing.md,flexDirection:'row',alignItems:'center',gap:tokens.spacing.md},
 section:{gap:tokens.spacing.xs},error:{fontSize:14,lineHeight:21,color:colors.danger},
});
