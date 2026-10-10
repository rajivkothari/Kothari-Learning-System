// Build-time download only. Gameplay imports static local MP3s.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
  const entries=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  for(const entry of entries){
    const file=path.resolve(entry.file);
    if(!file.startsWith(path.resolve('assets/themes/magical-kingdom/audio')+path.sep))throw Error('Unexpected voice output path');
    if(fs.existsSync(file))continue;
    const response=await fetch(entry.url);if(!response.ok)throw Error(`Download failed ${entry.id}: ${response.status}`);
    const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length<1000)throw Error(`Empty recording ${entry.id}`);
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});
    console.log(`${entry.id}: ${bytes.length} bytes, ${crypto.createHash('sha256').update(bytes).digest('hex')}`);
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
