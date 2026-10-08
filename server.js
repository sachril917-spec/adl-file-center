import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import mammoth from "mammoth";
import {fileURLToPath} from "url";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=process.env.PORT||3000;
const DATA_DIR=process.env.DATA_DIR||path.join(__dirname,"data");
const TMP=path.join(DATA_DIR,"tmp");
fs.mkdirSync(TMP,{recursive:true});

const app=express();
app.use(cors());
app.use(express.json({limit:"1mb"}));
const upload=multer({dest:TMP});

const BRANCHES=["ADL Talang","ADL Karanganyar","ADL Brebes","ADL Tanglog","ADL Bumiayu","ADL Gumayun","Rizky Pustaka","ADL Kaligelnag","ADL Kaliwungu","ADL Weleri","ADL Kedungwuni","Toko Foto FC Dicky","ADL Ketanggungan","ADL Debong","ADL Mejasem","ADL Ajibarang","ADL Bandar"];
const DB=path.join(DATA_DIR,"db.json");
const readDB=()=>fs.existsSync(DB)?JSON.parse(fs.readFileSync(DB,"utf8")):[];
const writeDB=x=>fs.writeFileSync(DB,JSON.stringify(x,null,2));

function parseMoney(line){
  const matches=[...line.matchAll(/(?:Rp\.?\s*)?(\d{1,3}(?:[.\s]\d{3})+|\d+)/gi)];
  return matches.length?Number(matches[matches.length-1][1].replace(/[.\s]/g,"")):0;
}
function parseText(text){
  const r={akhir:0,minus:0,plus:0,lines:[],status:"Selesai"};
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim(), z=line.toLowerCase(), n=parseMoney(line);
    if(!line||!n) continue;
    if(/total\s*(rp\.?\s*)?akhir|total akhir|grand total/.test(z)) r.akhir+=n;
    else if(/minus|kurang/.test(z)) r.minus+=n;
    else if(/plus|lebih/.test(z)) r.plus+=n;
    if(/akhir|minus|kurang|plus|lebih|selisih|total/.test(z)) r.lines.push(line);
  }
  return r;
}
async function parseFile(filePath,originalName){
  const ext=path.extname(originalName).toLowerCase();
  if([".xlsx",".xls"].includes(ext)){
    const wb=XLSX.readFile(filePath); let text="";
    for(const s of wb.SheetNames) text+=XLSX.utils.sheet_to_csv(wb.Sheets[s])+"\n";
    return parseText(text);
  }
  if(ext===".docx"){
    const text=(await mammoth.extractRawText({path:filePath})).value;
    return parseText(text);
  }
  return {akhir:0,minus:0,plus:0,lines:[],status:"File tersimpan; pembacaan format ini belum aktif"};
}

app.get("/api/health",(req,res)=>res.json({ok:true,branches:BRANCHES.length}));
app.get("/api/branches",(req,res)=>res.json(BRANCHES));

app.post("/api/upload",upload.single("file"),(req,res)=>{
  if(!req.file||!req.body.branch) return res.status(400).json({error:"Cabang dan file wajib diisi"});
  const now=new Date(), year=now.getFullYear(), month=String(now.getMonth()+1).padStart(2,"0");
  const branch=req.body.branch;
  if(!BRANCHES.includes(branch)) return res.status(400).json({error:"Cabang tidak terdaftar"});
  const dir=path.join(DATA_DIR,String(year),month,branch);
  fs.mkdirSync(dir,{recursive:true});
  const safe=req.file.originalname.replace(/[^a-zA-Z0-9._ -]/g,"_");
  const dest=path.join(dir,`${Date.now()}_${safe}`);
  fs.renameSync(req.file.path,dest);
  const item={
    id:Date.now().toString(36)+Math.random().toString(36).slice(2,8),
    branch, report:req.body.report||"", originalName:req.file.originalname,
    file:path.relative(DATA_DIR,dest), received:now.toISOString(), year, month,
    parsed:{akhir:0,minus:0,plus:0,lines:[],status:"Sedang membaca..."}
  };
  const db=readDB(); db.unshift(item); writeDB(db);
  res.status(201).json(item);

  // Pembacaan dilakukan setelah upload berhasil, sehingga cabang tidak menunggu.
  setImmediate(async()=>{
    try{
      const parsed=await parseFile(dest,item.originalName);
      const latest=readDB(),i=latest.findIndex(x=>x.id===item.id);
      if(i>=0){latest[i].parsed=parsed;writeDB(latest);}
    }catch(e){
      const latest=readDB(),i=latest.findIndex(x=>x.id===item.id);
      if(i>=0){latest[i].parsed={akhir:0,minus:0,plus:0,lines:[],status:"Gagal membaca: "+e.message};writeDB(latest);}
    }
  });
});

app.get("/api/inbox",(req,res)=>{
  let db=readDB();
  if(req.query.month) db=db.filter(x=>`${x.year}-${x.month}`===req.query.month);
  res.json(db);
});
app.get("/api/download/:id",(req,res)=>{
  const item=readDB().find(x=>x.id===req.params.id);
  if(!item)return res.sendStatus(404);
  res.download(path.join(DATA_DIR,item.file),item.originalName);
});

app.use(express.static(path.join(__dirname,"public")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));
app.listen(PORT,()=>console.log(`ADL File Center running on ${PORT}`));
