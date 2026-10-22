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
  if(!b.file||files.has(b.file))throw new Error("Duplicate or missing module.");
  markers.add(b.marker);files.add(b.file);
  const count=html.split(b.marker).length-1;
  if(count!==1)throw new Error("Expected exactly one module marker; count="+count);
  html=html.replace(b.marker,b.openTag+fs.readFileSync(path.join(dir,b.file),"utf8")+b.closeTag);
 }
 if(/<!-- @verix:module:\d{4} -->/.test(html))throw new Error("Unresolved module marker.");
 return html;
}
export function readOperationalManifest(root=process.cwd()){
 return JSON.parse(fs.readFileSync(path.join(root,"src","operational","blocks.json"),"utf8"));
}
