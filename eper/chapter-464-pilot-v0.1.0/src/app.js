const http=require('node:http');
const {SupplierRepository,report}=require('./domain');

function createServer({resolveContext}={}){
  const repo=new SupplierRepository();
  return http.createServer((req,res)=>{
    const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
    if(req.url==='/health'&&req.method==='GET')return send(200,{status:'ok'});
    if(req.url!=='/api/v1/suppliers'||req.method!=='GET')return send(404,{error:'not found'});
    const ctx=typeof resolveContext==='function'?resolveContext(req):null;
    if(!ctx||ctx.authenticated!==true||typeof ctx.principalId!=='string'||!ctx.principalId||
       !Array.isArray(ctx.tenantIds)||!Array.isArray(ctx.permissions))return send(401,{error:'authentication required'});
    try{return send(200,{items:report(repo,ctx)});}catch{return send(500,{error:'internal error'});}
  });
}
const server=createServer();
if(require.main===module)server.listen(process.env.PORT||3000);
module.exports={server,createServer};
