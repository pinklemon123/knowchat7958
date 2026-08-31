import { createHmac, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

function readEnv(text){return Object.fromEntries(text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith("#")&&line.includes("=")).map(line=>{const index=line.indexOf("=");return [line.slice(0,index),line.slice(index+1).replace(/^['"]|['"]$/g,"")]}))}

const env=readEnv(await readFile(".env.local","utf8"));
const dataRoot=path.resolve(env.LIBRARY_DATA_DIR||"./data");
const auth=JSON.parse(await readFile(path.join(dataRoot,"auth/library-auth.json"),"utf8"));
const expires=Math.floor(Date.now()/1000)+600;const payload=`${expires}.${randomBytes(16).toString("hex")}`;const token=`${payload}.${createHmac("sha256",auth.sessionSecret).update(payload).digest("hex")}`;const cookie=`green_library_session=${token}`;
const models=await fetch("http://localhost:3000/api/models").then(response=>response.json());
const priorities=["deepseek-v3-search","gemini-2.5-flash-search","qwen3.5-flash-search"].filter(model=>models.webModels?.includes(model));

const savedResponse=await fetch("http://localhost:3000/api/library/ai-settings",{method:"PUT",headers:{cookie,"content-type":"application/json"},body:JSON.stringify({model:models.current||"gpt-4o-mini"})});
const saved=await savedResponse.json();
const persisted=await fetch("http://localhost:3000/api/library/ai-settings",{headers:{cookie}}).then(response=>response.json());

async function test(model,mode){const response=await fetch("http://localhost:3000/api/library/ai-settings",{method:"POST",headers:{cookie,"content-type":"application/json"},body:JSON.stringify({model,mode})});const data=await response.json();return {model,mode,http:response.status,ok:Boolean(data.ok),verified:Boolean(data.verified),latencyMs:data.latencyMs,urlCount:data.urls?.length||0,error:data.error}}

const chat=await test(models.current||"gpt-4o-mini","chat");
const web=await Promise.all(priorities.map(model=>test(model,"web")));
console.log(JSON.stringify({totalModels:models.models?.length||0,nativeWebCandidates:models.webModels?.length||0,settingsPersistence:saved.ok&&persisted.settings?.defaultModel===(models.current||"gpt-4o-mini")?"PASS":"FAIL",chat,web},null,2));
