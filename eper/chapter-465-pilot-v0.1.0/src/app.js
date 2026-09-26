import http from "node:http";
import { InventoryRepository, report } from "./domain.js";
const repository=new InventoryRepository();
http.createServer((req,res)=>{
  if(req.url==="/health"){res.writeHead(200,{"content-type":"application/json"});return res.end(JSON.stringify({status:"ok",service:"chapter-465-inventory-pilot"}));}
  if(req.url==="/report"){const ctx={actorId:"system",tenantId:"tenant-a",permissions:["inventory:read","inventory:report"]};res.writeHead(200,{"content-type":"application/json"});return res.end(JSON.stringify(report(ctx,repository,"tenant-a")));}
  res.writeHead(404);res.end();
}).listen(process.env.PORT||3000);
