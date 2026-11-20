// Royal dress-up. Pictures first, for a child who cannot read yet: each kind of thing to wear is a picture
// tab, Done is a check, and a locked gift wears a padlock beside the picture of what unlocks it (the Ice
// Palace's crystal, the Royal Garden's flower, the Royal Games' castle path, the same pictures the castle's
// doors wear) with one dot for each adventure it needs, filled as they are done. The words stay, small,
// for grown-ups and screen readers. Tapping a locked gift says what unlocks it. Cosmetic only: nothing here
// is evidence, and a gift is never taken away.
import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { KingdomDirector, KingdomView } from '../director/kingdom';
import { WORDS as W, line } from '../copy';
import { ROYAL_SLOTS, WARDROBE, available, type RoyalProgress, type WardrobeSlot } from '../wardrobe';
import { MagicIcon, type IconKind } from './MagicArt';
import { MagicalPressable as Pressable } from './MagicalPressable';
import { OUTFIT_ART, Princess } from './Princess';
import { LockArt, WardrobeArt } from './WardrobeArt';
import { magic as P } from './palette';

type Item = (typeof WARDROBE.items)[number];
/** The picture on each tab: a thing of that kind (the hanger for outfits). */
const TAB_ART: Record<WardrobeSlot, string | null> = { outfit: null, crown: 'crown-gold', bow: 'bow-pink', wings: 'wings-butterfly', wand: 'wand-star' };
/** What unlocks a gift, as the castle's own pictures: its door's seal, and the Royal Games button. */
const UNLOCK_ART: Record<'ice' | 'garden' | 'any', IconKind[]> = { ice: ['crystal'], garden: ['flower', 'quest'], any: ['crystal', 'flower', 'quest'] };

export function WardrobeScreen({v,director,width,height,still,close,say}: {v:KingdomView;director:KingdomDirector;width:number;height:number;still:boolean;close:()=>void;say:(text:string)=>void}) {
  const [slot,setSlot]=useState<WardrobeSlot>('outfit');
  const [message,setMessage]=useState(WARDROBE.copy.choose);
  const portrait=height>width;
  const narrow=width<480;
  return <View testID="wardrobe-screen" style={s.root} accessibilityViewIsModal>
    <View style={s.header}>
      <Text style={[s.title,narrow&&{fontSize:22}]} numberOfLines={1}>{W.wardrobe}</Text>
      <Pressable testID="wardrobe-done" accessibilityRole="button" accessibilityLabel={WARDROBE.copy.done} onPress={close} style={s.done}>
        <MagicIcon kind="check" size={34} color={P.cream}/>{narrow?null:<Text style={s.doneText}>{W.close}</Text>}
      </Pressable>
    </View>
    <View style={[s.body,{flexDirection:portrait?'column':'row'}]}>
      <View style={[s.preview,{width:portrait?'100%':'38%',height:portrait?Math.min(340,height*.31):'100%'}]}><Princess size={portrait?Math.min(310,height*.28):Math.min(height-155,510)} look={v.look} still={still}/><Text style={s.progress}>{line(WARDROBE.copy.progress,{count:v.progress.total})}</Text></View>
      <View style={s.controls}>
        <ScrollView horizontal style={{flexGrow:0}} contentContainerStyle={s.tabs}>{ROYAL_SLOTS.map(key=>{
          const art=TAB_ART[key];
          return <Pressable key={key} testID={`wardrobe-tab-${key}`} accessibilityRole="button" accessibilityLabel={WARDROBE.categories[key]} accessibilityState={{selected:slot===key}} onPress={()=>{setSlot(key);setMessage(WARDROBE.copy.choose);}} style={[s.tab,slot===key&&s.chosen]}>
            {art?<WardrobeArt id={art} size={40}/>:<MagicIcon kind="hanger" size={38} color={P.deep}/>}
            {narrow?null:<Text style={s.tabText}>{WARDROBE.categories[key]}</Text>}
          </Pressable>;
        })}</ScrollView>
        <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>
        <ScrollView testID="wardrobe-items" contentContainerStyle={s.items}>{WARDROBE.items.filter(i=>i.slot===slot).map(item=>{
          const earned=available(item,v.progress), selected=v.look[slot]===item.id;
          return <Pressable key={item.id} testID={`wardrobe-${item.id}`} accessibilityRole="button" disabled={v.busy || v.error} accessibilityLabel={line(earned?WARDROBE.copy.wear:WARDROBE.copy.locked,{item:item.label,goal:item.goal})} accessibilityState={{selected}} onPress={()=>{
            if(earned){void director.customize(slot,item.id).then(()=>{if(director.view().look[slot]===item.id)setMessage(line(WARDROBE.copy.wearing,{item:item.label}));});}else{setMessage(item.goal);say(item.goal);}
          }} style={[s.card,selected&&s.selected,!earned&&s.locked]}>
            <View style={s.art}>
              <View style={earned?null:s.lockedArt}>{slot==='outfit'?<Image source={OUTFIT_ART[item.id]} resizeMode="contain" style={{width:100,height:138}}/>:item.id.endsWith('-none')?<Text style={s.none}>○</Text>:<WardrobeArt id={item.id} size={78}/>}</View>
              {earned?null:<View testID={`wardrobe-lock-${item.id}`} style={s.lock}><LockArt size={44}/></View>}
              {selected?<View style={s.wearing}><MagicIcon kind="check" size={26} color={P.deep}/></View>:null}
            </View>
            <Text style={s.label}>{item.label}</Text>
            {earned?<Text style={s.goal}>{WARDROBE.copy.starter}</Text>:<Unlock item={item} progress={v.progress}/>}
          </Pressable>;
        })}</ScrollView>
      </View>
    </View>
  </View>;
}

