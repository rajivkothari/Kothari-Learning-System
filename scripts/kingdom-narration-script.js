// Prepare a finite recording brief. This does not call a service or spend credits.
const fs=require('node:fs');
const ui=require('../content/themes/magical-kingdom/ui.json');
const wardrobe=require('../content/themes/magical-kingdom/wardrobe.json');
const lines=[];
const add=(id,text)=>lines.push({id,text});
for(const key of ['guide','iceIntro','gardenIntro','iceRetry','iceClue','iceGuided','iceShown','iceSuccess','gardenRetry','gardenClue','gardenGuided','gardenShown','gardenSuccess']) add(key,ui[key]);
for(let count=1;count<=10;count++) add(`bridge.${count}`,ui.iceInstruction.replace('{count}',count));
for(let initial=1;initial<=4;initial++) for(let count=2;count<=10-initial;count++) add(`repair.${initial}.${count}`,ui.iceRepair.replace('{initial}',initial).replace('{count}',count));
for(const word of ['sun','cat','fox','bee','moon','fish','duck','hat']) add(`garden.${word}`,ui.gardenInstruction.replace('{word}',word));
add('gift',wardrobe.copy.newGift);
for(const [i,goal] of [...new Set(wardrobe.items.filter(x=>x.count>0).map(x=>x.goal))].entries()) add(`unlock.${i+1}`,goal);
fs.writeFileSync('content/themes/magical-kingdom/narration-script.json',JSON.stringify({status:'awaiting-recording',referenceVoice:{provider:'ElevenLabs',voiceId:'jemqINv7N9LKUclcLQnU',modelId:'eleven_multilingual_v2',source:'assets/themes/elevator-quest/audio/manifest.json#packs.elevenlabs-narration-v1'},direction:'Warm, clear, friendly storybook guide. Unhurried for early learners. No music or sound effects under the words. Match the recorded project voice; audition before generating the full pack.',lines},null,2)+'\n');
console.log(`${lines.length} authored lines; no service calls made.`);
