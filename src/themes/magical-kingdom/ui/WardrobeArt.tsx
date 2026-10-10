import { Canvas, Circle, Group, Oval, Path } from './Vector';
import { magic as P } from './palette';

export function WardrobeArt({ id, size = 64 }: { id: string; size?: number }) {
  const color = id.includes('pink') || id.includes('rose') || id.includes('flower') ? P.pink : id.includes('gold') || id.includes('sunbeam') || id.includes('star') || id.includes('moon') ? P.gold : P.turquoise;
  if (id.startsWith('wand-')) return <Canvas style={{width:size,height:size}}><Group transform={[{scale:size/64}]}>
    <Path path="M14 59 L39 25" color={P.gold} style="stroke" strokeWidth={5}/>
    {id==='wand-crystal'?<><Path path="M41 3 L56 18 L49 34 L40 41 L30 31 L26 17 Z" color={P.crystal}/><Path path="M41 3 L40 41 L30 31 L26 17 Z" color={P.ice}/><Path path="M41 3 L56 18 L39 23 Z" color={P.turquoise}/></>:id==='wand-flower'?<>{[0,1,2,3,4,5].map(i=><Circle key={i} cx={41+12*Math.cos(i*Math.PI/3)} cy={22+12*Math.sin(i*Math.PI/3)} r={8} color={P.pink}/>)}<Circle cx={41} cy={22} r={8} color={P.gold}/></>:<Path path="M42 4 L47 17 L61 20 L50 30 L52 43 L40 36 L28 43 L30 30 L19 20 L34 17 Z" color={color}/>}
  </Group></Canvas>;
  if (id.startsWith('crown-')) return <Canvas style={{width:size,height:size}}><Group transform={[{scale:size/64}]}>
    <Path path="M5 48 Q32 58 59 48 L55 57 Q32 64 9 57 Z" color={id==='crown-flowers'?P.leaf:P.gold}/>
    {id==='crown-flowers'?<>{[10,24,39,54].map((x,i)=><Group key={i} transform={[{scale:1}]}><Circle cx={x-4} cy={43} r={6} color={P.pink}/><Circle cx={x+4} cy={43} r={6} color={P.pink}/><Circle cx={x} cy={36} r={6} color={P.pink}/><Circle cx={x} cy={44} r={4} color={P.gold}/></Group>)}</>:id==='crown-moon'?<><Path path="M42 3 Q13 5 15 30 Q21 50 45 37 Q25 37 26 20 Q27 9 42 3 Z" color={P.gold}/><Circle cx={49} cy={20} r={4} color={P.cream}/></>:<><Path path="M8 49 L4 22 L20 33 L32 4 L44 33 L60 22 L56 49 Z" color={P.crystal}/><Path path="M8 49 L20 33 L32 4 L32 50 Z" color={P.ice}/><Path path="M32 16 L37 33 L32 43 L27 33 Z" color={P.lavender}/></>}
  </Group></Canvas>;
  return <Canvas style={{width:size,height:size}}><Group transform={[{scale:size/64}]}>
    {id.startsWith('wings-') ? <><Path path="M31 30 Q0 0 3 31 Q0 60 30 45 L34 45 Q64 60 61 31 Q64 0 33 30 Z" color={color}/><Path path="M31 32 Q10 17 9 31 M33 32 Q54 17 55 31 M29 39 Q12 52 10 40 M35 39 Q52 52 54 40" color={P.cream} style="stroke" strokeWidth={3}/></> : <><Path path="M29 23 Q2 2 5 27 Q0 48 29 37 L24 59 L35 49 L42 60 L36 36 Q64 49 59 27 Q64 3 35 23 Z" color={color}/><Oval x={23} y={22} width={17} height={20} color={P.cream}/><Circle cx={31} cy={32} r={5} color={color}/>
      {id==='bow-icy'?<Path path="M31 23 L31 42 M22 27 L40 37 M22 37 L40 27" color={P.white} style="stroke" strokeWidth={3}/>:id==='bow-rose'?<>{[0,1,2,3,4].map(i=><Circle key={i} cx={31+5*Math.cos(i*Math.PI*2/5)} cy={32+5*Math.sin(i*Math.PI*2/5)} r={4} color={P.pink}/>)}<Circle cx={31} cy={32} r={3} color={P.gold}/></>:null}
    </>}
  </Group></Canvas>;
}
