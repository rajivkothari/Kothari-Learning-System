import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import script from '../../../../content/themes/magical-kingdom/narration-script.json';
import manifest from '../../../../assets/themes/magical-kingdom/audio/manifest.json';
import ui from '../../../../content/themes/magical-kingdom/ui.json';
import wardrobe from '../../../../content/themes/magical-kingdom/wardrobe.json';

test('each finite authored line has one unchanged local recording and source entry',()=>{
  expect(script.status).toBe('recorded');expect(manifest.takesPerLine).toBe(1);
  expect(manifest.clips).toHaveLength(script.lines.length);
  const sources=fs.readFileSync(path.join(__dirname,'sources.ts'),'utf8');
  for(const line of script.lines){
    const clip=manifest.clips.find(c=>c.id===line.id)!;expect(clip.text).toBe(line.text);
    const bytes=fs.readFileSync(path.join(__dirname,'../../../../assets/themes/magical-kingdom/audio',clip.file));
    expect(bytes.length).toBe(clip.bytes);expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(clip.sha256);
    expect(clip.durationSeconds).toBeGreaterThan(.3);expect(sources).toContain(JSON.stringify(`voice:${line.text}`));
  }
  expect(sources).not.toMatch(/https?:\/\//);
});
test('all UI narration paths are covered, including repair counts and wardrobe goals',()=>{
  const texts=new Set(script.lines.map(l=>l.text));
  for(const key of ['guide','hat','iceIntro','gardenIntro','iceRetry','iceClue','iceGuided','iceShown','iceSuccess','gardenRetry','gardenClue','gardenGuided','gardenShown','gardenSuccess'] as const)expect(texts.has(ui[key])).toBe(true);
  for(let n=1;n<=10;n++)expect(texts.has(ui.iceInstruction.replace('{count}',String(n)))).toBe(true);
  for(let initial=1;initial<=4;initial++)for(let count=2;count<=10-initial;count++)expect(texts.has(ui.iceRepair.replace('{initial}',String(initial)).replace('{count}',String(count)))).toBe(true);
  for(const word of ['sun','cat','fox','bee','moon','fish','duck','hat'])expect(texts.has(ui.gardenInstruction.replace('{word}',word))).toBe(true);
  expect(texts.has(wardrobe.copy.newGift)).toBe(true);
  for(const item of wardrobe.items.filter(i=>i.count>0))expect(texts.has(item.goal)).toBe(true);
});
