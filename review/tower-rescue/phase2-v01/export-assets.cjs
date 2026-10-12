// Review-only export preparation. Original generated masters remain unchanged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Jimp=require('jimp-compact');
const root=path.resolve(__dirname,'../../..');
const pack=path.join(root,'assets/candidates/tower-rescue/v01');
const source=JSON.parse(fs.readFileSync(path.join(root,'docs/tower-rescue-art/phase2-generation.json')));
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
function inspect(im){
 const {width:w,height:h,data}=im.bitmap;
 let min=255,max=0,zero=0,left=w,top=h,right=-1,bottom=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const a=data[(y*w+x)*4+3];min=Math.min(min,a);max=Math.max(max,a);if(a===0)zero++;
  if(a>=32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 }
 return {width:w,height:h,alphaRange:[min,max],transparentPixels:zero,contentBoundsAlpha32:[left,top,right+1,bottom+1]};
}
(async()=>{
 fs.mkdirSync(path.join(pack,'masters'),{recursive:true});
 const assets=[];
 for(const record of source.records){
  const master=path.join(pack,'masters',record.id+'.png');
  if(!fs.existsSync(master))fs.copyFileSync(record.source,master);
  const bytes=fs.readFileSync(master),image=await Jimp.read(bytes),original=inspect(image);
  if(record.alpha&&original.transparentPixels===0)throw Error('Missing alpha: '+record.id);
  const [w,h]=record.size;
  // Only uniform resampling and transparent padding for requested tablet delivery canvases.
  // No painting, cutout, tint, mirroring or art edits occur in this export step.
  const scale=Math.min(w/original.width,h/original.height);
  const rw=Math.round(original.width*scale),rh=Math.round(original.height*scale);
  image.resize(rw,rh,Jimp.RESIZE_BICUBIC);
  const canvas=new Jimp(w,h,0x00000000);
  canvas.composite(image,Math.floor((w-rw)/2),Math.floor((h-rh)/2));
  const output=path.join(pack,record.id+'.png');
  if(fs.existsSync(output))throw Error('Export exists; preserve it and version a new pack: '+output);
  await canvas.writeAsync(output);
  const exported=await Jimp.read(output),stats=inspect(exported);
  assets.push({id:record.id,file:record.id+'.png',use:record.use,classification:'PRODUCTION CANDIDATE',approval:'PENDING OWNER APPROVAL',...stats,bytes:fs.statSync(output).size,sha256:hash(fs.readFileSync(output)),master:{file:'masters/'+record.id+'.png',...original,bytes:bytes.length,sha256:hash(bytes)},generation:'Built-in OpenAI image_gen; exact prompts in docs/tower-rescue-art/phase2-generation.json',export:'Uniform bicubic resample and transparent canvas padding; jimp-compact 0.16.1; original alpha retained'});
 }
 const manifest={schema:'tower-rescue-candidate-art-v1',approval:'PENDING OWNER APPROVAL',directionApproval:'Owner approved Phase 2 visual direction on 2026-10-12; no production piece approved',baseline:'169c8b9aaf27303a17dcec36c4e86e1c504f10b5',productionIntegration:false,assets};
 fs.writeFileSync(path.join(pack,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({assets:assets.length,exportBytes:assets.reduce((n,a)=>n+a.bytes,0),decodedBytes:assets.reduce((n,a)=>n+a.width*a.height*4,0),alphaAssets:assets.filter(a=>a.transparentPixels>0).length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
