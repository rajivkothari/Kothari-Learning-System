// Supplement the existing bundle gate: every kingdom raster remains prototype-only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):[path.join(dir,x.name)]);
const art=walk('assets/themes/magical-kingdom').filter(f=>f.endsWith('.png')).map(file=>({file,md5:crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex')}));
for(const dir of process.argv.slice(2)){
  const names=walk(dir);const included=art.filter(a=>names.some(n=>path.basename(n).includes(a.md5)));
  assert.deepEqual(included,[],`${dir}: prototype raster included`);console.log(`PASS ${dir}: all ${art.length} kingdom raster files excluded`);
}
