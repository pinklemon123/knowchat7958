import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { configuredModel } from "./openai";
import { getDataRoot } from "./storage";

type AISettings = { defaultModel:string; updatedAt:string };

function settingsPaths(){const directory=path.join(getDataRoot(),"settings");return {directory,file:path.join(directory,"ai.json"),temporary:path.join(directory,"ai.tmp")}}
function validModel(model:string){return model.trim().length>0&&model.trim().length<=160&&!/[\u0000-\u001f]/.test(model)}

export async function readAISettings():Promise<AISettings>{
  try{const value=JSON.parse(await readFile(settingsPaths().file,"utf8")) as AISettings;if(validModel(value.defaultModel))return value;}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")console.error("Unable to read AI settings",error)}
  return {defaultModel:configuredModel(),updatedAt:new Date(0).toISOString()};
}

export async function selectedAIModel(){return (await readAISettings()).defaultModel}

export async function saveAIModel(model:string){
  const normalized=model.trim();if(!validModel(normalized))throw new Error("INVALID_MODEL");
  const paths=settingsPaths();await mkdir(paths.directory,{recursive:true});
  const value:AISettings={defaultModel:normalized,updatedAt:new Date().toISOString()};
  await writeFile(paths.temporary,JSON.stringify(value,null,2),{encoding:"utf8",mode:0o600});await rename(paths.temporary,paths.file);return value;
}
