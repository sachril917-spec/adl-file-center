import { AwsClient } from "aws4fetch";
const BRANCHES=["ADL Talang","ADL Karanganyar","ADL Brebes","ADL Tanglog","ADL Bumiayu","ADL Gumayun","Rizky Pustaka","ADL Kaligelang","ADL Kaliwungu","ADL Weleri","ADL Kedungwuni","ADL Bobotsari","ADL Ketanggungan","ADL Debong","ADL Mejasem","ADL Ajibarang","ADL Bandar","ADL Buaran"];
const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};
const J=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...H,"Content-Type":"application/json;charset=utf-8"}});
const clean=x=>String(x||"").trim().replace(/[^\p{L}\p{N}._ -]+/gu,"_").replace(/\s+/g,"_");
function c(e){return new AwsClient({accessKeyId:e.B2_KEY_ID,secretAccessKey:e.B2_APPLICATION_KEY,service:"s3",region:e.B2_REGION});}
function u(e,k=""){return e.B2_ENDPOINT.replace(/\/+$/,"")+"/"+e.B2_BUCKET+(k?"/"+k.split("/").map(encodeURIComponent).join("/"):"");}
async function s(e,k,method,body,headers={}){return c(e).fetch(u(e,k),{method,headers,body});}
const ADMIN_COOKIE = "__Host-adl_admin";
const ADMIN_SESSION_SECONDS = 8 * 60 * 60;

async function adminMac(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(message)
  );
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function adminPasswordMatches(input, secret) {
  if (typeof input !== "string" ||
      typeof secret !== "string" ||
      !secret || input.length > 1024) return false;

  const digest = async value =>
    new Uint8Array(await crypto.subtle.digest(
      "SHA-256", new TextEncoder().encode(value)
    ));

  const a = await digest(input);
  const b = await digest(secret);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function adminSessionValid(req, env) {
  if (!env.ADMIN_PASSWORD) return false;

  const cookies = req.headers.get("Cookie") || "";
  const item = cookies.split(";").map(x => x.trim())
    .find(x => x.startsWith(ADMIN_COOKIE + "="));

  if (!item) return false;

  const token = item.slice(ADMIN_COOKIE.length + 1);
  const parts = token.split(".");
  if (parts.length !== 2 ||
      !/^\d+$/.test(parts[0]) ||
      !/^[a-f0-9]{64}$/.test(parts[1])) return false;

  const exp = Number(parts[0]);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(exp) || exp <= now ||
      exp > now + ADMIN_SESSION_SECONDS) return false;

  const expected = await adminMac(
    env.ADMIN_PASSWORD, "adl-admin-v1:" + parts[0]
  );

  return await adminPasswordMatches(parts[1], expected);
}

function adminOriginOK(req) {
  return req.headers.get("Origin") === new URL(req.url).origin;
}

function adminCookie(value, maxAge) {
  return ADMIN_COOKIE + "=" + value +
    "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + maxAge;
}

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
if (p === "/api/admin/login" && req.method === "POST") {
  if (!adminOriginOK(req)) {
    return J({ok:false,error:"Origin tidak valid."},403);
  }

  if (!e.ADMIN_PASSWORD) {
    return J({ok:false,error:"ADMIN_PASSWORD belum tersedia."},500);
  }

  let data;
  try {
    data = await req.json();
  } catch {
    return J({ok:false,error:"Data login tidak valid."},400);
  }

  if (!await adminPasswordMatches(
    data.password, e.ADMIN_PASSWORD
  )) {
    return J({ok:false,error:"Kata sandi salah."},401);
  }

  const exp = String(
    Math.floor(Date.now()/1000) + ADMIN_SESSION_SECONDS
  );
  const sig = await adminMac(
    e.ADMIN_PASSWORD, "adl-admin-v1:" + exp
  );

  return new Response(JSON.stringify({
    ok:true, message:"Login admin berhasil."
  }), {
    headers:{
      ...H,
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store",
      "Set-Cookie":adminCookie(exp+"."+sig,ADMIN_SESSION_SECONDS)
    }
  });
}

if (p === "/api/admin/check" && req.method === "GET") {
  const ok = await adminSessionValid(req,e);
  return new Response(JSON.stringify({ok}), {
    headers:{
      ...H,
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store"
    }
  });
}

if (p === "/api/admin/logout" && req.method === "POST") {
  if (!adminOriginOK(req)) {
    return J({ok:false,error:"Origin tidak valid."},403);
  }

  return new Response(JSON.stringify({ok:true}), {
    headers:{
      ...H,
      "Content-Type":"application/json; charset=utf-8",
      "Set-Cookie":adminCookie("",0),
      "Cache-Control":"no-store"
    }
  });
}

  if(p==="/api/upload"&&req.method==="POST")return await upload(req,e);

if (p === "/api/so-status" && req.method === "GET") {
  const url = new URL(req.url);
  const year = url.searchParams.get("year") ||
    String(new Date().getUTCFullYear());
  const month = url.searchParams.get("month") ||
    String(new Date().getUTCMonth() + 1).padStart(2, "0");

  if (!/^\d{4}$/.test(year) ||
      !/^(0[1-9]|1[0-2])$/.test(month)) {
    return J({ok:false,error:"Periode tidak valid."},400);
  }

  const prefix = `${year}/${month}/`;
  const files = await list(e);
  const norm = v => String(v || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const sent = new Set(
    files
      .filter(f =>
        String(f.key || "").startsWith(prefix) &&
        ["file_so", "file so", "fileso"]
          .includes(String(f.reportType || "")
            .trim().toLowerCase())
      )
      .map(f => norm(f.branch))
  );

  return J({
    ok: true,
    year,
    month,
    branches: BRANCHES.map(branch => ({
      branch,
      sent: sent.has(norm(branch))
    }))
  });
}

  if (p === "/api/inbox") {
  if (!(await adminSessionValid(req, e))) {
    return J({
      ok: false,
      error: "Admin belum login."
    }, 401);
  }

  let f = await list(e);
  f.sort((a, b) =>
    String(b.modified).localeCompare(
      String(a.modified)
    )
  );

  return J({ ok: true, files: f });
}
  if(p==="/api/download"){let k=new URL(req.url).searchParams.get("key");if(!k||k.includes(".."))return new Response("Bad key",{status:400});let r=await s(e,k,"GET");let h=new Headers(r.headers);for(let [a,b] of Object.entries(H))h.set(a,b);return new Response(r.body,{status:r.status,headers:h});}
 }catch(err){return J({ok:false,error:err.message},500)}
 return e.ASSETS.fetch(req);
}};