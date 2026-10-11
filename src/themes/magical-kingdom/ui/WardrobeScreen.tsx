import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { KingdomDirector, KingdomView } from '../director/kingdom';
import { WORDS as W, line } from '../copy';
import { ROYAL_SLOTS, WARDROBE, available, type WardrobeSlot } from '../wardrobe';
import { MagicalPressable as Pressable } from './MagicalPressable';
import { OUTFIT_ART, Princess } from './Princess';
import { WardrobeArt } from './WardrobeArt';
import { magic as P } from './palette';

export function WardrobeScreen({v,director,width,height,still,close,say}: {v:KingdomView;director:KingdomDirector;width:number;height:number;still:boolean;close:()=>void;say:(text:string)=>void}) {
  const [slot,setSlot]=useState<WardrobeSlot>('outfit');
  const [message,setMessage]=useState(WARDROBE.copy.choose);
  const portrait=height>width;
  return <View testID="wardrobe-screen" style={s.root} accessibilityViewIsModal>
    <View style={s.header}><Text style={s.title}>{W.wardrobe}</Text><Pressable accessibilityRole="button" accessibilityLabel={WARDROBE.copy.done} onPress={close} style={s.done}><Text style={s.doneText}>{W.close} ✓</Text></Pressable></View>
    <View style={[s.body,{flexDirection:portrait?'column':'row'}]}>
      <View style={[s.preview,{width:portrait?'100%':'38%',height:portrait?Math.min(340,height*.31):'100%'}]}><Princess size={portrait?Math.min(310,height*.28):Math.min(height-155,510)} look={v.look} still={still}/><Text style={s.progress}>{line(WARDROBE.copy.progress,{count:v.progress.total})}</Text></View>
      <View style={s.controls}>
        <ScrollView horizontal style={{flexGrow:0}} contentContainerStyle={s.tabs}>{ROYAL_SLOTS.map(key=><Pressable key={key} accessibilityRole="button" accessibilityLabel={WARDROBE.categories[key]} accessibilityState={{selected:slot===key}} onPress={()=>{setSlot(key);setMessage(WARDROBE.copy.choose);}} style={[s.tab,slot===key&&s.chosen]}><Text style={s.tabText}>{WARDROBE.categories[key]}</Text></Pressable>)}</ScrollView>
        <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>
        <ScrollView testID="wardrobe-items" contentContainerStyle={s.items}>{WARDROBE.items.filter(i=>i.slot===slot).map(item=>{
          const earned=available(item,v.progress), selected=v.look[slot]===item.id;
          return <Pressable key={item.id} testID={`wardrobe-${item.id}`} accessibilityRole="button" disabled={v.busy || v.error} accessibilityLabel={line(earned?WARDROBE.copy.wear:WARDROBE.copy.locked,{item:item.label,goal:item.goal})} accessibilityState={{selected}} onPress={()=>{
            if(earned){void director.customize(slot,item.id).then(()=>{if(director.view().look[slot]===item.id)setMessage(line(WARDROBE.copy.wearing,{item:item.label}));});}else{setMessage(item.goal);say(item.goal);}
          }} style={[s.card,selected&&s.selected,!earned&&s.locked]}>
            <View style={s.art}>{slot==='outfit'?<Image source={OUTFIT_ART[item.id]} resizeMode="contain" style={{width:100,height:138}}/>:item.id.endsWith('-none')?<Text style={s.none}>○</Text>:<WardrobeArt id={item.id} size={78}/>}</View>
            <Text style={s.label}>{selected?'✓ ':''}{item.label}</Text><Text style={s.goal}>{earned?WARDROBE.copy.starter:`🔒 ${item.goal}`}</Text>
          </Pressable>;
        })}</ScrollView>
      </View>
    </View>
  </View>;
}
const s=StyleSheet.create({root:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:P.cream,zIndex:60,padding:18},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:12},title:{fontSize:28,fontWeight:'800',color:P.ink},done:{minHeight:64,minWidth:100,backgroundColor:P.deep,borderRadius:24,padding:18,justifyContent:'center'},doneText:{fontSize:19,fontWeight:'800',color:P.white},body:{flex:1,gap:14},preview:{alignItems:'center',justifyContent:'center',backgroundColor:P.paper,borderRadius:35,borderWidth:2,borderColor:P.gold},progress:{fontSize:16,color:P.dim,marginTop:8},controls:{flex:1,minHeight:0},tabs:{gap:8,paddingBottom:5},tab:{minHeight:64,minWidth:92,padding:15,borderWidth:2,borderColor:P.edge,borderRadius:22,justifyContent:'center',alignItems:'center',backgroundColor:P.paper},chosen:{backgroundColor:P.ice,borderColor:P.deep},tabText:{fontSize:17,fontWeight:'800',color:P.ink},message:{fontSize:17,color:P.deep,minHeight:50,paddingVertical:12},items:{flexDirection:'row',flexWrap:'wrap',gap:12,paddingBottom:24},card:{width:160,minHeight:208,padding:10,borderRadius:25,borderWidth:3,borderColor:P.edge,backgroundColor:P.paper,alignItems:'center'},selected:{borderColor:P.deep,backgroundColor:P.ice},locked:{backgroundColor:P.cream},art:{height:138,justifyContent:'center',alignItems:'center'},label:{fontSize:17,color:P.ink,fontWeight:'800',textAlign:'center'},goal:{fontSize:13,color:P.dim,textAlign:'center',marginTop:5},none:{fontSize:70,color:P.dim}});
