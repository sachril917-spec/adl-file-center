const express=require("express"),cors=require("cors"),multer=require("multer"),path=require("path"),crypto=require("crypto"),XLSX=require("xlsx"),mammoth=require("mammoth");
const {S3Client,PutObjectCommand,GetObjectCommand,ListObjectsV2Command}=require("@aws-sdk/client-s3");
const app=express(); app.use(cors()); app.use(express.json({limit:"2mb"}));
const PORT=process.env.PORT||10000,B=process.env.B2_BUCKET,E=process.env.B2_ENDPOINT,R=process.env.B2_REGION,K=process.env.B2_KEY_ID,S=process.env.B2_APPLICATION_KEY;
const branches=["ADL Talang","ADL Karanganyar","ADL Brebes","ADL Tanglog","ADL Bumiayu","ADL Gumayun","Rizky Pustaka","ADL Kaligelnag","ADL Kaliwungu","ADL Weleri","ADL Kedungwuni","Toko Foto FC Dicky","ADL Ketanggungan","ADL Debong","ADL Mejasem","ADL Ajibarang","ADL Bandar"];
const up=multer({storage:multer.memoryStorage(),limits:{fileSize:100*1024*1024}});
const s3=(E&&R&&K&&S)?new S3Client({endpoint:E,region:R,credentials:{accessKeyId:K,secretAccessKey:S},forcePathStyle:true}):null;
const safe=x=>String(x||"").replace(/[\/\\:*?"<>|]/g,"-").replace(/\s+/g," ").trim();
const parts=()=>{let d=new Date();return{y:d.getFullYear(),m:String(d.getMonth()+1).padStart(2,"0"),t:d.toLocaleString("id-ID")}};
const ok=(res)=>{if(!s3||!B){res.status(500).json({ok:false,error:"B2 belum dikonfigurasi."});return false}return true};
async function put(Key,Body,ContentType){return s3.send(new PutObjectCommand({Bucket:B,Key,Body,ContentType:ContentType||"application/octet-stream"}))}
async function get(Key){let r=await s3.send(new GetObjectCommand({Bucket:B,Key}));return Buffer.from(await r.Body.transformToByteArray())}
async function all(){let a=[],t;do{let r=await s3.send(new ListObjectsV2Command({Bucket:B,ContinuationToken:t}));a.push(...(r.Contents||[]));t=r.IsTruncated?r.NextContinuationToken:undefined}while(t);return a}
async function parse(f){let e=path.extname(f.originalname).toLowerCase();try{
 if([".xlsx",".xls",".csv"].includes(e)){let w=XLSX.read(f.buffer,{type:"buffer"}),s=w.SheetNames.map(n=>({name:n,rows:XLSX.utils.sheet_to_json(w.Sheets[n],{header:1,defval:""}).slice(0,200)}));return{parsed:true,sheets:s}}
 if(e===".docx"){let r=await mammoth.extractRawText({buffer:f.buffer});return{parsed:true,text:(r.value||"").slice(0,30000)}}
 return{parsed:false,message:"File tersimpan; pembacaan otomatis format ini belum diaktifkan."}
}catch(e){return{parsed:false,error:String(e.message||e)}}}
app.get("/api/health",(q,r)=>r.json({ok:true,b2Configured:!!s3}));
app.get("/api/branches",(q,r)=>r.json({ok:true,branches}));
app.post("/api/upload",up.single("file"),async(q,r)=>{if(!ok(r))return;if(!q.file)return r.status(400).json({ok:false,error:"Pilih file."});
let br=branches.includes(q.body.branch)?q.body.branch:"";if(!br)return r.status(400).json({ok:false,error:"Cabang tidak valid."});
let p=parts(),id=crypto.randomUUID(),key=`${p.y}/${p.m}/${safe(br)}/${safe(q.body.reportType||"Berkas")}/${id}_${safe(q.file.originalname)}`;
try{await put(key,q.file.buffer,q.file.mimetype);let meta={id,key,branch:br,reportType:q.body.reportType||"Berkas",originalName:q.file.originalname,size:q.file.size,mime:q.file.mimetype,receivedAt:p.t,status:"tersimpan"};r.json({ok:true,file:meta});
parse(q.file).then(x=>put(key+".adlmeta.json",Buffer.from(JSON.stringify({...meta,...x,status:"selesai"})),"application/json")).catch(()=>{});}catch(e){r.status(500).json({ok:false,error:String(e.message||e)})}});
app.get("/api/inbox",async(q,r)=>{if(!ok(r))return;try{let o=await all(),ms=new Map();for(let x of o.filter(x=>x.Key.endsWith(".adlmeta.json"))){try{ms.set(x.Key.slice(0,-13),JSON.parse((await get(x.Key)).toString()))}catch{}}let f=o.filter(x=>!x.Key.endsWith(".adlmeta.json")).map(x=>ms.get(x.Key)||{key:x.Key,originalName:x.Key.split("/").pop(),size:x.Size,receivedAt:x.LastModified,branch:x.Key.split("/")[2]});r.json({ok:true,files:f.sort((a,b)=>String(b.receivedAt).localeCompare(String(a.receivedAt)))})}catch(e){r.status(500).json({ok:false,error:String(e.message||e)})}});
app.get("/api/download",async(q,r)=>{if(!ok(r))return;let key=String(q.query.key||"");if(!key||key.includes(".."))return r.status(400).send("Key tidak valid");try{let x=await s3.send(new GetObjectCommand({Bucket:B,Key:key}));r.setHeader("Content-Type",x.ContentType||"application/octet-stream");r.setHeader("Content-Disposition",`attachment; filename*=UTF-8''${encodeURIComponent(key.split("/").pop().replace(/^[0-9a-f-]{36}_/,""))}`);x.Body.pipe(r)}catch{r.status(404).send("File tidak ditemukan")}});
app.use("/cabang",express.static(path.join(__dirname,"public/cabang")));app.use("/pusat",express.static(path.join(__dirname,"public/pusat")));app.use(express.static(path.join(__dirname,"public")));app.get("*",(q,r)=>r.sendFile(path.join(__dirname,"public/index.html")));app.listen(PORT,"0.0.0.0",()=>console.log("ADL running "+PORT));