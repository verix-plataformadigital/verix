import fs from "node:fs";
import path from "node:path";
export function readOperationalSource(root=process.cwd()){
 const dir=path.join(root,"src","operational");
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,"blocks.json"),"utf8"));
 let html=fs.readFileSync(path.join(dir,"template.html"),"utf8");
 if(manifest.schemaVersion!==1||!Array.isArray(manifest.blocks))throw new Error("Unsupported source manifest.");
 const markers=new Set(),files=new Set();
 for(const b of manifest.blocks){
  if(!b.marker||markers.has(b.marker))throw new Error("Duplicate or missing marker.");
  markers.add(b.marker);
  const paths=Array.isArray(b.parts)&&b.parts.length?b.parts:[b.file];
  if(paths.some(p=>!p))throw new Error("Missing module path.");
  for(const file of paths){
   if(files.has(file))throw new Error("Duplicate module path: "+file);
   files.add(file);
  }
  const count=html.split(b.marker).length-1;
  if(count!==1)throw new Error("Expected exactly one module marker; count="+count);
  const body=paths.map(file=>fs.readFileSync(path.join(dir,file),"utf8")).join("");
  html=html.replace(b.marker,b.openTag+body+b.closeTag);
 }
 if(/<!-- @verix:module:\d{4} -->/.test(html))throw new Error("Unresolved module marker.");
 return html;
}
export function readOperationalManifest(root=process.cwd()){
 return JSON.parse(fs.readFileSync(path.join(root,"src","operational","blocks.json"),"utf8"));
}