/** What unlocks a gift: the place's picture, one dot for each adventure it needs (filled as they are done), and the words, small. */
function Unlock({ item, progress }: { item: Item; progress: RoyalProgress }) {
  const where = item.room ?? 'any';
  const done = item.room ? progress[item.room] : progress.total;
  const label = where === 'ice' ? WARDROBE.copy.unlockIce : where === 'garden' ? WARDROBE.copy.unlockGarden : WARDROBE.copy.unlockAny;
  return <View testID={`wardrobe-unlock-${item.id}`} style={s.unlock}>
    <View style={s.unlockPlaces} accessible accessibilityLabel={label}>{UNLOCK_ART[where].map((kind)=><View key={kind} style={s.place}><MagicIcon kind={kind} size={26}/></View>)}</View>
    <View style={s.dots}>{Array.from({length:item.count},(_,i)=><View key={i} style={[s.dot,i<done&&s.dotDone]}/>)}</View>
    <Text style={s.goal}>{item.goal}</Text>
  </View>;
}

const s=StyleSheet.create({root:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:P.cream,zIndex:60,padding:18},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:12},title:{flexShrink:1,fontSize:28,fontWeight:'800',color:P.ink},done:{minHeight:64,minWidth:76,flexDirection:'row',gap:8,alignItems:'center',backgroundColor:P.deep,borderRadius:24,paddingHorizontal:18,justifyContent:'center'},doneText:{fontSize:19,fontWeight:'800',color:P.white},body:{flex:1,gap:14},preview:{alignItems:'center',justifyContent:'center',backgroundColor:P.paper,borderRadius:35,borderWidth:2,borderColor:P.gold},progress:{fontSize:16,color:P.dim,marginTop:8},controls:{flex:1,minHeight:0},tabs:{gap:8,paddingBottom:5},tab:{minHeight:64,minWidth:64,paddingHorizontal:12,paddingVertical:6,flexDirection:'row',gap:6,borderWidth:2,borderColor:P.edge,borderRadius:22,justifyContent:'center',alignItems:'center',backgroundColor:P.paper},chosen:{backgroundColor:P.ice,borderColor:P.deep},tabText:{fontSize:17,fontWeight:'800',color:P.ink},message:{fontSize:17,color:P.deep,minHeight:50,paddingVertical:12},items:{flexDirection:'row',flexWrap:'wrap',gap:12,paddingBottom:24},card:{width:160,minHeight:208,padding:10,borderRadius:25,borderWidth:3,borderColor:P.edge,backgroundColor:P.paper,alignItems:'center'},selected:{borderColor:P.deep,backgroundColor:P.ice},locked:{backgroundColor:P.stone,borderColor:P.stoneEdge},art:{height:138,width:130,justifyContent:'center',alignItems:'center'},lockedArt:{opacity:.45},lock:{position:'absolute',right:0,bottom:4},wearing:{position:'absolute',left:0,top:0,width:36,height:36,borderRadius:18,backgroundColor:P.cream,borderWidth:2,borderColor:P.deep,alignItems:'center',justifyContent:'center'},label:{fontSize:17,color:P.ink,fontWeight:'800',textAlign:'center'},goal:{fontSize:12,color:P.dim,textAlign:'center',marginTop:3},none:{fontSize:70,color:P.dim},unlock:{alignItems:'center',marginTop:5,gap:4},unlockPlaces:{flexDirection:'row',gap:4},place:{width:34,height:34,borderRadius:17,backgroundColor:P.cream,borderWidth:2,borderColor:P.gold,alignItems:'center',justifyContent:'center'},dots:{flexDirection:'row',gap:4},dot:{width:12,height:12,borderRadius:6,backgroundColor:P.paper,borderWidth:2,borderColor:P.edge},dotDone:{backgroundColor:P.gold,borderColor:P.gold}});
