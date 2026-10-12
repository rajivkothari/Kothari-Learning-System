const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const Jimp=require('jimp-compact'),root=path.resolve(__dirname,'../../..'),pack=path.join(root,'assets/candidates/tower-rescue/v01');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
(async()=>{
 const m=read(path.join(pack,'manifest.json')),g=read(path.join(root,'docs/tower-rescue-art/phase2-generation.json')),assets=[];
 if(!['PENDING OWNER APPROVAL','APPROVED BY OWNER'].includes(m.approval))throw Error('Unknown approval status');
 const decision=m.approval==='APPROVED BY OWNER'?read(path.join(pack,'owner-approval.json')):null;
 if(decision&&(decision.message!=='approved'||decision.assets.length!==19||decision.reviewedCommit!=='20869926bd3c4d4b9d860a127ce6dc7d0d53bcc0'))throw Error('Approval record does not cover this pack');
 for(const a of m.assets){
  if(a.approval!==m.approval)throw Error('Approval mismatch: '+a.id);
  if(decision&&!decision.assets.some(approved=>approved.id===a.id&&approved.sha256===a.sha256&&approved.masterSha256===a.master.sha256))throw Error('Asset differs from approved version: '+a.id);
  const bytes=fs.readFileSync(path.join(pack,a.file)),im=await Jimp.read(bytes);
  if(im.bitmap.width!==a.width||im.bitmap.height!==a.height||sha(bytes)!==a.sha256)throw Error('Export mismatch: '+a.id);
  const masterBytes=fs.readFileSync(path.join(pack,a.master.file)),source=g.records.find(r=>r.id===a.id);
  if(sha(masterBytes)!==a.master.sha256||sha(fs.readFileSync(source.source))!==a.master.sha256)throw Error('Master is not original: '+a.id);
  const hasAlpha=Array.from(im.bitmap.data).some((n,i)=>i%4===3&&n===0);
  if(hasAlpha!==source.alpha)throw Error('Transparency mismatch: '+a.id);
  assets.push({id:a.id,width:a.width,height:a.height,sha256:a.sha256,masterUnchanged:true,transparent:hasAlpha,approval:a.approval});
 }
 const generator=require(path.join(root,'scripts/generate-runtime-manifests.js'));
 const fullArt=read(path.join(root,'content/themes/elevator-quest/art/manifest.json')),rights=read(path.join(root,'content/themes/elevator-quest/art/rights.json')),fullAudio=read(path.join(root,'assets/themes/elevator-quest/audio/manifest.json'));
 const runtimeChecks=[];
 for(const [file,object]of [['content/themes/elevator-quest/art/runtime.json',generator.artRuntime(fullArt,rights)],['assets/themes/elevator-quest/audio/runtime.json',generator.audioRuntime(fullAudio)]]){
  const want=JSON.stringify(object,null,2)+'\n',working=fs.readFileSync(path.join(root,file),'utf8'),committed=execFileSync('git',['show','HEAD:'+file],{cwd:root,encoding:'utf8'});
  runtimeChecks.push({file,workingEqualsGenerated:working===want,workingEqualsGeneratedAfterCRLFNormalisation:working.replace(/\r\n/g,'\n')===want,committedEqualsGenerated:committed===want});
 }
 const productionDiff=execFileSync('git',['diff','--name-only','169c8b9aaf27303a17dcec36c4e86e1c504f10b5','--','src','content','assets/themes','package.json','package-lock.json'],{cwd:root,encoding:'utf8'}).trim();
 if(productionDiff)throw Error('Production changed: '+productionDiff);
 const result={approval:m.approval,assetCount:assets.length,exportBytes:assets.reduce((s,a)=>s+fs.statSync(path.join(pack,a.id+'.png')).size,0),productionDiff:[],runtimeChecks,assets};
 fs.writeFileSync(path.join(__dirname,'asset-validation.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({assets:assets.length,productionDiff:[],runtimeChecks}));
})().catch(e=>{console.error(e);process.exitCode=1});
