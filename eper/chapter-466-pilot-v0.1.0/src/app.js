import http from "node:http";
import {OrderRepository,report} from "./domain.js";
const repo=new OrderRepository();
http.createServer((req,res)=>{
  if(req.url==="/health"){res.writeHead(200,{"content-type":"application/json"});return res.end(JSON.stringify({status:"ok",service:"chapter-466-order-management-pilot"}));}
  if(req.url==="/report"){const ctx={actorId:"system",tenantId:"tenant-a",permissions:["order:read","order:report"]};res.writeHead(200,{"content-type":"application/json"});return res.end(JSON.stringify(report(ctx,repo,"tenant-a")));}
  res.writeHead(404);res.end();
}).listen(process.env.PORT||3000);
