// Records provenance and local file checks; never generates or downloads audio.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const metadata=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const root='assets/themes/magical-kingdom/audio';
const hash=file=>{const bytes=fs.readFileSync(path.join(root,file));if(bytes.length<1000)throw Error(`Empty ${file}`);return {bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};};
for(const clip of metadata.clips)Object.assign(clip,hash(clip.file));
Object.assign(metadata.audition,hash(metadata.audition.file));
metadata.totalCredits=metadata.clips.reduce((n,c)=>n+c.credits,0)+metadata.audition.variations.reduce((n,c)=>n+c.credits,0);
metadata.totalPriceCents=metadata.clips.reduce((n,c)=>n+c.priceCents,0)+metadata.audition.variations.reduce((n,c)=>n+c.priceCents,0);
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});
console.log(`${metadata.clips.length} local clips; ${metadata.totalCredits} credits; ${metadata.totalPriceCents.toFixed(2)} cents; human listening review pending.`);
