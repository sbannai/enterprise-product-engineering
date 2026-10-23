export interface ReportQuery { tenantId:string; filters?:Record<string,unknown>; cursor?:string; pageSize?:number; }
export interface ReportResult<T>{data:T[];nextCursor?:string;freshness?:string;}

export type ReportFormat = "json" | "csv" | "html";
export interface ReportColumn { key: string; label: string; }
export interface ReportDocument {
  tenantId: string; reportId: string; title: string; generatedAt: string;
  sourceRequirementIds: readonly string[]; columns: readonly ReportColumn[];
  rows: readonly Record<string, unknown>[];
}
export interface ReportTheme {
  organizationName: string; logoUrl?: string; primaryColor: string; accentColor: string;
  textColor: string; backgroundColor: string; fontFamily: string; footerText?: string;
}
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SAFE_FONT = /^[A-Za-z0-9 ,'-]{1,80}$/;
function validateTheme(theme: ReportTheme): void {
  if (!theme.organizationName.trim()) throw new Error("REPORT_THEME_ORGANIZATION_REQUIRED");
  if (![theme.primaryColor,theme.accentColor,theme.textColor,theme.backgroundColor].every(color=>HEX_COLOR.test(color))) throw new Error("REPORT_THEME_COLOR_INVALID");
  if (!SAFE_FONT.test(theme.fontFamily)) throw new Error("REPORT_THEME_FONT_INVALID");
  if (theme.logoUrl && (!/^https:\/\//i.test(theme.logoUrl) || /[\r\n]/.test(theme.logoUrl))) throw new Error("REPORT_THEME_LOGO_URL_INVALID");
}
function assertDocument(d: ReportDocument): void {
  if (!d.tenantId.trim() || !d.reportId.trim() || !d.title.trim()) throw new Error("REPORT_DOCUMENT_CONTEXT_REQUIRED");
  if (!Number.isFinite(Date.parse(d.generatedAt))) throw new Error("REPORT_GENERATED_AT_INVALID");
  if (!d.sourceRequirementIds.length || d.sourceRequirementIds.some(id => typeof id !== "string" || !id.trim())) throw new Error("REPORT_PROVENANCE_REQUIRED");
  if (!d.columns.length) throw new Error("REPORT_COLUMNS_REQUIRED");
  const keys=new Set<string>();
  for (const c of d.columns) { if (!c.key.trim() || !c.label.trim() || keys.has(c.key)) throw new Error("REPORT_COLUMNS_INVALID"); keys.add(c.key); }
  if (d.rows.some(r=>!r || typeof r!=="object" || Array.isArray(r))) throw new Error("REPORT_ROWS_INVALID");
}
function cell(v: unknown): string { if(v===null||v===undefined)return ""; if(typeof v==="object")return JSON.stringify(v); return String(v); }
function csvCell(v: unknown): string {
  let s=cell(v);
  // Preserve real numeric negatives as numbers in spreadsheet imports; guard string cells that could be formulas.
  if (typeof v !== "number" && /^[\s\u0000-\u001f]*[=+@-]/.test(s)) s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
function htmlEscape(v: unknown): string { return cell(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }

/** Deterministic JSON, spreadsheet-safe CSV, and tenant-branded HTML reports. */
export function generateReport(d: ReportDocument, format: ReportFormat, theme?: ReportTheme): string {
  assertDocument(d);
  if (!["json","csv","html"].includes(format)) throw new Error("REPORT_FORMAT_UNSUPPORTED");
  if (format==="json") return JSON.stringify({tenantId:d.tenantId,reportId:d.reportId,title:d.title,generatedAt:d.generatedAt,sourceRequirementIds:[...d.sourceRequirementIds],columns:d.columns,rows:d.rows.map(r=>Object.fromEntries(d.columns.filter(c=>Object.prototype.hasOwnProperty.call(r,c.key)).map(c=>[c.key,r[c.key]])))},null,2);
  if (format==="csv") return [d.columns.map(c=>csvCell(c.label)).join(","),...d.rows.map(r=>d.columns.map(c=>csvCell(r[c.key])).join(","))].join("\r\n")+"\r\n";
  if (!theme) throw new Error("REPORT_THEME_REQUIRED");
  validateTheme(theme);
  const logo=theme.logoUrl?'<img class="logo" src="'+htmlEscape(theme.logoUrl)+'" alt="'+htmlEscape(theme.organizationName)+' logo">':"";
  const headers=d.columns.map(c=>'<th scope="col">'+htmlEscape(c.label)+"</th>").join("");
  const rows=d.rows.map(r=>"<tr>"+d.columns.map(c=>"<td>"+htmlEscape(r[c.key])+"</td>").join("")+"</tr>").join("");
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+htmlEscape(d.title)+'</title><style>:root{--primary:'+theme.primaryColor+';--accent:'+theme.accentColor+';--text:'+theme.textColor+';--background:'+theme.backgroundColor+'}body{font-family:'+theme.fontFamily+',sans-serif;color:var(--text);background:var(--background);margin:2rem}header{border-bottom:4px solid var(--primary);padding-bottom:1rem;display:flex;align-items:center;gap:1rem}.logo{max-width:160px;max-height:64px;object-fit:contain}h1{color:var(--primary)}table{border-collapse:collapse;width:100%;margin-top:1.5rem}th{background:var(--primary);color:#fff;text-align:left}th,td{padding:.65rem;border:1px solid #d7dce2;overflow-wrap:anywhere}tbody tr:nth-child(even){background:var(--accent)}footer{margin-top:2rem;border-top:1px solid #d7dce2;padding-top:1rem}</style></head><body><header>'+logo+'<div>'+htmlEscape(theme.organizationName)+'<h1>'+htmlEscape(d.title)+'</h1></div></header><p>Report ID: '+htmlEscape(d.reportId)+' · Tenant: '+htmlEscape(d.tenantId)+' · Generated: '+htmlEscape(d.generatedAt)+'</p><table><thead><tr>'+headers+'</tr></thead><tbody>'+rows+'</tbody></table><p>Source requirements: '+d.sourceRequirementIds.map(htmlEscape).join(", ")+'</p><footer>'+htmlEscape(theme.footerText??"")+'</footer></body></html>';
}
