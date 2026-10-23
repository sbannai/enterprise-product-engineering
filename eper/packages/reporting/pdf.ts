import type { ReportDocument, ReportTheme } from "./index.js";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SAFE_FONT = /^[A-Za-z0-9 ,'-]{1,80}$/;
const CP1252_SPECIAL: Record<string, number> = {
  "€":0x80,"‚":0x82,"ƒ":0x83,"„":0x84,"…":0x85,"†":0x86,"‡":0x87,"ˆ":0x88,"‰":0x89,
  "Š":0x8a,"‹":0x8b,"Œ":0x8c,"Ž":0x8e,"‘":0x91,"’":0x92,"“":0x93,"”":0x94,"•":0x95,
  "–":0x96,"—":0x97,"˜":0x98,"™":0x99,"š":0x9a,"›":0x9b,"œ":0x9c,"ž":0x9e,"Ÿ":0x9f
};

function validate(d: ReportDocument, t: ReportTheme): void {
  if (!d.tenantId.trim() || !d.reportId.trim() || !d.title.trim()) throw new Error("REPORT_DOCUMENT_CONTEXT_REQUIRED");
  if (!Number.isFinite(Date.parse(d.generatedAt))) throw new Error("REPORT_GENERATED_AT_INVALID");
  if (!d.sourceRequirementIds.length || d.sourceRequirementIds.some(x => typeof x !== "string" || !x.trim())) throw new Error("REPORT_PROVENANCE_REQUIRED");
  if (!d.columns.length) throw new Error("REPORT_COLUMNS_REQUIRED");
  const keys = new Set<string>();
  for (const c of d.columns) {
    if (!c.key.trim() || !c.label.trim() || keys.has(c.key)) throw new Error("REPORT_COLUMNS_INVALID");
    keys.add(c.key);
  }
  if (d.rows.some(r => !r || typeof r !== "object" || Array.isArray(r))) throw new Error("REPORT_ROWS_INVALID");
  if (!t.organizationName.trim()) throw new Error("REPORT_THEME_ORGANIZATION_REQUIRED");
  if (![t.primaryColor,t.accentColor,t.textColor,t.backgroundColor].every(c => HEX_COLOR.test(c))) throw new Error("REPORT_THEME_COLOR_INVALID");
  if (!SAFE_FONT.test(t.fontFamily)) throw new Error("REPORT_THEME_FONT_INVALID");
  // Remote logos are intentionally not fetched by the PDF renderer; use a controlled asset pipeline.
  if (t.logoUrl && (!/^https:\/\//i.test(t.logoUrl) || /[\r\n]/.test(t.logoUrl))) throw new Error("REPORT_THEME_LOGO_URL_INVALID");
}
function color(hex: string): string {
  const h = hex.slice(1);
  return [0,2,4].map(i => (parseInt(h.slice(i,i+2),16)/255).toFixed(3)).join(" ");
}
function pdfHex(value: string): string {
  const bytes: number[] = [];
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    let b: number | undefined;
    if (cp >= 0x20 && cp <= 0x7e) b = cp;
    else if (cp >= 0xa0 && cp <= 0xff) b = cp;
    else b = CP1252_SPECIAL[ch];
    if (b === undefined) throw new Error("REPORT_PDF_UNSUPPORTED_CHARACTER");
    bytes.push(b);
  }
  return "<" + bytes.map(b => b.toString(16).padStart(2,"0")).join("").toUpperCase() + ">";
}
function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function wrap(value: string, max: number): string[] {
  const result: string[] = [];
  for (const paragraph of value.replace(/\r/g,"").split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { result.push(""); continue; }
    let line = "";
    for (const word of words) {
      if (word.length > max) {
        if (line) { result.push(line); line = ""; }
        for (let i=0;i<word.length;i+=max) result.push(word.slice(i,i+max));
      } else if (!line) line = word;
      else if ((line+" "+word).length <= max) line += " "+word;
      else { result.push(line); line = word; }
    }
    if (line) result.push(line);
  }
  return result.length ? result : [""];
}
function rect(x:number,y:number,w:number,h:number,fill:string):string {
  return fill+" rg "+x.toFixed(2)+" "+y.toFixed(2)+" "+w.toFixed(2)+" "+h.toFixed(2)+" re f\n";
}
function drawText(x:number,y:number,value:string,size:number,fill:string,bold=false):string {
  if (!value) return "";
  return fill+" rg BT /"+(bold?"F2":"F1")+" "+size+" Tf 1 0 0 1 "+x.toFixed(2)+" "+y.toFixed(2)+" Tm "+pdfHex(value)+" Tj ET\n";
}
interface Page { content: string; }
function makePage(d:ReportDocument,t:ReportTheme,pageNo:number,pageTotal:number,landscape:boolean):Page {
  const width=landscape?842:595, height=landscape?595:842, margin=34, usable=width-margin*2;
  const colW=usable/d.columns.length;
  const commands:string[]=[];
  let y=height-42;
  commands.push(rect(0,height-8,width,8,color(t.primaryColor)));
  const initials=t.organizationName.trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase();
  commands.push(rect(margin,y-2,30,30,color(t.primaryColor)));
  commands.push(drawText(margin+6,y+9,initials,10,"1 1 1",true));
  commands.push(drawText(margin+40,y+12,t.organizationName,11,color(t.textColor),true));
  commands.push(drawText(margin+40,y-4,d.title,15,color(t.primaryColor),true));
  y-=42;
  commands.push(drawText(margin,y,d.reportId+"  |  Tenant: "+d.tenantId+"  |  Generated: "+d.generatedAt,7,color(t.textColor)));
  y-=15;
  const headers=d.columns.map(c=>wrap(c.label,Math.max(5,Math.floor((colW-10)/4.3))));
  const headerLines=Math.max(...headers.map(a=>a.length));
  const hh=Math.max(22,headerLines*10+8);
  commands.push(rect(margin,y-hh,usable,hh,color(t.primaryColor)));
  let x=margin;
  for(let i=0;i<headers.length;i++){
    headers[i].forEach((line,j)=>commands.push(drawText(x+4,y-14-j*10,line,7,"1 1 1",true)));
    x+=colW;
  }
  y-=hh;
  const bottom=58;
  let rowIndex=0;
  const firstRow=pageNo===1?0:0;
  if(d.rows.length===0){
    commands.push(drawText(margin+4,y-16,"No records match the selected report filters.",8,color(t.textColor)));
    y-=28;
  } else {
    // The caller supplies rows for this page; each page repeats the same table header.
    const rows=(d as ReportDocument & {__pageRows?: readonly Record<string,unknown>[]}).__pageRows ?? d.rows;
    for(const row of rows){
      const wrapped=d.columns.map(c=>wrap(text(row[c.key]),Math.max(5,Math.floor((colW-10)/4.2))));
      const maxLines=Math.max(1,...wrapped.map(a=>a.length));
      const rh=Math.max(18,maxLines*9+8);
      if(y-rh<bottom) break;
      if(rowIndex%2===1) commands.push(rect(margin,y-rh,usable,rh,color(t.accentColor)));
      x=margin;
      for(let i=0;i<wrapped.length;i++){
        wrapped[i].forEach((line,j)=>commands.push(drawText(x+4,y-12-j*9,line,7,color(t.textColor))));
        x+=colW;
      }
      commands.push("0.82 0.84 0.87 RG 0.35 w "+margin.toFixed(2)+" "+(y-rh).toFixed(2)+" m "+(margin+usable).toFixed(2)+" "+(y-rh).toFixed(2)+" l S\n");
      y-=rh; rowIndex++;
    }
  }
  // Provenance is printed on every page so extracted pages remain auditable.
  const provenance=wrap("Source requirements: "+d.sourceRequirementIds.join(", "),Math.max(40,Math.floor(usable/4.2)));
  let py=42;
  for(const line of provenance.slice(0,2)){commands.push(drawText(margin,py,line,6,color(t.textColor)));py-=8;}
  commands.push("0.75 0.77 0.80 RG 0.5 w "+margin+" 34 m "+(width-margin)+" 34 l S\n");
  commands.push(drawText(margin,20,t.footerText??"Confidential",7,color(t.textColor)));
  commands.push(drawText(width-margin-60,20,"Page "+pageNo+" of "+pageTotal,7,color(t.textColor)));
  return {content:commands.join("")};
}
function buildPdf(pages:Page[],landscape:boolean,fontFamily:string):Uint8Array {
  const objects:string[]=[];
  const add=(value:string)=>{objects.push(value);return objects.length;};
  const catalogId=add("");
  const pagesId=add("");
  const fontId=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const boldId=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pageIds:number[]=[];
  const w=landscape?842:595,h=landscape?595:842;
  for(const page of pages){
    const stream=page.content;
    const contentId=add("<< /Length "+stream.length+" >>\nstream\n"+stream+"endstream");
    const pageId=add("<< /Type /Page /Parent "+pagesId+" 0 R /MediaBox [0 0 "+w+" "+h+"] /Resources << /Font << /F1 "+fontId+" 0 R /F2 "+boldId+" 0 R >> >> /Contents "+contentId+" 0 R >>");
    pageIds.push(pageId);
  }
  objects[catalogId-1]="<< /Type /Catalog /Pages "+pagesId+" 0 R >>";
  objects[pagesId-1]="<< /Type /Pages /Kids ["+pageIds.map(id=>id+" 0 R").join(" ")+"] /Count "+pageIds.length+" >>";
  let pdf="%PDF-1.4\n%EPER deterministic report\n";
  const offsets=[0];
  for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=(i+1)+" 0 obj\n"+objects[i]+"\nendobj\n";}
  const xref=pdf.length;
  pdf+="xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n";
  for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
  pdf+="trailer\n<< /Size "+(objects.length+1)+" /Root "+catalogId+" 0 R >>\nstartxref\n"+xref+"\n%%EOF\n";
  return Uint8Array.from(pdf, c=>c.charCodeAt(0)&255);
}

function splitLongRows(d:ReportDocument,maxChars:number,maxLinesPerSegment=24):Record<string,unknown>[] {
  const expanded:Record<string,unknown>[]=[];
  for(const row of d.rows){
    const wrapped=d.columns.map(col=>wrap(text(row[col.key]),maxChars));
    const segments=Math.max(1,...wrapped.map(lines=>Math.ceil(lines.length/maxLinesPerSegment)));
    for(let segment=0;segment<segments;segment++){
      const part:Record<string,unknown>={};
      for(let i=0;i<d.columns.length;i++) part[d.columns[i].key]=wrapped[i].slice(segment*maxLinesPerSegment,(segment+1)*maxLinesPerSegment).join("\\n");
      expanded.push(part);
    }
  }
  return expanded;
}

/** Build a deterministic, tenant-themed PDF without network access or remote asset fetching. */
export function generatePdfReport(d:ReportDocument,t:ReportTheme):Uint8Array {
  validate(d,t);
  const landscape=d.columns.length>=5;
  const width=landscape?842:595,height=landscape?595:842,margin=34,usable=width-margin*2,colW=usable/d.columns.length;
  const bottom=58;
  const headerLines=Math.max(1,...d.columns.map(c=>wrap(c.label,Math.max(5,Math.floor((colW-10)/4.3))).length));
  const headerHeight=Math.max(22,headerLines*10+8);
  const firstPageCapacity=height-42-42-15-headerHeight-bottom;
  const rowPages:Record<string,unknown>[][]=[[]];
  let used=0;
  for(const row of d.rows){
    const maxLines=Math.max(1,...d.columns.map(c=>wrap(text(row[c.key]),Math.max(5,Math.floor((colW-10)/4.2))).length));
    const rh=Math.max(18,maxLines*9+8);
    if(used+rh>firstPageCapacity && rowPages[rowPages.length-1].length){rowPages.push([]);used=0;}
    rowPages[rowPages.length-1].push(row);used+=rh;
  }
  const total=rowPages.length;
  const pages=rowPages.map((rows,i)=>makePage({...d,__pageRows:rows},t,i+1,total,landscape));
  return buildPdf(pages,landscape,t.fontFamily);
}
