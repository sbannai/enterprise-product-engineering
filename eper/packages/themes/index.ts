export type AppearanceMode = "light" | "dark" | "system";
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
