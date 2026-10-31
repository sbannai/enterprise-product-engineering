export type AppearanceMode = "light" | "dark" | "system";

/** EPER approved product-wide default; tenant branding can override only through validated configuration. */
export const EPER_DEFAULT_THEME = Object.freeze({
 themeId:"teal-horizon",name:"Teal Horizon",appearance:"light" as const,
 primaryColor:"#167C80",navigationColor:"#123F43",navigationActiveColor:"#1B6265",
 accentColor:"#45B5A8",surfaceColor:"#FFFFFF",backgroundColor:"#F6FAF9",
 textColor:"#183638",mutedTextColor:"#607879",borderColor:"#DCE9E6",focusColor:"#45B5A8",
});
export const EPER_THEME_PRESETS = Object.freeze([
 {themeId:"teal-horizon",name:"Teal Horizon",primaryColor:"#167C80",navigationColor:"#123F43",accentColor:"#45B5A8",surfaceColor:"#FFFFFF",backgroundColor:"#F6FAF9"},
 {themeId:"emerald-executive",name:"Emerald Executive",primaryColor:"#35A477",navigationColor:"#123D32",accentColor:"#35A477",surfaceColor:"#FFFFFF",backgroundColor:"#F7FAF8"},
 {themeId:"royal-plum",name:"Royal Plum",primaryColor:"#9B70AE",navigationColor:"#382044",accentColor:"#B18BC0",surfaceColor:"#FFFFFF",backgroundColor:"#FAF8FC"},
 {themeId:"graphite-copper",name:"Graphite & Copper",primaryColor:"#B87545",navigationColor:"#252525",accentColor:"#C58A60",surfaceColor:"#FFFFFF",backgroundColor:"#FAF8F5"},
 {themeId:"burgundy-classic",name:"Burgundy Classic",primaryColor:"#B45A70",navigationColor:"#4A1728",accentColor:"#C8798C",surfaceColor:"#FFFFFF",backgroundColor:"#FCF8F9"},
] as const);
export interface TenantTheme {
  tenantId:string; themeId:string; name:string; logoUrl?:string;
  primaryColor:string; accentColor:string; surfaceColor:string; textColor:string;
  fontFamily:string; appearance:AppearanceMode; updatedAt:string;
}
const HEX_COLOR=/^#[0-9a-f]{6}$/i;
const SAFE_FONT=/^[A-Za-z0-9 ,'-]{1,80}$/;
export function validateTenantTheme(theme:TenantTheme):TenantTheme {
  if(!theme.tenantId.trim()||!theme.themeId.trim()||!theme.name.trim())throw new Error("THEME_CONTEXT_REQUIRED");
  if(![theme.primaryColor,theme.accentColor,theme.surfaceColor,theme.textColor].every(c=>HEX_COLOR.test(c)))throw new Error("THEME_COLOR_INVALID");
  if(!SAFE_FONT.test(theme.fontFamily))throw new Error("THEME_FONT_INVALID");
  if(!["light","dark","system"].includes(theme.appearance))throw new Error("THEME_APPEARANCE_INVALID");
  if(theme.logoUrl&&(!/^https:\/\//i.test(theme.logoUrl)||/[\r\n]/.test(theme.logoUrl)))throw new Error("THEME_LOGO_URL_INVALID");
  if(!Number.isFinite(Date.parse(theme.updatedAt)))throw new Error("THEME_TIMESTAMP_INVALID");
  return {...theme};
}
export function tenantThemeCss(input:TenantTheme):string {
  const t=validateTenantTheme(input);
  return [":root{","--eper-primary:"+t.primaryColor+";","--eper-accent:"+t.accentColor+";","--eper-surface:"+t.surfaceColor+";","--eper-text:"+t.textColor+";","--eper-font-family:"+t.fontFamily+";","color-scheme:"+(t.appearance==="system"?"light dark":t.appearance)+";","}"].join("");
}
