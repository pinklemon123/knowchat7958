import { NextResponse } from "next/server";
import { readAISettings, saveAIModel } from "@/lib/ai-settings";
import { isLibraryRequestAuthenticated, libraryUnauthorizedResponse } from "@/lib/library-auth";
import { completeChat } from "@/lib/llm";
import { isWebSearchModel } from "@/lib/model-capabilities";

export const runtime="nodejs";export const dynamic="force-dynamic";

export async function GET(request:Request){if(!(await isLibraryRequestAuthenticated(request)))return libraryUnauthorizedResponse();return NextResponse.json({ok:true,settings:await readAISettings()})}

export async function PUT(request:Request){
  if(!(await isLibraryRequestAuthenticated(request)))return libraryUnauthorizedResponse();
  const body=await request.json().catch(()=>({})) as {model?:string};
  try{if(typeof body.model!=="string")throw new Error("INVALID_MODEL");const settings=await saveAIModel(body.model);return NextResponse.json({ok:true,settings})}
  catch(error){if((error as Error).message==="INVALID_MODEL")return NextResponse.json({ok:false,code:"INVALID_MODEL",error:"请选择有效的模型"},{status:400});throw error}
}

export async function POST(request:Request){
  if(!(await isLibraryRequestAuthenticated(request)))return libraryUnauthorizedResponse();
  const body=await request.json().catch(()=>({})) as {model?:string;mode?:"chat"|"web";prompt?:string};
  const model=body.model?.trim();if(!model)return NextResponse.json({ok:false,code:"INVALID_MODEL",error:"请选择模型"},{status:400});
  const mode=body.mode==="web"?"web":"chat";const started=Date.now();
  if(mode==="web"&&!isWebSearchModel(model))return NextResponse.json({ok:true,model,mode,nativeWebSearchCandidate:false,verified:false,latencyMs:Date.now()-started,message:"该模型名称未声明原生联网能力；如需联网，应改选 Search / DeepSearch 模型，或另行配置外部搜索服务。"});
  try{
    const prompt=mode==="web"?(body.prompt?.trim()||`现在是 ${new Date().toISOString().slice(0,10)}。请联网查找今天一条重要的人工智能新闻，用中文概括，并给出至少一个可点击的 http 或 https 来源链接。`):(body.prompt?.trim()||"请只回复：AI 对话测试成功");
    const answer=await completeChat([{role:"system",content:mode==="web"?"你正在接受联网能力测试。必须实际检索最新信息，并在回答中给出来源 URL；无法联网时请明确说明。":"你正在接受接口连通性测试，请简短回答。"},{role:"user",content:prompt}],0.1,model,700);
    const urls=answer.match(/https?:\/\/[^\s)\]，。]+/g)||[];
    return NextResponse.json({ok:true,model,mode,nativeWebSearchCandidate:isWebSearchModel(model),verified:mode==="chat"?Boolean(answer):urls.length>0,latencyMs:Date.now()-started,answer,urls});
  }catch(error){return NextResponse.json({ok:false,model,mode,error:error instanceof Error?error.message:"模型测试失败",latencyMs:Date.now()-started},{status:502})}
}
