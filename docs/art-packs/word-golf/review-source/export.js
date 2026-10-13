const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const specs=JSON.parse(fs.readFileSync(path.join(root,'generation-record.json'),'utf8'));
async function bounds(file){const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});let minX=info.width,minY=info.height,maxX=-1,maxY=-1,clear=0,opaque=0;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(a===0)clear++;if(a===255)opaque++;if(a>16){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}}return {x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1,clearFraction:clear/(info.width*info.height),opaqueFraction:opaque/(info.width*info.height)};}
(async()=>{fs.mkdirSync(path.join(root,'runtime'),{recursive:true});fs.mkdirSync(path.join(root,'compact'),{recursive:true});let assets=[];
for(const a of specs){const file=path.join(root,'assets',a.id+'.png');const meta=await sharp(file).metadata(),b=await bounds(file);if(a.alpha&&!meta.hasAlpha)throw Error(a.id+' has no alpha');if(a.alpha&&b.clearFraction<.01)throw Error(a.id+' has no clear background');if(!a.alpha&&b.opaqueFraction<.99)throw Error(a.id+' not opaque');
const landscape=['sky','skyline'].includes(a.id),tile=['roof-deck','fairway','rough','green','sand','water'].includes(a.id);const max=landscape?(a.id==='skyline'?768:1024):tile?256:a.id.startsWith('golfer')?256:128;
const out=path.join(root,'runtime',a.id+'.webp');await sharp(file).resize({width:max,height:max,fit:'inside',withoutEnlargement:true}).webp(a.alpha?{lossless:true}:{quality:88}).toFile(out);const rm=await sharp(out).metadata();
const base=['flag','tank','antenna','floodlights'].includes(a.id)||a.id.startsWith('golfer');let pivot={x:(b.x+b.width/2)/meta.width,y:(base?b.y+b.height:b.y+b.height/2)/meta.height};
if(a.id==='flag')pivot={x:0.412,y:0.91};
if(a.id==='rotor')pivot={x:0.5,y:0.494};
if(a.id==='club')pivot={x:0.25,y:0.42};
const item={id:a.id,status:'APPROVED_BY_OWNER',master:'assets/'+a.id+'.png',runtime:'runtime/'+a.id+'.webp',alpha:a.alpha,sourceSize:{width:meta.width,height:meta.height},runtimeSize:{width:rm.width,height:rm.height},decodedBytes:rm.width*rm.height*4,bounds:b,pivot,pivotPurpose:a.id==='rotor'?'hub rotation':base?'base contact':a.id==='club'?'grip hinge':'center',pivotValidation:'measured in image, composition checked; integration rehearsal required',sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),runtimeSha256:crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex'),role:a.desc};
if(a.id==='golfer-ready')item.handGrip={x:0.587,y:0.626};
if(a.id==='golfer-backswing')item.handGrip={x:0.259,y:0.258};
if(a.id==='golfer-followthrough')item.handGrip={x:0.751,y:0.171};
if(a.id.startsWith('golfer')){item.registrationGroup='golfer';item.groundAnchor={x:a.id==='golfer-backswing'?0.535:0.51,y:a.id==='golfer-followthrough'?0.865:0.89};item.pivot=item.groundAnchor;item.pivotPurpose='ground contact; club uses separate handGrip';}
if(['tank','antenna','floodlights','motor-housing','rotor','golfer-ready','flag','ramp','bumper','target-safe','target-bold'].includes(a.id)){const cp=path.join(root,'compact',a.id+'.webp');await sharp(file).resize({width:96,height:96,fit:'inside',withoutEnlargement:true}).webp({lossless:true}).toFile(cp);const cm=await sharp(cp).metadata();item.compact={path:'compact/'+a.id+'.webp',width:cm.width,height:cm.height,decodedBytes:cm.width*cm.height*4};}
assets.push(item);}
const existingManifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8')); const manifest={phase2Approval:existingManifest.phase2Approval,schemaVersion:1,pack:'word-golf-production-art',status:'APPROVED_BY_OWNER',sourceCommit:'51f5105e47bb68fff174f457703f68e905373daf',phase1Approval:{date:'2026-10-13',message:'approve',scope:'visual direction only'},generator:'OpenAI built-in image_gen',integration:'NOT_INTEGRATED',coordinateSystem:'source course yards, x right, y down; bounds/pivots measured from original PNG',assets,totalDecodedBytes:assets.reduce((s,a)=>s+a.decodedBytes,0)};fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({assets:assets.length,decodedMiB:manifest.totalDecodedBytes/1048576,alphaChecks:'passed',assetsWithAlpha:assets.filter(a=>a.alpha).length}));})();


