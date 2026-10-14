import { AwsClient } from "aws4fetch";
const DEFAULT_BRANCHES=["ADL Talang","ADL Karanganyar","ADL Brebes","ADL Tanglog","ADL Bumiayu","ADL Gumayun","Rizky Pustaka","ADL Kaligelang","ADL Kaliwungu","ADL Weleri","ADL Kedungwuni","ADL Bobotsari","ADL Ketanggungan","ADL Debong","ADL Mejasem","ADL Ajibarang","ADL Bandar","ADL Buaran"];
const BRANCH_CONFIG="__config/branches.json";
const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};
const J=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...H,"Content-Type":"application/json;charset=utf-8","Cache-Control":"no-store"}});
const clean=x=>String(x||"").trim().replace(/[^\p{L}\p{N}._ -]+/gu,"_").replace(/\s+/g,"_");
function c(e){return new AwsClient({accessKeyId:e.B2_KEY_ID,secretAccessKey:e.B2_APPLICATION_KEY,service:"s3",region:e.B2_REGION});}
function u(e,k=""){return e.B2_ENDPOINT.replace(/\/+$/,"")+"/"+e.B2_BUCKET+(k?"/"+k.split("/").map(encodeURIComponent).join("/"):"");}
async function s(e,k,method,body,headers={}){return c(e).fetch(u(e,k),{method,headers,body});}
const ADMIN_COOKIE="__Host-adl_admin",ADMIN_SESSION_SECONDS=8*60*60;
async function adminMac(secret,message){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message));return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,"0")).join("");}
async function adminPasswordMatches(input,secret){if(typeof input!=="string"||typeof secret!=="string"||!secret||input.length>1024)return false;const digest=async value=>new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));const a=await digest(input),b=await digest(secret);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;}
async function adminSessionValid(req,env){if(!env.ADMIN_PASSWORD)return false;const cookies=req.headers.get("Cookie")||"",item=cookies.split(";").map(x=>x.trim()).find(x=>x.startsWith(ADMIN_COOKIE+"="));if(!item)return false;const parts=item.slice(ADMIN_COOKIE.length+1).split(".");if(parts.length!==2||!/^\d+$/.test(parts[0])||! /^[a-f0-9]{64}$/.test(parts[1]))return false;const exp=Number(parts[0]),now=Math.floor(Date.now()/1000);if(!Number.isSafeInteger(exp)||exp<=now||exp>now+ADMIN_SESSION_SECONDS)return false;const expected=await adminMac(env.ADMIN_PASSWORD,"adl-admin-v1:"+parts[0]);return await adminPasswordMatches(parts[1],expected);}
function adminOriginOK(req){return req.headers.get("Origin")===new URL(req.url).origin;}
function adminCookie(value,maxAge){return ADMIN_COOKIE+"="+value+"; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age="+maxAge;}
async function getBranches(e){try{const r=await s(e,BRANCH_CONFIG,"GET");if(r.ok){const x=await r.json();if(Array.isArray(x.branches)&&x.branches.every(v=>typeof v==="string"))return x.branches;}}catch{}return [...DEFAULT_BRANCHES];}
async function saveBranches(e,branches){return await s(e,BRANCH_CONFIG,"PUT",JSON.stringify({branches,updatedAt:new Date().toISOString()}),{"Content-Type":"application/json"});}
async function upload(req,e){const f=await req.formData(),file=f.get("file"),branch=f.get("branch"),type=f.get("reportType")||"Berkas";if(!(file instanceof File))return J({ok:false,error:"File belum dipilih."},400);const branches=await getBranches(e);if(!branches.includes(branch))return J({ok:false,error:"Cabang tidak valid atau sudah dihapus. Muat ulang aplikasi Cabang."},400);const d=new Date(),y=d.getUTCFullYear(),m=String(d.getUTCMonth()+1).padStart(2,"0");const k=`${y}/${m}/${clean(branch)}/${clean(type)}/${d.toISOString().replace(/[:.]/g,"-")}_${crypto.randomUUID()}_${clean(file.name)}`;const r=await s(e,k,"PUT",file.stream(),{"Content-Type":file.type||"application/octet-stream"});if(!r.ok)return J({ok:false,error:"Upload ke Backblaze gagal.",status:r.status},502);return J({ok:true,key:k,receivedAt:d.toISOString(),message:"Upload berhasil."});}
async function list(e){const r=await s(e,"","GET");if(!r.ok)throw Error("Gagal membaca Backblaze");const x=await r.text(),a=[...x.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)];return a.map(z=>{let q=z[1],t=n=>{let m=q.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`));return m?m[1]:""};let k=t("Key"),p=k.split("/");return{key:k,size:+t("Size")||0,modified:t("LastModified"),branch:(p[2]||"").replace(/_/g," "),reportType:(p[3]||"").replace(/_/g," "),name:p.slice(4).join("/")}}).filter(x=>/^\d{4}\/\d{2}\//.test(x.key));}
function validFileKey(k){return typeof k==="string"&&/^\d{4}\/\d{2}\/[\p{L}\p{N}._ -]+\/[\p{L}\p{N}._ -]+\/.+$/u.test(k)&&!k.includes("..")&&!k.startsWith("__config/");}
export default {async fetch(req,e){if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});const url=new URL(req.url),p=url.pathname;if(p==="/api/health")return J({ok:true,storage:"Backblaze B2"});
try{
 if(p==="/api/branches"&&req.method==="GET")return J({branches:await getBranches(e)});

 if(p==="/api/daily-motivation"&&req.method==="GET"){
  const now=new Date();
  const parts=new Intl.DateTimeFormat("en-CA",{
   timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(now);
  const part=n=>parts.find(x=>x.type===n).value;
  const day=part("year")+"-"+part("month")+"-"+part("day");
  const key="__config/motivation/"+day+".json";

  try{
   const old=await s(e,key,"GET");
   if(old.ok){
    const saved=await old.json();
    if(saved.title&&saved.message&&url.searchParams.get("new")!=="1")return J({...saved,cached:true});
   }
  }catch{}

  if(!e.AI)return J({
   ok:false,error:"AI belum terhubung. Periksa binding AI di Cloudflare."
  },503);

  try{
   const result=await e.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8",{
    messages:[
     {
      role:"system",
      content:"Kamu penulis motivasi harian berbahasa Indonesia. Buat tulisan singkat yang benar-benar segar, lucu, cerdas, hangat, agamis secara moderat, tentang kerja jujur, mencari nafkah halal, amanah, pelanggan, usaha, keluarga, syukur dan doa. Gunakan humor sehari-hari yang sopan dan tidak menghina. Hindari mengarang ayat atau hadis. Jangan mengklaim tulisan sebagai ayat atau hadis. Jawab hanya JSON valid dengan bentuk {\"title\":\"judul singkat lucu\",\"message\":\"motivasi 2 sampai 4 kalimat\"}. Hindari klise dan variasikan sudut pandang serta lelucon."
     },
     {
      role:"user",
      content:"Buat satu motivasi baru untuk tanggal "+day+". Tema kerja mencari nafkah halal, nilai Islami dan humor segar. Jangan menyebut tanggal di dalam tulisan. Hasil harus JSON sesuai format."
     }
    ],
    max_tokens:220,
    temperature:0.95
   });

   let textOut=String(result.response||"").trim();
   textOut=textOut.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
   const start=textOut.indexOf("{"),end=textOut.lastIndexOf("}");
   if(start<0||end<start)throw Error("Jawaban AI bukan JSON");
   const item=JSON.parse(textOut.slice(start,end+1));
   if(typeof item.title!=="string"||typeof item.message!=="string")throw Error("Format jawaban AI tidak valid");

   const output={
    ok:true,date:day,title:item.title.slice(0,100),
    message:item.message.slice(0,1200),source:"Cloudflare AI"
   };
   await s(e,key,"PUT",JSON.stringify(output),{
    "Content-Type":"application/json"
   });
   return J({...output,cached:false});
  
}catch(err){
   console.error("daily-motivation:",err);
   return J({
    ok:false,
    error:"Motivasi AI gagal",
    detail:String(err?.message||err).slice(0,300)
   },502);
  
  }
 }

 if(p==="/api/admin/login"&&req.method==="POST")
{if(!adminOriginOK(req))return J({ok:false,error:"Origin tidak valid."},403);if(!e.ADMIN_PASSWORD)return J({ok:false,error:"ADMIN_PASSWORD belum tersedia."},500);let data;try{data=await req.json()}catch{return J({ok:false,error:"Data login tidak valid."},400)}if(!await adminPasswordMatches(data.password,e.ADMIN_PASSWORD))return J({ok:false,error:"Kata sandi salah."},401);const exp=String(Math.floor(Date.now()/1000)+ADMIN_SESSION_SECONDS),sig=await adminMac(e.ADMIN_PASSWORD,"adl-admin-v1:"+exp);return new Response(JSON.stringify({ok:true,message:"Login admin berhasil."}),{headers:{...H,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Set-Cookie":adminCookie(exp+"."+sig,ADMIN_SESSION_SECONDS)}})}
 if(p==="/api/admin/check"&&req.method==="GET")return J({ok:await adminSessionValid(req,e)});
 if(p==="/api/admin/logout"&&req.method==="POST"){if(!adminOriginOK(req))return J({ok:false,error:"Origin tidak valid."},403);return new Response(JSON.stringify({ok:true}),{headers:{...H,"Content-Type":"application/json; charset=utf-8","Set-Cookie":adminCookie("",0),"Cache-Control":"no-store"}})}
 if(p.startsWith("/api/admin/")&&req.method==="POST"&&!await adminSessionValid(req,e))return J({ok:false,error:"Admin belum login."},401);
 if(p.startsWith("/api/admin/")&&req.method==="POST"&&!adminOriginOK(req))return J({ok:false,error:"Origin tidak valid."},403);
 if(p==="/api/admin/branches"&&req.method==="POST"){let d;try{d=await req.json()}catch{return J({ok:false,error:"Data tidak valid."},400)}const branches=await getBranches(e),name=String(d.name||"").trim().replace(/\s+/g," ");if(!name||name.length>80||/[<>]/.test(name))return J({ok:false,error:"Nama cabang harus 1–80 karakter."},400);const norm=x=>x.toLocaleLowerCase("id-ID");if(d.action==="add"){if(branches.some(b=>norm(b)===norm(name)))return J({ok:false,error:"Nama cabang sudah ada."},409);if(branches.length>=100)return J({ok:false,error:"Maksimal 100 cabang."},400);branches.push(name);}else if(d.action==="remove"){const i=branches.findIndex(b=>norm(b)===norm(name));if(i<0)return J({ok:false,error:"Cabang tidak ditemukan."},404);branches.splice(i,1);}else return J({ok:false,error:"Aksi tidak valid."},400);const r=await saveBranches(e,branches);if(!r.ok)return J({ok:false,error:"Gagal menyimpan daftar cabang di Backblaze.",status:r.status},502);return J({ok:true,branches,message:d.action==="add"?"Cabang ditambahkan.":"Cabang dihapus dari daftar."});}
 if(p==="/api/admin/delete-file"&&req.method==="POST"){let d;try{d=await req.json()}catch{return J({ok:false,error:"Data tidak valid."},400)}const key=d.key;if(!validFileKey(key))return J({ok:false,error:"Kunci berkas tidak valid."},400);const r=await s(e,key,"DELETE");if(!r.ok&&r.status!==404)return J({ok:false,error:"Backblaze gagal menghapus berkas.",status:r.status},502);return J({ok:true,key,message:"Berkas dihapus dari penyimpanan."});}
 if(p==="/api/upload"&&req.method==="POST")return await upload(req,e);
 if(p==="/api/so-status"&&req.method==="GET"){const year=url.searchParams.get("year")||String(new Date().getUTCFullYear()),month=url.searchParams.get("month")||String(new Date().getUTCMonth()+1).padStart(2,"0");if(!/^\d{4}$/.test(year)||! /^(0[1-9]|1[0-2])$/.test(month))return J({ok:false,error:"Periode tidak valid."},400);const prefix=`${year}/${month}/`,files=await list(e),norm=v=>String(v||"").replace(/_/g," ").replace(/\s+/g," ").trim().toLowerCase(),sent=new Set(files.filter(f=>String(f.key||"").startsWith(prefix)&&["file_so","file so","fileso"].includes(String(f.reportType||"").trim().toLowerCase())).map(f=>norm(f.branch)));const branches=await getBranches(e);return J({ok:true,year,month,branches:branches.map(branch=>({branch,sent:sent.has(norm(branch))}))});}
 if(p==="/api/inbox"){if(!await adminSessionValid(req,e))return J({ok:false,error:"Admin belum login."},401);let f=await list(e);f.sort((a,b)=>String(b.modified).localeCompare(String(a.modified)));return J({ok:true,files:f});}
 if(p==="/api/download"){const k=url.searchParams.get("key");if(!k||k.includes(".."))return new Response("Bad key",{status:400});const r=await s(e,k,"GET");const h=new Headers(r.headers);for(const[a,b]of Object.entries(H))h.set(a,b);h.set("Cache-Control","no-store");return new Response(r.body,{status:r.status,headers:h});}
}catch(err){return J({ok:false,error:err.message},500)}return e.ASSETS.fetch(req);}};