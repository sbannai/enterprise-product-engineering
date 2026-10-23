import assert from "node:assert/strict";
import test from "node:test";
import {generatePdfReport} from "../dist/packages/reporting/pdf.js";

const base={tenantId:"tenant-a",reportId:"payments-summary",title:"Payment Summary",generatedAt:"2026-10-23T00:00:00.000Z",sourceRequirementIds:["REQ-46306","REQ-46307"],columns:[{key:"reference",label:"Reference"},{key:"amount",label:"Amount"},{key:"note",label:"Description"}],rows:[{reference:"TXN-001",amount:-42,note:"Refund processed"}]};
const theme={organizationName:"Café Example",logoUrl:"https://assets.example.test/logo.svg",primaryColor:"#123456",accentColor:"#eef3f8",textColor:"#172033",backgroundColor:"#ffffff",fontFamily:"Arial",footerText:"Confidential — €"};

function pdfText(bytes){return new TextDecoder("latin1").decode(bytes);}
function hexAscii(s){return Array.from(s).map(c=>c.charCodeAt(0).toString(16).padStart(2,"0")).join("").toUpperCase();}\nfunction assertPdfXref(pdf){\n  const start=Number(pdf.match(/startxref\\n(\\d+)\\n%%EOF/)?.[1]);\n  assert.ok(Number.isFinite(start)&&pdf.slice(start,start+5)==="xref\\n","xref offset must point to xref table");\n  const xref=pdf.slice(start).split("\\n");\n  const count=Number(xref[1].split(" ")[1]);\n  for(let i=1;i<count;i++){const offset=Number(xref[i+2].slice(0,10));assert.ok(pdf.slice(offset).startsWith(i+" 0 obj\\n"),"xref entry must point to its object");}\n}

test("creates a valid deterministic PDF with tenant theme, provenance and supported Unicode",()=>{
  const a=generatePdfReport(base,theme), b=generatePdfReport(base,theme);
  assert.deepEqual(a,b);
  const pdf=pdfText(a);
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.match(pdf,/startxref\n\d+\n%%EOF/);
  assert.match(pdf,/\/Type \/Catalog/);
  assert.match(pdf,/\/Type \/Page\b/);
  assert.ok(pdf.includes(hexAscii("Café Example")));
  assert.ok(pdf.includes(hexAscii("Confidential — €")));
  assert.ok(pdf.includes(hexAscii("REQ-46306")));
  assert.ok(pdf.includes(hexAscii("TXN-001")));
  assert.ok(pdf.includes("0.071 0.204 0.337"));
});

test("paginates large reports, repeats headers and retains long cell content",()=>{
  const long="LONG-CELL-START "+("résumé ".repeat(120))+" LONG-CELL-END";
  const large={...base,rows:Array.from({length:90},(_,i)=>({reference:"TXN-"+String(i).padStart(3,"0"),amount:i,note:i===42?long:"Regular row "+i}))};
  const pdf=pdfText(generatePdfReport(large,theme));
  const pages=(pdf.match(/\/Type \/Page\b/g)||[]).length;
  assert.ok(pages>1,"expected multi-page output");
  assert.ok(pdf.includes(hexAscii("Reference")),"table header should be repeated in page streams");
  assert.ok(pdf.includes(hexAscii("LONG-CELL-START")));
  assert.ok(pdf.includes(hexAscii("LONG-CELL-END")));
  assert.ok(pdf.includes(hexAscii("TXN-089")));\n  assert.ok((pdf.match(new RegExp(hexAscii("Reference"),"g"))||[]).length>=pages,"header must repeat on each page");\n  assert.ok((pdf.match(/Page [0-9]+ of [0-9]+/g)||[]).length===0,"page labels are encoded as PDF text hex");\n  assertPdfXref(pdf);
});

test("supports empty reports and landscape layout for wide tables",()=>{
  const empty={...base,rows:[]};
  const pdf=pdfText(generatePdfReport(empty,theme));
  assert.ok(pdf.includes(hexAscii("No records match the selected report filters.")));
  const wide={...base,columns:Array.from({length:8},(_,i)=>({key:"c"+i,label:"Column "+i})),rows:[Object.fromEntries(Array.from({length:8},(_,i)=>["c"+i,"value "+i]))]};
  const landscape=pdfText(generatePdfReport(wide,theme));
  assert.match(landscape,/\/MediaBox \[0 0 842 595\]/);
});

test("rejects unsafe theme and unsupported glyphs without fetching remote assets",()=>{
  assert.throws(()=>generatePdfReport(base,{...theme,primaryColor:"red"}),/REPORT_THEME_COLOR_INVALID/);
  assert.throws(()=>generatePdfReport(base,{...theme,logoUrl:"javascript:alert(1)"}),/REPORT_THEME_LOGO_URL_INVALID/);
  assert.throws(()=>generatePdfReport({...base,title:"Payment 😀 Summary"},theme),/REPORT_PDF_UNSUPPORTED_CHARACTER/);
});
