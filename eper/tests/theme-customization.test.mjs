import assert from "node:assert/strict"; import test from "node:test";
import {tenantThemeCss,validateTenantTheme} from "../dist/packages/themes/index.js";
const theme={tenantId:"tenant-a",themeId:"brand-1",name:"Tenant brand",logoUrl:"https://assets.example.test/logo.svg",primaryColor:"#123456",accentColor:"#ddeeff",surfaceColor:"#ffffff",textColor:"#172033",fontFamily:"Arial",appearance:"light",updatedAt:"2026-10-23T00:00:00.000Z"};
test("validates tenant branding and produces CSS tokens",()=>{assert.equal(validateTenantTheme(theme).tenantId,"tenant-a");assert.match(tenantThemeCss(theme),/--eper-primary:#123456/);});
test("rejects unsafe theme input",()=>{assert.throws(()=>validateTenantTheme({...theme,primaryColor:"red;body{}"}),/THEME_COLOR_INVALID/);assert.throws(()=>validateTenantTheme({...theme,fontFamily:"Arial;body{}"}),/THEME_FONT_INVALID/);assert.throws(()=>validateTenantTheme({...theme,logoUrl:"javascript:alert(1)"}),/THEME_LOGO_URL_INVALID/);});
