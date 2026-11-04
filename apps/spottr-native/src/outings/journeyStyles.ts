import { StyleSheet } from 'react-native';
import { colors } from '../ui/theme';

/** The social planner stays lighter than dashboard forms: quiet surfaces,
 * a single accent and secondary tools behind explicit actions. */
export const j=StyleSheet.create({
 stack:{gap:24,minWidth:0},
 hero:{gap:10},
 title:{fontSize:28,lineHeight:34,fontWeight:'700',letterSpacing:-0.7,color:colors.text},
 section:{gap:16,minWidth:0},
 card:{gap:16,padding:18,borderRadius:24,backgroundColor:colors.raised,minWidth:0},
 identity:{gap:18,paddingTop:2,paddingBottom:4,minWidth:0},
 summary:{flexDirection:'row',alignItems:'center',gap:14,padding:16,borderRadius:20,backgroundColor:colors.raised},
 toolbar:{flexDirection:'row',alignItems:'center',gap:10,minHeight:44},
 fieldLabel:{fontSize:13,lineHeight:20,fontWeight:'600',color:colors.muted},
 poll:{gap:14,padding:18,borderRadius:24,backgroundColor:colors.raised,minWidth:0},
 input:{minHeight:52,paddingHorizontal:16,paddingVertical:14,borderRadius:16,backgroundColor:colors.raised,fontSize:16,color:colors.text},
 divider:{paddingTop:20,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:'#ffffff18',gap:14},
 deadline:{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:14,paddingVertical:8,minHeight:56,borderRadius:18,backgroundColor:colors.surface},
 reaction:{flex:1,minHeight:44,flexDirection:'row',justifyContent:'center',alignItems:'center',gap:6,paddingHorizontal:7,borderRadius:14,backgroundColor:'#ffffff08'},
 reactionSelected:{backgroundColor:'#ff004422'},
 reactionText:{fontSize:12,lineHeight:17,fontWeight:'600',color:colors.muted},
 count:{fontSize:11,lineHeight:15,fontWeight:'600',color:colors.muted},
 eventHeader:{flexDirection:'row',gap:16,alignItems:'center'},
 eventThumb:{width:82,height:108,borderRadius:16,backgroundColor:colors.raised},
 dateBlock:{width:54,alignItems:'center',gap:2},
 dateNumber:{fontSize:38,lineHeight:42,fontWeight:'700',letterSpacing:-1.7,color:colors.text,fontVariant:['tabular-nums']},
 dateMonth:{fontSize:11,lineHeight:16,fontWeight:'600',textTransform:'uppercase',letterSpacing:1,color:colors.muted},
 groupRow:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56},
 avatars:{flexDirection:'row',alignItems:'center',paddingRight:5},
 primary:{minHeight:48,borderRadius:24},
});
