import cors from "cors";
import express,{type RequestHandler} from "express";
import {Infrastructure} from "./adapters.js";
import {createSeededLifecycle,syncKey,type SyncEvent,type SyncInput} from "./core.js";

const PORT=Number(process.env.PORT||8192),HOST=process.env.HOST||"127.0.0.1",TOPIC=process.env.IDENTITY_EVENT_TOPIC||"identity.directory.events";
const app=express();let lifecycle=createSeededLifecycle();const infra=await new Infrastructure().connect();const saved=await infra.load();if(saved)lifecycle.importState(saved);else await infra.save(lifecycle.exportState());
app.use(cors());app.use(express.json());
function route(handler:RequestHandler):RequestHandler{return async(req,res,next)=>{try{await Promise.resolve(handler(req,res,next))}catch(error){res.status(400).json({error:(error as Error).message})}}}
async function persist(event?:SyncEvent){if(event)await infra.append(TOPIC,syncKey(event.source,event.eventId),event as unknown as Record<string,unknown>);await infra.save(lifecycle.exportState())}
async function processEvent(message:Record<string,unknown>){const result=lifecycle.ingest({...message,source:String(message.source||"kafka")} as SyncInput);await persist(result.event)}
await infra.consume(TOPIC,processEvent);

app.get("/api/health",(_req,res)=>res.json({status:"ok",persistence:infra.mode,kafka:infra.kafkaMode,postgres:infra.postgresMode,redis:infra.redisMode,bufferedMessages:infra.messages.length}));
app.get("/api/snapshot",(_req,res)=>res.json(lifecycle.snapshot()));
app.post("/api/scim/events",route(async(req,res)=>{const input={...req.body,source:req.body.source||"api"};syncKey(input.source,input.eventId);await infra.publish(TOPIC,input.eventId,input);const result=lifecycle.ingest(input);await persist(result.event);res.status(result.duplicate?200:202).json({...result,published:true})}));
app.post("/api/scim/publish",route(async(req,res)=>{syncKey(req.body.source||"scim",req.body.eventId);await infra.publish(TOPIC,req.body.eventId,req.body);res.status(202).json({queued:true,bufferedMessages:infra.messages.length})}));
app.post("/api/scim/drain",route(async(_req,res)=>{const result=await infra.drain(TOPIC,processEvent);await persist();res.json(result)}));
app.post("/api/users/:id/suspend",route(async(req,res)=>{const user=lifecycle.suspend(String(req.params.id));await persist();res.json(user)}));
app.post("/api/users/:id/reactivate",route(async(req,res)=>{const user=lifecycle.reactivate(String(req.params.id));await persist();res.json(user)}));
app.post("/api/users/:id/deprovision",route(async(req,res)=>{const user=lifecycle.deprovision(String(req.params.id));await persist();res.json(user)}));
app.post("/api/users/:id/sessions",route(async(req,res)=>{const session=lifecycle.openSession(String(req.params.id),String(req.body.ip||"127.0.0.1"));await persist();res.status(201).json(session)}));
app.post("/api/grants/jit",route(async(req,res)=>{const grant=lifecycle.grantJit(String(req.body.userId),String(req.body.entitlementId),Number(req.body.hours),String(req.body.reason||""));await persist();res.status(201).json(grant)}));
app.post("/api/grants/:id/revoke",route(async(req,res)=>{const grant=lifecycle.revokeGrant(String(req.params.id));await persist();res.json(grant)}));
app.post("/api/reviews",route(async(req,res)=>{const campaign=lifecycle.createReview(String(req.body.name),req.body.dueAt||new Date(Date.now()+7*86400000),Boolean(req.body.privilegedOnly??true));await persist();res.status(201).json(campaign)}));
app.post("/api/review-items/:id/decide",route(async(req,res)=>{const item=lifecycle.decideReview(String(req.params.id),req.body.decision,String(req.body.reviewer||""),String(req.body.note||""));await persist();res.json(item)}));
app.post("/api/reviews/:id/complete",route(async(req,res)=>{const campaign=lifecycle.completeReview(String(req.params.id));await persist();res.json(campaign)}));
app.post("/api/jobs",route(async(req,res)=>{const job=lifecycle.ensureJob(req.body.kind,req.body.payload||{});await persist();res.status(202).json(job)}));
app.post("/api/jobs/fail-next",(_req,res)=>{lifecycle.failNextJob=true;res.json({armed:true})});
app.post("/api/jobs/drain",route(async(_req,res)=>{const result=lifecycle.drainJobs();await persist();res.json(result)}));
app.post("/api/reset",route(async(_req,res)=>{lifecycle=createSeededLifecycle();await persist();res.json(lifecycle.snapshot())}));

const server=app.listen(PORT,HOST,()=>console.log(`Identity lifecycle API listening on http://${HOST}:${PORT} (${infra.mode})`));
async function shutdown(){server.close();await infra.close();process.exit(0)}process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);
