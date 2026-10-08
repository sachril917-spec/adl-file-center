import { AwsClient } from "aws4fetch";
const BRANCHES=["ADL Talang","ADL Karanganyar","ADL Brebes","ADL Tanglog","ADL Bumiayu","ADL Gumayun","Rizky Pustaka","ADL Kaligelnag","ADL Kaliwungu","ADL Weleri","ADL Kedungwuni","Toko Foto FC Dicky","ADL Ketanggungan","ADL Debong","ADL Mejasem","ADL Ajibarang","ADL Bandar"];
const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};
const J=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...H,"Content-Type":"application/json;charset=utf-8"}});
const clean=x=>String(x||"").trim().replace(/[^\p{L}\p{N}._ -]+/gu,"_").replace(/\s+/g,"_");
function c(e){return new AwsClient({accessKeyId:e.B2_KEY_ID,secretAccessKey:e.B2_APPLICATION_KEY,service:"s3",region:e.B2_REGION});}
function u(e,k=""){return e.B2_ENDPOINT.replace(/\/+$/,"")+"/"+e.B2_BUCKET+(k?"/"+k.split("/").map(encodeURIComponent).join("/"):"");}
async function s(e,k,method,body,headers={}){return c(e).fetch(u(e,k),{method,headers,body});}
async function upload(req,e){
 const f=await req.formData(), file=f.get("file"), branch=f.get("branch"), type=f.get("reportType")||"Berkas";
 if(!(file instanceof File))return J({ok:false,error:"File belum dipilih."},400);
 if(!BRANCHES.includes(branch))return J({ok:false,error:"Cabang tidak valid."},400);
 const d=new Date(), y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,"0");
 const k=`${y}/${m}/${clean(branch)}/${clean(type)}/${d.toISOString().replace(/[:.]/g,"-")}_${crypto.randomUUID()}_${clean(file.name)}`;
 const r=await s(e,k,"PUT",file.stream(),{"Content-Type":file.type||"application/octet-stream"});
 if(!r.ok)return J({ok:false,error:"Upload ke Backblaze gagal.",status:r.status},502);
 return J({ok:true,key:k,receivedAt:d.toISOString(),message:"Upload berhasil."});
}
async function list(e){
 const r=await s(e,"","GET"); if(!r.ok)throw Error("Gagal membaca Backblaze");
 const x=await r.text(), a=[...x.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)];
 return a.map(z=>{let q=z[1],t=n=>{let m=q.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`));return m?m[1]:""};let k=t("Key");let p=k.split("/");return{key:k,size:+t("Size")||0,modified:t("LastModified"),branch:p[2]||"",reportType:p[3]||"",name:p.slice(4).join("/")}}).filter(x=>x.key);
}
export default {async fetch(req,e){
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});
 let p=new URL(req.url).pathname;
 if(p==="/api/health")return J({ok:true,storage:"Backblaze B2"});
 if(p==="/api/branches")return J({branches:BRANCHES});
 try{
  if(p==="/api/upload"&&req.method==="POST")return await upload(req,e);
  if(p==="/api/inbox"){let f=await list(e);f.sort((a,b)=>String(b.modified).localeCompare(String(a.modified)));return J({ok:true,files:f});}
  if(p==="/api/download"){let k=new URL(req.url).searchParams.get("key");if(!k||k.includes(".."))return new Response("Bad key",{status:400});let r=await s(e,k,"GET");let h=new Headers(r.headers);for(let [a,b] of Object.entries(H))h.set(a,b);return new Response(r.body,{status:r.status,headers:h});}
 }catch(err){return J({ok:false,error:err.message},500)}
 return e.ASSETS.fetch(req);
}};