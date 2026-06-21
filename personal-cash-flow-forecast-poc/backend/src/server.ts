import cors from "cors";
import express,{type RequestHandler} from "express";
import {Infrastructure} from "./adapters.js";
import {createSeededCashFlow,transactionEventKey,type Transaction} from "./core.js";

const PORT=Number(process.env.PORT||8190);const HOST=process.env.HOST||"127.0.0.1";const TOPIC=process.env.CASHFLOW_TRANSACTION_TOPIC||"cashflow.bank.transactions";
const app=express();let cashFlow=createSeededCashFlow();const infrastructure=await new Infrastructure().connect();const persisted=await infrastructure.load();if(persisted)cashFlow.importState(persisted);else await infrastructure.save(cashFlow.exportState());app.use(cors());app.use(express.json({limit:"1mb"}));
function route(handler:RequestHandler):RequestHandler{return async(req,res,next)=>{try{await Promise.resolve(handler(req,res,next));}catch(error){res.status(400).json({error:(error as Error).message});}};}
async function persist(transaction?:Transaction):Promise<void>{if(transaction)await infrastructure.appendEvent(TOPIC,transaction.eventKey,transaction as unknown as Record<string,unknown>);await infrastructure.save(cashFlow.exportState());await infrastructure.mirrorProjections(cashFlow.recurring,cashFlow.forecast,cashFlow.jobs);}
async function processTransaction(message:Record<string,unknown>):Promise<void>{const result=cashFlow.ingestTransaction({...message,source:"kafka"} as never);if(result.transaction&&!result.stale){cashFlow.detectRecurring();cashFlow.rebuildForecast();}await persist(result.transaction);}
await infrastructure.startConsumer(TOPIC,processTransaction);
app.get("/api/health",(_req,res)=>res.json({status:"ok",persistence:infrastructure.mode,kafka:infrastructure.kafkaMode,postgres:infrastructure.postgresMode,redis:infrastructure.redisMode,bufferedMessages:infrastructure.messages.length}));
app.get("/api/snapshot",(_req,res)=>res.json(cashFlow.snapshot()));
app.post("/api/transactions",route(async(req,res)=>{const input={...req.body,amountCents:Number(req.body.amountCents),source:"api"};await infrastructure.publish(TOPIC,input.accountId,input);const result=cashFlow.ingestTransaction(input);if(result.transaction&&!result.stale){cashFlow.detectRecurring();cashFlow.rebuildForecast();}await persist(result.transaction);res.status(result.duplicate?200:202).json({...result,kafkaPublished:true});}));
app.post("/api/transactions/publish",route(async(req,res)=>{cashFlow.findAccount(req.body.accountId);transactionEventKey(req.body);await infrastructure.publish(TOPIC,req.body.accountId,req.body);res.status(202).json({queued:true,kafka:infrastructure.kafkaMode,bufferedMessages:infrastructure.messages.length});}));
app.post("/api/kafka/drain",route(async(_req,res)=>{const result=await infrastructure.drainMemory(TOPIC,processTransaction);await persist();res.json(result);}));
app.post("/api/rebuild/categories",route(async(_req,res)=>{const changed=cashFlow.rebuildCategories();await persist();res.json({changed});}));
app.post("/api/rebuild/recurring",route(async(_req,res)=>{const patterns=cashFlow.detectRecurring();await persist();res.json({patterns});}));
app.post("/api/rebuild/forecast",route(async(req,res)=>{const forecast=cashFlow.rebuildForecast(Number(req.body.horizonDays??30),req.body.asOf||new Date());await persist();res.json({forecast});}));
app.post("/api/jobs",route(async(req,res)=>{const job=cashFlow.ensureJob(req.body.kind,req.body.payload||{});await persist();res.status(202).json(job);}));
app.post("/api/jobs/fail-next",(_req,res)=>{cashFlow.failNextJob=true;res.json({armed:true});});
app.post("/api/jobs/tick",route(async(_req,res)=>{const result=cashFlow.dispatchNextJob();await persist();res.json(result);}));
app.post("/api/jobs/drain",route(async(req,res)=>{const result=cashFlow.drainJobs(Number(req.query.max||50));await persist();res.json(result);}));
app.post("/api/reset",route(async(_req,res)=>{cashFlow=createSeededCashFlow();await persist();res.json(cashFlow.snapshot());}));
const server=app.listen(PORT,HOST,()=>console.log(`Personal cash flow API listening on http://${HOST}:${PORT} (${infrastructure.mode})`));
async function shutdown():Promise<void>{server.close();await infrastructure.close();process.exit(0);}process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);
