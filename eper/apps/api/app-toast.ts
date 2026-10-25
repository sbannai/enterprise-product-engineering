/** Shared, accessible toast center used by EPER admin experiences. */
export const applicationToastMarkup = String.raw`
<style>
#eper-toast-region{position:fixed;z-index:9999;top:16px;right:16px;display:grid;gap:10px;width:min(390px,calc(100vw - 32px));pointer-events:none}
.eper-toast{pointer-events:auto;display:grid;grid-template-columns:24px 1fr 28px;gap:10px;align-items:start;padding:14px;border:1px solid var(--eper-line);border-left:4px solid var(--eper-blue);border-radius:14px;background:#fff;color:var(--eper-ink);box-shadow:0 16px 40px #15254220;animation:eper-toast-in .18s ease-out}
.eper-toast[data-kind=success]{border-left-color:var(--eper-green)}.eper-toast[data-kind=error]{border-left-color:var(--eper-red)}.eper-toast[data-kind=warning]{border-left-color:#b7791f}.eper-toast-icon{font-weight:850}.eper-toast-title{font-weight:800;margin-bottom:2px}.eper-toast-message{font-size:13px;overflow-wrap:anywhere}.eper-toast-close{border:0;background:transparent;color:#53627a;padding:2px;cursor:pointer;font-size:18px;line-height:1}.eper-toast-close:focus-visible{outline:3px solid #a8c0ff;border-radius:5px}@keyframes eper-toast-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.eper-toast{animation:none}}
</style>
<div id="eper-toast-region" aria-live="polite" aria-relevant="additions text" aria-atomic="false"></div>
<script>
(function(){
  var region=document.getElementById('eper-toast-region');if(!region)return;
  var timers=new WeakMap();
  function dismiss(item){var timer=timers.get(item);if(timer!==undefined){clearTimeout(timer);timers.delete(item)}item.remove()}
  var icons={success:'✓',error:'!',warning:'⚠',info:'i'};
  function show(kind,message,title,options){
    options=options||{};kind=icons[kind]?kind:'info';
    var item=document.createElement('section');item.className='eper-toast';item.dataset.kind=kind;item.setAttribute('role',kind==='error'?'alert':'status');
    var icon=document.createElement('div');icon.className='eper-toast-icon';icon.setAttribute('aria-hidden','true');icon.textContent=icons[kind];
    var body=document.createElement('div');var heading=document.createElement('div');heading.className='eper-toast-title';heading.textContent=title||({success:'Saved',error:'Something went wrong',warning:'Attention needed',info:'Notice'}[kind]);
    var copy=document.createElement('div');copy.className='eper-toast-message';copy.textContent=String(message||'');body.append(heading,copy);
    var close=document.createElement('button');close.type='button';close.className='eper-toast-close';close.setAttribute('aria-label','Dismiss notification');close.textContent='×';close.addEventListener('click',function(){dismiss(item)});item.append(icon,body,close);region.appendChild(item);
    while(region.children.length>5)dismiss(region.firstElementChild);
    var duration=Number.isFinite(options.duration)?options.duration:(kind==='error'?8000:4500);if(duration>0)timers.set(item,setTimeout(function(){dismiss(item)},duration));return item;
  }
  window.EPERToast={success:function(m,t,o){return show('success',m,t,o)},error:function(m,t,o){return show('error',m,t,o)},warning:function(m,t,o){return show('warning',m,t,o)},info:function(m,t,o){return show('info',m,t,o)},show:show};
})();
</script>
`;