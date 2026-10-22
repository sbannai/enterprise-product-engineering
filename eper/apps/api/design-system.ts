/** Shared visual system for EPER administration surfaces. Keep controls and layouts aligned across feature screens. */
export const enterpriseDesignSystemCss = String.raw`
:root{
  color-scheme:light;
  --ink:#172033;--muted:#5f6b7d;--line:#dce3ed;--bg:#f5f7fb;--card:#fff;
  --navy:#111c33;--blue:#315efb;--blue-hover:#2449d8;--green:#13795b;--amber:#8a5200;--red:#b42318;
  --surface-soft:#f8faff;--focus:#b8c9ff;--radius-sm:8px;--radius-md:12px;--radius-lg:16px;
  --shadow-card:0 1px 2px #14233b08,0 8px 24px #14233b08;
  --space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:20px;--space-6:24px;
}
html{font-synthesis:none;text-size-adjust:100%;-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.55;letter-spacing:-.005em}
button,input,select,textarea{font:inherit}
button{min-height:40px;transition:background-color .15s ease,border-color .15s ease,box-shadow .15s ease,transform .15s ease}
button:not(:disabled):hover{filter:brightness(.97)}
button:not(:disabled):active{transform:translateY(1px)}
button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,[tabindex]:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
input,select,textarea{min-height:42px;border-color:#c7d1df;border-radius:var(--radius-sm);box-shadow:inset 0 1px 2px #14233b08;transition:border-color .15s ease,box-shadow .15s ease}
input:hover,select:hover,textarea:hover{border-color:#98a8bd}
input:focus,select:focus,textarea:focus{border-color:var(--blue);box-shadow:0 0 0 3px #315efb20;outline:none}
input[type=checkbox],input[type=radio]{accent-color:var(--blue)}
button.secondary{background:#eef2f8;color:#263651;border:1px solid #dce3ed}
button.secondary:hover{background:#e4eaf4}
.card,.metricbox,.toolbar,.connect,.activity,.item,.notice,.quote{border-radius:var(--radius-md)}
.card{box-shadow:var(--shadow-card)}
.card h2{letter-spacing:-.02em;line-height:1.35}
.sub,.help,.metric-label,.statusline{line-height:1.5}
.tablewrap{border-color:var(--line);border-radius:var(--radius-md)}
table{font-variant-numeric:tabular-nums}
th{letter-spacing:.055em;font-weight:750}
td,th{vertical-align:middle}
tbody tr:hover{background:#f8faff}
.pill{white-space:nowrap;line-height:1.4}
.notice{line-height:1.55}
.empty{line-height:1.6}
.statusline:empty{display:none}
.statusline.error,[role=alert]{color:var(--red)}
.statusline.success{color:var(--green)}
a{color:var(--blue);text-underline-offset:3px}
::selection{background:#dbe5ff;color:#14233b}
@media(max-width:720px){
  header{gap:12px}
  .shell{padding-top:18px}
  .card{padding:16px}
  .actions button{flex:0 0 auto}
  .tablewrap{-webkit-overflow-scrolling:touch}
}
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}
`;
