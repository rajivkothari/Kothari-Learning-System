import { useEffect, useState } from 'react';
import { Animated, Image, View } from 'react-native';
import { WORDS as W } from '../copy';
import { DEFAULT_LOOK, type Look } from '../wardrobe';
import { WardrobeArt } from './WardrobeArt';

export const OUTFIT_ART: Record<string, number> = {
  'outfit-lavender': require('../../../../assets/themes/magical-kingdom/princess-concept.png'),
  'outfit-winter': require('../../../../assets/themes/magical-kingdom/outfits/winter.png'),
  'outfit-garden': require('../../../../assets/themes/magical-kingdom/outfits/garden.png'),
  'outfit-starlight': require('../../../../assets/themes/magical-kingdom/outfits/starlight.png'),
};
export function Princess({size, still, celebration = false, look = DEFAULT_LOOK}: {size:number;still:boolean;celebration?:boolean;look?:Look}) {
  const [float] = useState(() => new Animated.Value(0));
  const [failed,setFailed] = useState<string | null>(null);
  useEffect(()=>{
    if(still){float.setValue(0);return;}
    const a=Animated.loop(Animated.sequence([Animated.timing(float,{toValue:celebration?-8:-3,duration:1800,useNativeDriver:true}),Animated.timing(float,{toValue:0,duration:1800,useNativeDriver:true})]));
    a.start();return()=>{a.stop();float.setValue(0);};
  },[still,celebration,float]);
  return <Animated.View testID="princess-look" accessibilityLabel={`${W.character}, ${look.outfit}, ${look.crown}, ${look.bow}, ${look.wings}, ${look.wand}`} style={{width:size*.76,height:size,transform:[{translateY:float}]}}>
    {look.wings!=='wings-none'?<View style={{position:'absolute',top:size*.05,left:0,transform:[{scaleY:.5}]}}><WardrobeArt id={look.wings} size={size*.72}/></View>:null}
    <Image key={look.outfit} source={failed===look.outfit ? OUTFIT_ART['outfit-lavender'] : OUTFIT_ART[look.outfit] ?? OUTFIT_ART['outfit-lavender']} onError={()=>setFailed(look.outfit)} accessibilityLabel={W.character} style={{height:size,width:size*.67,left:size*.045}} resizeMode="contain"/>
    {look.crown!=='crown-gold'?<View pointerEvents="none" style={{position:'absolute',left:size*.27,top:-size*.012}}><WardrobeArt id={look.crown} size={size*.115}/></View>:null}
    <View pointerEvents="none" style={{position:'absolute',left:size*.21,top:size*.325}}><WardrobeArt id={look.bow} size={size*.12}/></View>
    {look.wand!=='wand-none'?<View pointerEvents="none" style={{position:'absolute',left:size*.53,top:size*.33}}><WardrobeArt id={look.wand} size={size*.23}/></View>:null}
  </Animated.View>;
}
