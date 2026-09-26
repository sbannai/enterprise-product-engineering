const http = require('node:http');
const {RecordRepository,authorize,validateBusinessConditions,appendAudit,report} = require('./domain');
const repo = new RecordRepository();
const ctx = {authenticated:true, principalId:'pilot-user', tenantIds:['TENANT-A'], permissions:['record:create','record:read','report:read']};

const server=http.createServer((req,res)=>{
  const send=(code,body)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(body));};
  try {
    if(req.url==='/health') return send(200,{status:'ok'});
    if(req.url==='/api/v1/records' && req.method==='GET') return send(200,{items:report(repo,ctx)});
    if(req.url==='/api/v1/records' && req.method==='POST'){
      let raw=''; req.on('data',c=>raw+=c); req.on('end',()=>{
        try { const input=JSON.parse(raw); authorize(ctx,'record:create'); validateBusinessConditions(input); const value=repo.create(ctx,input); appendAudit(repo.audit,ctx,'record:create',value.id,'SUCCESS'); send(201,value); }
        catch(e){ appendAudit(repo.audit,ctx,'record:create','UNKNOWN','DENIED'); send(e.name==='AuthorizationError'?403:400,{error:e.message}); }
      }); return;
    }
    send(404,{error:'not found'});
  } catch(e){ send(500,{error:'internal error'}); }
});

if(require.main===module) server.listen(process.env.PORT||3000);
module.exports={server};
