import { createHmac, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const baseUrl=process.env.TEST_BASE_URL||"http://localhost:3000";
function readEnv(text){return Object.fromEntries(text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith("#")&&line.includes("=")).map(line=>{const index=line.indexOf("=");return [line.slice(0,index),line.slice(index+1).replace(/^['"]|['"]$/g,"")]}))}
async function api(cookie,url,options={}){const response=await fetch(`${baseUrl}${url}`,{...options,headers:{cookie,...(options.headers||{})}});return {response,body:await response.json().catch(()=>null)}}

const runtime=path.resolve("tests/runtime");
const source=path.join(runtime,`collection-test-${Date.now()}.txt`);
let pool,itemId,collectionId,relativePath;

try{
  const env=readEnv(await readFile(".env.local","utf8"));
  const dataRoot=path.resolve(env.LIBRARY_DATA_DIR||"./data");
  const auth=JSON.parse(await readFile(path.join(dataRoot,"auth/library-auth.json"),"utf8"));
  const expires=Math.floor(Date.now()/1000)+300;const payload=`${expires}.${randomBytes(16).toString("hex")}`;const token=`${payload}.${createHmac("sha256",auth.sessionSecret).update(payload).digest("hex")}`;const cookie=`green_library_session=${token}`;
  pool=new pg.Pool({connectionString:env.DATABASE_URL});
  await mkdir(runtime,{recursive:true});await writeFile(source,`collection e2e ${Date.now()}`);
  const uploadForm=new FormData();uploadForm.append("file",new Blob([await readFile(source)],{type:"text/plain"}),path.basename(source));
  const uploaded=await api(cookie,"/api/files/upload",{method:"POST",body:uploadForm});if(uploaded.response.status!==201)throw new Error(`upload ${uploaded.response.status}`);itemId=uploaded.body.item.id;relativePath=uploaded.body.file.relativePath;
  const uniqueName=`测试分类-${Date.now()}`;
  const created=await api(cookie,"/api/collections",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:uniqueName})});if(created.response.status!==201)throw new Error(`create ${created.response.status}`);collectionId=created.body.collection.id;
  const moved=await api(cookie,`/api/library/${itemId}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"move-collection",collectionId})});if(!moved.response.ok)throw new Error(`move ${moved.response.status}`);
  const filtered=await api(cookie,`/api/library?collection=${collectionId}&limit=100`);if(!filtered.body?.items?.some(item=>item.id===itemId))throw new Error("collection filter failed");
  const renamed=await api(cookie,`/api/collections/${collectionId}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({name:`${uniqueName}-已改名`})});if(!renamed.response.ok)throw new Error(`rename ${renamed.response.status}`);
  const removed=await api(cookie,`/api/collections/${collectionId}`,{method:"DELETE"});if(!removed.response.ok)throw new Error(`delete ${removed.response.status}`);collectionId=null;
  const item=await api(cookie,`/api/library/${itemId}`);if(item.body?.item?.collectionId!==null)throw new Error("deleted collection did not release item");
  console.log(JSON.stringify({createCollection:"PASS",moveItem:"PASS",filterCollection:"PASS",renameCollection:"PASS",deleteKeepsFileUnclassified:"PASS"}));
}finally{
  await unlink(source).catch(()=>{});
  if(pool&&collectionId)await pool.query("DELETE FROM collections WHERE id=$1",[collectionId]).catch(()=>{});
  if(pool&&itemId)await pool.query("DELETE FROM library_items WHERE id=$1",[itemId]).catch(()=>{});
  if(relativePath){const env=readEnv(await readFile(".env.local","utf8"));const root=path.resolve(env.LIBRARY_DATA_DIR||"./data","library");const target=path.resolve(root,...relativePath.split("/"));if(target.startsWith(`${root}${path.sep}`))await unlink(target).catch(()=>{})}
  if(pool)await pool.end();
}
