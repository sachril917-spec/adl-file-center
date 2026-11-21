import { AwsClient } from "aws4fetch";
const DEFAULT_BRANCHES=["ADL Talang","ADL Karanganyar","ADL Brebes","ADL Tanglog","ADL Bumiayu","ADL Gumayun","Rizky Pustaka","ADL Kaligelang","ADL Kaliwungu","ADL Weleri","ADL Kedungwuni","ADL Bobotsari","ADL Ketanggungan","ADL Debong","ADL Mejasem","ADL Ajibarang","ADL Bandar","ADL Buaran"];
const BRANCH_CONFIG="__config/branches.json";
const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, X-Monitor-Token"};
const J=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...H,"Content-Type":"application/json;charset=utf-8","Cache-Control":"no-store"}});
const clean=x=>String(x||"").trim().replace(/[^\p{L}\p{N}._ -]+/gu,"_").replace(/\s+/g,"_");
function c(e){return new AwsClient({accessKeyId:e.B2_KEY_ID,secretAccessKey:e.B2_APPLICATION_KEY,service:"s3",region:e.B2_REGION});}
function u(e,k=""){return e.B2_ENDPOINT.replace(/\/+$/,"")+"/"+e.B2_BUCKET+(k?"/"+k.split("/").map(encodeURIComponent).join("/"):"");}
async function s(e,k,method,body,headers={}){return c(e).fetch(u(e,k),{method,headers,body});}
const ADMIN_COOKIE="__Host-adl_admin",ADMIN_SESSION_SECONDS=8*60*60;
const ADMIN_PASSWORD_KEY="__config/admin-password.json";
const ADMIN_PBKDF2_ITERATIONS=210000;
function bytesToHex(bytes){return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,"0")).join("");}
function hexToBytes(hex){if(typeof hex!=="string"||!/^(?:[a-f0-9]{2})+$/i.test(hex))return null;return new Uint8Array(hex.match(/.{2}/g).map(v=>parseInt(v,16)));}
async function adminMac(secret,message){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return bytesToHex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message)));}
async function deriveAdminPassword(password,salt,iterations=ADMIN_PBKDF2_ITERATIONS){const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);return bytesToHex(await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations,hash:"SHA-256"},material,256));}
async function getAdminCredential(env){const r=await s(env,ADMIN_PASSWORD_KEY,"GET");if(r.ok){const d=await r.json();if(d&&d.algorithm==="PBKDF2-SHA256"&&typeof d.salt==="string"&&typeof d.hash==="string"&&Number.isInteger(d.iterations))return {mode:"pbkdf2",...d};throw Error("Data kata sandi admin di Backblaze tidak valid.");}if(r.status===404&&env.ADMIN_PASSWORD)return {mode:"legacy",password:env.ADMIN_PASSWORD};if(r.status===404)return null;throw Error("Gagal membaca kata sandi admin dari Backblaze.");}
async function verifyAdminPassword(input,credential){if(typeof input!=="string"||!credential||input.length>1024)return false;if(credential.mode==="legacy")return input===credential.password;const salt=hexToBytes(credential.salt);if(!salt||!Number.isInteger(credential.iterations)||credential.iterations<100000||credential.iterations>1000000)return false;const actual=hexToBytes(await deriveAdminPassword(input,salt,credential.iterations)),expected=hexToBytes(credential.hash);if(!actual||!expected||actual.length!==expected.length)return false;let diff=0;for(let i=0;i<actual.length;i++)diff|=actual[i]^expected[i];return diff===0;}
async function adminSessionValid(req,env){const cookies=req.headers.get("Cookie")||"",item=cookies.split(";").map(x=>x.trim()).find(x=>x.startsWith(ADMIN_COOKIE+"="));if(!item)return false;const parts=item.slice(ADMIN_COOKIE.length+1).split(".");if(parts.length!==2||!/^\d+$/.test(parts[0])||! /^[a-f0-9]{64}$/.test(parts[1]))return false;const exp=Number(parts[0]),now=Math.floor(Date.now()/1000);if(!Number.isSafeInteger(exp)||exp<=now||exp>now+ADMIN_SESSION_SECONDS)return false;const credential=await getAdminCredential(env);if(!credential)return false;const secret=credential.mode==="pbkdf2"?"adl-pbkdf2:"+credential.hash:credential.password;return parts[1]===await adminMac(secret,"adl-admin-v1:"+parts[0]);}
function adminOriginOK(req){return req.headers.get("Origin")===new URL(req.url).origin;}
function adminCookie(value,maxAge){return ADMIN_COOKIE+"="+value+"; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age="+maxAge;}
async function getBranches(e){try{const r=await s(e,BRANCH_CONFIG,"GET");if(r.ok){const x=await r.json();if(Array.isArray(x.branches)&&x.branches.every(v=>typeof v==="string"))return x.branches;}}catch{}return [...DEFAULT_BRANCHES];}
async function saveBranches(e,branches){return await s(e,BRANCH_CONFIG,"PUT",JSON.stringify({branches,updatedAt:new Date().toISOString()}),{"Content-Type":"application/json"});}
async function upload(req,e){const f=await req.formData(),file=f.get("file"),branch=f.get("branch"),type=f.get("reportType")||"Berkas";if(!(file instanceof File))return J({ok:false,error:"File belum dipilih."},400);const branches=await getBranches(e);if(!branches.includes(branch))return J({ok:false,error:"Cabang tidak valid atau sudah dihapus. Muat ulang aplikasi Cabang."},400);const d=new Date(),y=d.getUTCFullYear(),m=String(d.getUTCMonth()+1).padStart(2,"0");const k=`${y}/${m}/${clean(branch)}/${clean(type)}/${d.toISOString().replace(/[:.]/g,"-")}_${crypto.randomUUID()}_${clean(file.name)}`;const r=await s(e,k,"PUT",file.stream(),{"Content-Type":file.type||"application/octet-stream"});if(!r.ok)return J({ok:false,error:"Upload ke Backblaze gagal.",status:r.status},502);return J({ok:true,key:k,receivedAt:d.toISOString(),message:"Upload berhasil."});}
async function list(e){const r=await s(e,"","GET");if(!r.ok)throw Error("Gagal membaca Backblaze");const x=await r.text(),a=[...x.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)];return a.map(z=>{let q=z[1],t=n=>{let m=q.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`));return m?m[1]:""};let k=t("Key"),p=k.split("/");return{key:k,size:+t("Size")||0,modified:t("LastModified"),branch:(p[2]||"").replace(/_/g," "),reportType:(p[3]||"").replace(/_/g," "),name:p.slice(4).join("/")}}).filter(x=>/^\d{4}\/\d{2}\//.test(x.key));}
function validFileKey(k){return typeof k==="string"&&/^\d{4}\/\d{2}\/[\p{L}\p{N}._ -]+\/[\p{L}\p{N}._ -]+\/.+$/u.test(k)&&!k.includes("..")&&!k.startsWith("__config/");}

const DEVICE_MONITOR_KEY = "__config/device-monitor.json";

function monitorText(v, max = 180) {
  return String(v ?? "").trim().slice(0, max);
}

async function monitorRead(e) {
  const r = await s(e, DEVICE_MONITOR_KEY, "GET");
  if (r.status === 404) return [];
  if (!r.ok) throw Error("Gagal membaca data monitoring.");
  const d = await r.json();
  return Array.isArray(d.devices) ? d.devices : [];
}

async function monitorWrite(e, devices) {
  const r = await s(
    e, DEVICE_MONITOR_KEY, "PUT",
    JSON.stringify({ devices, updatedAt: new Date().toISOString() }),
    { "Content-Type": "application/json" }
  );
  if (!r.ok) throw Error("Gagal menyimpan data monitoring.");
}

function monitorTokenOK(req, e) {
  const a = String(e.MONITOR_TOKEN || "");
  const b = String(req.headers.get("X-Monitor-Token") || "");
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++)
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}


async function monitorGeo(req) {
  const cf = req.cf || {};
  const ip = monitorText(req.headers.get("CF-Connecting-IP"), 80);
  const candidates = [];

  // Cloudflare supplies a first estimate without exposing the IP to the browser.
  if (cf.city || cf.region || cf.country) {
    candidates.push({
      source: "Cloudflare",
      city: monitorText(cf.city, 100),
      region: monitorText(cf.region, 100),
      country: monitorText(cf.country, 80),
      timezone: monitorText(cf.timezone, 80)
    });
  }

  if (ip) {
    const lookups = [
      (async () => {
        const r = await fetch("https://ipwho.is/" + encodeURIComponent(ip), {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(3500)
        });
        if (!r.ok) throw Error("ipwho");
        const d = await r.json();
        if (d.success === false) throw Error("ipwho");
        return {
          source: "IPWho",
          city: monitorText(d.city, 100),
          region: monitorText(d.region, 100),
          country: monitorText(d.country, 80),
          timezone: monitorText(d.timezone?.id, 80)
        };
      })(),
      (async () => {
        const r = await fetch("https://ipapi.co/" + encodeURIComponent(ip) + "/json/", {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(3500)
        });
        if (!r.ok) throw Error("ipapi");
        const d = await r.json();
        if (d.error) throw Error("ipapi");
        return {
          source: "IPAPI",
          city: monitorText(d.city, 100),
          region: monitorText(d.region, 100),
          country: monitorText(d.country_name, 80),
          timezone: monitorText(d.timezone, 80)
        };
      })()
    ];
    const results = await Promise.allSettled(lookups);
    for (const result of results) {
      if (result.status === "fulfilled" &&
          (result.value.city || result.value.region || result.value.country)) {
        candidates.push(result.value);
      }
    }
  }

  const valid = candidates.filter(x => x.city || x.region || x.country);
  const cityKey = x => monitorText(x.city, 100).toLowerCase();
  const cityCounts = new Map();
  for (const item of valid) {
    const key = cityKey(item);
    if (key) cityCounts.set(key, (cityCounts.get(key) || 0) + 1);
  }
  const ranked = [...cityCounts.entries()].sort((a, b) => b[1] - a[1]);
  const winner = ranked[0]?.[0] || "";
  const chosen = valid.find(x => cityKey(x) === winner) || valid[0] || {};
  const agreement = winner ? ranked[0][1] : 0;
  const confidence = agreement >= 2 ? "Tinggi (sumber sepakat)" :
    valid.length >= 2 ? "Rendah (sumber berbeda)" :
    valid.length === 1 ? "Rendah (1 sumber)" : "Tidak tersedia";

  return {
    city: monitorText(chosen.city, 100),
    region: monitorText(chosen.region, 100),
    country: monitorText(chosen.country, 80),
    timezone: monitorText(chosen.timezone, 80),
    confidence,
    sourceCount: valid.length,
    sources: valid.map(x => x.source),
    checkedAt: new Date().toISOString(),
    note: "Perkiraan berdasarkan IP jaringan, bukan posisi GPS. Bisa meleset karena routing/operator/VPN."
  };
}

async function monitorHeartbeat(req, e) {
  let d;
  try { d = await req.json(); }
  catch { return J({ ok: false, error: "Data perangkat tidak valid." }, 400); }

  const deviceId = monitorText(d.deviceId, 100);
const selectedBranch = monitorText(d.branch, 100);

if (!deviceId || d.page !== "cabang")
  return J({ ok: false, error: "Identitas perangkat tidak valid." }, 400);

const branches = await getBranches(e);

if (selectedBranch && !branches.includes(selectedBranch))
  return J({ ok: false, error: "Cabang tidak terdaftar." }, 400);

const branch = selectedBranch || "Belum memilih cabang";

  const now = new Date().toISOString();
  const devices = await monitorRead(e);
  const brand = monitorText(d.brand, 80) || "Tidak diketahui";
  const model = monitorText(d.model, 120) || "Perangkat tidak teridentifikasi";
  const os = monitorText(d.os, 80) || "Tidak diketahui";
  const browser = monitorText(d.browser, 80) || "Tidak diketahui";
  const userAgent = monitorText(d.userAgent, 350);

  // deviceId menjadi identitas utama; fingerprint menyatukan catatan lama
  // saat ID browser perangkat yang sama pernah berubah.
  const fingerprint = x =>
    [x.brand, x.model, x.os, x.browser, x.userAgent]
      .map(v => monitorText(v, 350).toLowerCase())
      .join("|");
  const currentFingerprint = fingerprint({ brand, model, os, browser, userAgent });
  const old = devices.find(x => x.deviceId === deviceId) ||
    devices.find(x => x.userAgent && fingerprint(x) === currentFingerprint);

  const ipLocation = await monitorGeo(req);
  const item = {
    deviceId,
    branch,
    brand,
    model,
    os,
    browser,
    userAgent,
    // Gabungan perkiraan IP dari Cloudflare dan dua layanan geolokasi.
    // IP mentah tidak disimpan di data monitoring.
    ipLocation,
    firstSeen: old?.firstSeen || now,
    lastSeen: now
  };

  const next = devices.filter(x =>
    x.deviceId !== deviceId &&
    (!old || x.deviceId !== old.deviceId) &&
    !(x.userAgent && fingerprint(x) === currentFingerprint) &&
    Date.now() - Date.parse(x.lastSeen || 0) < 90 * 86400000
  );

  next.push(item);
  if (next.length > 500) next.splice(0, next.length - 500);

  await monitorWrite(e, next);
  return J({ ok: true, deviceId, lastSeen: now });
}

async function monitorDevices(req, e) {
  if (!await adminSessionValid(req, e))
  return J({ ok: false, error: "Admin belum login." }, 401);

  const devices = await monitorRead(e);
  devices.sort((a, b) =>
    String(b.lastSeen || "").localeCompare(String(a.lastSeen || ""))
  );

  return J({ ok: true, devices });
}

export default {async fetch(req,e){if(req.method==="OPTIONS")return new Response(null,{status:204,headers:H});const url=new URL(req.url),p=url.pathname;if(p==="/api/health")return J({ok:true,storage:"Backblaze B2"});
try{
 if(p==="/api/monitor/heartbeat"&&req.method==="POST")
   return await monitorHeartbeat(req,e);

 if(p==="/api/monitor/devices"&&req.method==="GET")
   return await monitorDevices(req,e);

 if(p==="/api/branches"&&req.method==="GET")return J({branches:await getBranches(e)});

 
if(p==="/api/daily-motivation"&&req.method==="GET"){
  return J({
    ok:false,
    error:"Motivasi AI sudah dinonaktifkan. Gunakan motivasi pilihan di halaman ADL CABANG."
  },410);
}

 if(p==="/api/admin/login"&&req.method==="POST")
{if(!adminOriginOK(req))return J({ok:false,error:"Origin tidak valid."},403);let credential;try{credential=await getAdminCredential(e)}catch(err){return J({ok:false,error:err.message},502)}if(!credential)return J({ok:false,error:"Kata sandi admin belum dikonfigurasi."},500);let data;try{data=await req.json()}catch{return J({ok:false,error:"Data login tidak valid."},400)}if(!await verifyAdminPassword(data.password,credential))return J({ok:false,error:"Kata sandi salah."},401);const secret=credential.mode==="pbkdf2"?"adl-pbkdf2:"+credential.hash:credential.password;const exp=String(Math.floor(Date.now()/1000)+ADMIN_SESSION_SECONDS),sig=await adminMac(secret,"adl-admin-v1:"+exp);return new Response(JSON.stringify({ok:true,message:"Login admin berhasil."}),{headers:{...H,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Set-Cookie":adminCookie(exp+"."+sig,ADMIN_SESSION_SECONDS)}})}
 if(p==="/api/admin/check"&&req.method==="GET")return J({ok:await adminSessionValid(req,e)});
 if(p==="/api/admin/logout"&&req.method==="POST"){if(!adminOriginOK(req))return J({ok:false,error:"Origin tidak valid."},403);return new Response(JSON.stringify({ok:true}),{headers:{...H,"Content-Type":"application/json; charset=utf-8","Set-Cookie":adminCookie("",0),"Cache-Control":"no-store"}})}
 if(p.startsWith("/api/admin/")&&req.method==="POST"&&!await adminSessionValid(req,e))return J({ok:false,error:"Admin belum login."},401);
 if(p.startsWith("/api/admin/")&&req.method==="POST"&&!adminOriginOK(req))return J({ok:false,error:"Origin tidak valid."},403);
 if(p==="/api/admin/change-password"&&req.method==="POST"){
   let d;try{d=await req.json()}catch{return J({ok:false,error:"Data kata sandi tidak valid."},400)}
   const password=String(d.newPassword||""),confirmation=String(d.confirmPassword||"");
   if(password.length<8||password.length>128)return J({ok:false,error:"Kata sandi baru harus 8–128 karakter."},400);
   if(password!==confirmation)return J({ok:false,error:"Konfirmasi kata sandi tidak sama."},400);
   const salt=crypto.getRandomValues(new Uint8Array(16));const hash=await deriveAdminPassword(password,salt,ADMIN_PBKDF2_ITERATIONS);
   const record={algorithm:"PBKDF2-SHA256",iterations:ADMIN_PBKDF2_ITERATIONS,salt:bytesToHex(salt),hash,updatedAt:new Date().toISOString()};
   const saved=await s(e,ADMIN_PASSWORD_KEY,"PUT",JSON.stringify(record),{"Content-Type":"application/json"});
   if(!saved.ok)return J({ok:false,error:"Gagal menyimpan kata sandi baru ke Backblaze.",status:saved.status},502);
   return new Response(JSON.stringify({ok:true,message:"Kata sandi berhasil diubah. Silakan login kembali."}),{headers:{...H,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Set-Cookie":adminCookie("",0)}});
 }
 if(p==="/api/admin/branches"&&req.method==="POST"){let d;try{d=await req.json()}catch{return J({ok:false,error:"Data tidak valid."},400)}const branches=await getBranches(e),name=String(d.name||"").trim().replace(/\s+/g," ");if(!name||name.length>80||/[<>]/.test(name))return J({ok:false,error:"Nama cabang harus 1–80 karakter."},400);const norm=x=>x.toLocaleLowerCase("id-ID");if(d.action==="add"){if(branches.some(b=>norm(b)===norm(name)))return J({ok:false,error:"Nama cabang sudah ada."},409);if(branches.length>=100)return J({ok:false,error:"Maksimal 100 cabang."},400);branches.push(name);}else if(d.action==="remove"){const i=branches.findIndex(b=>norm(b)===norm(name));if(i<0)return J({ok:false,error:"Cabang tidak ditemukan."},404);branches.splice(i,1);}else return J({ok:false,error:"Aksi tidak valid."},400);const r=await saveBranches(e,branches);if(!r.ok)return J({ok:false,error:"Gagal menyimpan daftar cabang di Backblaze.",status:r.status},502);return J({ok:true,branches,message:d.action==="add"?"Cabang ditambahkan.":"Cabang dihapus dari daftar."});}
 if(p==="/api/admin/delete-file"&&req.method==="POST"){let d;try{d=await req.json()}catch{return J({ok:false,error:"Data tidak valid."},400)}const key=d.key;if(!validFileKey(key))return J({ok:false,error:"Kunci berkas tidak valid."},400);const r=await s(e,key,"DELETE");if(!r.ok&&r.status!==404)return J({ok:false,error:"Backblaze gagal menghapus berkas.",status:r.status},502);return J({ok:true,key,message:"Berkas dihapus dari penyimpanan."});}
 if(p==="/api/upload"&&req.method==="POST")return await upload(req,e);
 if(p==="/api/so-status"&&req.method==="GET"){const year=url.searchParams.get("year")||String(new Date().getUTCFullYear()),month=url.searchParams.get("month")||String(new Date().getUTCMonth()+1).padStart(2,"0");if(!/^\d{4}$/.test(year)||! /^(0[1-9]|1[0-2])$/.test(month))return J({ok:false,error:"Periode tidak valid."},400);const prefix=`${year}/${month}/`,files=await list(e),norm=v=>String(v||"").replace(/_/g," ").replace(/\s+/g," ").trim().toLowerCase(),sent=new Set(files.filter(f=>String(f.key||"").startsWith(prefix)&&["file_so","file so","fileso"].includes(String(f.reportType||"").trim().toLowerCase())).map(f=>norm(f.branch)));const branches=await getBranches(e);return J({ok:true,year,month,branches:branches.map(branch=>({branch,sent:sent.has(norm(branch))}))});}

 if(p==="/api/admin/so-final"&&req.method==="GET"){
  if(!await adminSessionValid(req,e))return J({ok:false,error:"Admin belum login."},401);
  let records=[];
  try{
    const r=await s(e,"__config/so-final-records.json","GET");
    if(r.ok){
      const d=await r.json();
      if(Array.isArray(d.records))records=d.records;
    }
    else if(r.status!==404)return J({ok:false,error:"Gagal membaca data SO Final."},502);
  }catch(err){
    return J({ok:false,error:"Gagal membaca data SO Final: "+err.message},500);
  }
  return J({ok:true,records});
 }

 if(p==="/api/admin/so-final"&&req.method==="POST"){
  let form;
  try{form=await req.formData();}
  catch{return J({ok:false,error:"Form SO Final tidak valid."},400);}

  const branch=String(form.get("branch")||"").trim();
  const start=String(form.get("periodStart")||"");
  const end=String(form.get("periodEnd")||"");
  const note=String(form.get("note")||"").trim();
  const files=form.getAll("files").filter(f=>f instanceof File&&f.size>0);

  if(!branch||!start||!end)return J({ok:false,error:"Cabang dan periode wajib diisi."},400);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(start)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(end)||start>end)
    return J({ok:false,error:"Periode tidak valid."},400);
  if(note.length>3000)return J({ok:false,error:"Catatan maksimal 3000 karakter."},400);
  if(!files.length)return J({ok:false,error:"Pilih minimal satu berkas SO Final."},400);
  if(files.length>10)return J({ok:false,error:"Maksimal 10 berkas sekali unggah."},400);
  if(files.some(f=>f.size>25*1024*1024))return J({ok:false,error:"Ukuran setiap berkas maksimal 25 MB."},400);

  const branches=await getBranches(e);
  if(!branches.includes(branch))return J({ok:false,error:"Cabang tidak ditemukan."},400);

  const now=new Date();
  const year=String(now.getUTCFullYear());
  const month=String(now.getUTCMonth()+1).padStart(2,"0");
  const id=crypto.randomUUID();
  const uploaded=[];

  for(const file of files){
    const key=`${year}/${month}/${clean(branch)}/SO_Final/${now.toISOString().replace(/[:.]/g,"-")}_${crypto.randomUUID()}_${clean(file.name)}`;
    const r=await s(e,key,"PUT",file.stream(),{"Content-Type":file.type||"application/octet-stream"});
    if(!r.ok){
      return J({ok:false,error:"Gagal mengunggah "+file.name+". Berkas yang sudah berhasil diunggah mungkin masih tersimpan.",uploaded},502);
    }
    uploaded.push({key,name:file.name,size:file.size});
  }

  const recordsKey="__config/so-final-records.json";
  let records=[];
  try{
    const r=await s(e,recordsKey,"GET");
    if(r.ok){
      const d=await r.json();
      if(Array.isArray(d.records))records=d.records;
    }else if(r.status!==404)return J({ok:false,error:"Berkas terunggah, tetapi catatan lama gagal dibaca.",uploaded},502);
  }catch{
    return J({ok:false,error:"Berkas terunggah, tetapi catatan lama gagal dibaca.",uploaded},502);
  }

  const record={
    id,branch,periodStart:start,periodEnd:end,note,
    createdAt:now.toISOString(),files:uploaded
  };
  records.unshift(record);

  const saved=await s(e,recordsKey,"PUT",JSON.stringify({records}),{"Content-Type":"application/json"});
  if(!saved.ok)return J({ok:false,error:"Berkas terunggah, tetapi penyimpanan catatan gagal. Jangan unggah ulang sebelum diperiksa.",uploaded},502);

  return J({ok:true,record,message:"SO Final berhasil disimpan."});
 }

 if(p==="/api/inbox"){if(!await adminSessionValid(req,e))return J({ok:false,error:"Admin belum login."},401);let f=await list(e);f.sort((a,b)=>String(b.modified).localeCompare(String(a.modified)));return J({ok:true,files:f});}
 if(p==="/api/download"){const k=url.searchParams.get("key");if(!k||k.includes(".."))return new Response("Bad key",{status:400});const r=await s(e,k,"GET");const h=new Headers(r.headers);for(const[a,b]of Object.entries(H))h.set(a,b);h.set("Cache-Control","no-store");return new Response(r.body,{status:r.status,headers:h});}
}catch(err){return J({ok:false,error:err.message},500)}return e.ASSETS.fetch(req);}};