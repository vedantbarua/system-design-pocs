import crypto from "node:crypto";

export type TransactionStatus = "PENDING" | "POSTED" | "RECONCILED" | "REVERSED";
export type Category = "income" | "housing" | "groceries" | "dining" | "transport" | "utilities" | "shopping" | "other";
export type EventSource = "seed" | "api" | "kafka" | "replay";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";

export type Account = { id: string; name: string; institution: string; kind: "checking" | "savings"; openingBalanceCents: number };
export type Transaction = {
  id: string; eventId: string; eventKey: string; providerTransactionId: string; pendingProviderTransactionId: string | null;
  accountId: string; merchant: string; normalizedMerchant: string; amountCents: number; status: TransactionStatus;
  category: Category; authorizedAt: string; postedAt: string | null; source: EventSource; updatedAt: string;
};
export type CategoryRule = { id: string; pattern: string; category: Category; priority: number };
export type Budget = { id: string; category: Category; limitCents: number };
export type RecurringPattern = { id: string; merchant: string; category: Category; averageAmountCents: number; cadenceDays: number; lastAt: string; nextAt: string; confidence: number };
export type ForecastEntry = { id: string; date: string; merchant: string; amountCents: number; projectedBalanceCents: number; kind: "recurring" };
export type CashFlowJob = { id: string; kind: "CATEGORIZE_REBUILD" | "RECURRING_DETECTION" | "FORECAST_REBUILD" | "BUDGET_SCAN"; status: JobStatus; attempts: number; maxAttempts: number; dedupeKey: string; payload: Record<string, string | number>; queuedAt: string; completedAt: string | null; lastError: string | null };
export type AuditEvent = { id: string; action: string; actor: string; details: Record<string, unknown>; at: string };
export type TransactionInput = { eventId: string; providerTransactionId: string; pendingProviderTransactionId?: string | null; accountId: string; merchant: string; amountCents: number; status: "PENDING" | "POSTED" | "REVERSED"; authorizedAt?: string; postedAt?: string | null; category?: Category; source?: EventSource };

export function assertCondition(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function id(prefix: string): string { return `${prefix}-${crypto.randomUUID().slice(0, 8)}`; }
export function iso(value: string | number | Date = new Date()): string { const parsed = new Date(value); assertCondition(!Number.isNaN(parsed.getTime()), "invalid timestamp"); return parsed.toISOString(); }
export function addDays(days: number, from: string | number | Date = new Date()): string { return new Date(new Date(from).getTime() + days * 86_400_000).toISOString(); }
export function transactionEventKey(input: Pick<TransactionInput, "providerTransactionId" | "eventId">): string { assertCondition(input.providerTransactionId, "providerTransactionId is required"); assertCondition(input.eventId, "eventId is required"); return `${input.providerTransactionId}:${input.eventId}`; }

function normalizeMerchant(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(store|payment|purchase|online|inc)\b/g, "").trim(); }

export class PersonalCashFlow {
  accounts: Account[] = [];
  transactions: Transaction[] = [];
  rules: CategoryRule[] = [];
  budgets: Budget[] = [];
  recurring: RecurringPattern[] = [];
  forecast: ForecastEntry[] = [];
  jobs: CashFlowJob[] = [];
  audit: AuditEvent[] = [];
  processedEvents = new Set<string>();
  failNextJob = false;

  seed(now: Date = new Date()): void {
    this.accounts = [
      { id: "acct-checking", name: "Everyday Checking", institution: "Northstar Bank", kind: "checking", openingBalanceCents: 320_000 },
      { id: "acct-savings", name: "Emergency Savings", institution: "Northstar Bank", kind: "savings", openingBalanceCents: 850_000 }
    ];
    this.rules = [
      { id: "rule-payroll", pattern: "acme payroll", category: "income", priority: 100 },
      { id: "rule-rent", pattern: "maple property", category: "housing", priority: 90 },
      { id: "rule-market", pattern: "fresh market", category: "groceries", priority: 80 },
      { id: "rule-transit", pattern: "metro transit", category: "transport", priority: 70 },
      { id: "rule-power", pattern: "city power", category: "utilities", priority: 60 },
      { id: "rule-cafe", pattern: "corner cafe", category: "dining", priority: 50 }
    ];
    this.budgets = [
      { id: "budget-grocery", category: "groceries", limitCents: 50_000 },
      { id: "budget-dining", category: "dining", limitCents: 25_000 },
      { id: "budget-transport", category: "transport", limitCents: 18_000 },
      { id: "budget-shopping", category: "shopping", limitCents: 30_000 }
    ];
    this.transactions = []; this.recurring = []; this.forecast = []; this.jobs = []; this.audit = []; this.processedEvents = new Set(); this.failNextJob = false;
    const events: TransactionInput[] = [
      { eventId:"seed-pay-3", providerTransactionId:"bank-pay-3", accountId:"acct-checking", merchant:"ACME Payroll", amountCents:280_000, status:"POSTED", authorizedAt:addDays(-61,now), postedAt:addDays(-61,now), source:"seed" },
      { eventId:"seed-pay-2", providerTransactionId:"bank-pay-2", accountId:"acct-checking", merchant:"ACME Payroll", amountCents:280_000, status:"POSTED", authorizedAt:addDays(-31,now), postedAt:addDays(-31,now), source:"seed" },
      { eventId:"seed-pay-1", providerTransactionId:"bank-pay-1", accountId:"acct-checking", merchant:"ACME Payroll", amountCents:280_000, status:"POSTED", authorizedAt:addDays(-1,now), postedAt:addDays(-1,now), source:"seed" },
      { eventId:"seed-rent-3", providerTransactionId:"bank-rent-3", accountId:"acct-checking", merchant:"Maple Property Payment", amountCents:-145_000, status:"POSTED", authorizedAt:addDays(-59,now), postedAt:addDays(-59,now), source:"seed" },
      { eventId:"seed-rent-2", providerTransactionId:"bank-rent-2", accountId:"acct-checking", merchant:"Maple Property Payment", amountCents:-145_000, status:"POSTED", authorizedAt:addDays(-29,now), postedAt:addDays(-29,now), source:"seed" },
      { eventId:"seed-rent-1", providerTransactionId:"bank-rent-1", accountId:"acct-checking", merchant:"Maple Property Payment", amountCents:-145_000, status:"POSTED", authorizedAt:addDays(-2,now), postedAt:addDays(-2,now), source:"seed" },
      { eventId:"seed-grocery", providerTransactionId:"bank-grocery-1", accountId:"acct-checking", merchant:"Fresh Market Store", amountCents:-12_480, status:"POSTED", authorizedAt:addDays(-4,now), postedAt:addDays(-3,now), source:"seed" },
      { eventId:"seed-power", providerTransactionId:"bank-power-1", accountId:"acct-checking", merchant:"City Power", amountCents:-14_260, status:"POSTED", authorizedAt:addDays(-6,now), postedAt:addDays(-5,now), source:"seed" },
      { eventId:"seed-transit", providerTransactionId:"bank-transit-1", accountId:"acct-checking", merchant:"Metro Transit", amountCents:-7_500, status:"POSTED", authorizedAt:addDays(-8,now), postedAt:addDays(-7,now), source:"seed" },
      { eventId:"seed-cafe", providerTransactionId:"bank-cafe-1", accountId:"acct-checking", merchant:"Corner Cafe", amountCents:-2_175, status:"POSTED", authorizedAt:addDays(-1,now), postedAt:addDays(-1,now), source:"seed" },
      { eventId:"seed-pending", providerTransactionId:"pending-market-2", accountId:"acct-checking", merchant:"Fresh Market Online", amountCents:-6_842, status:"PENDING", authorizedAt:iso(now), source:"seed" },
      { eventId:"seed-interest", providerTransactionId:"bank-interest-1", accountId:"acct-savings", merchant:"Interest Credit", amountCents:2_145, status:"POSTED", authorizedAt:addDays(-3,now), postedAt:addDays(-3,now), category:"income", source:"seed" }
    ];
    for (const event of events) this.ingestTransaction(event);
    this.detectRecurring(); this.rebuildForecast(30, now); this.audit = [];
    this.createAudit("DEMO_SEEDED", "system", { accounts:this.accounts.length, transactions:this.transactions.length });
  }

  createAudit(action:string, actor:string, details:Record<string,unknown>):AuditEvent { const event={id:id("audit"),action,actor,details,at:iso()}; this.audit.unshift(event); return event; }
  findAccount(accountId:string):Account { const account=this.accounts.find((item)=>item.id===accountId); assertCondition(account,"account not found"); return account; }
  categorize(merchant:string):Category { const normalized=normalizeMerchant(merchant); return [...this.rules].sort((a,b)=>b.priority-a.priority).find((rule)=>normalized.includes(rule.pattern))?.category || "other"; }

  ingestTransaction(input:TransactionInput):{duplicate:boolean;stale?:boolean;transaction?:Transaction;reconciledId?:string} {
    this.findAccount(input.accountId); assertCondition(input.merchant?.trim(),"merchant is required"); assertCondition(Number.isInteger(input.amountCents)&&input.amountCents!==0,"amountCents must be a non-zero integer");
    const key=transactionEventKey(input); if(this.processedEvents.has(key)) return {duplicate:true};
    const sameProvider=this.transactions.find((item)=>item.providerTransactionId===input.providerTransactionId);
    if(sameProvider?.status==="POSTED"&&input.status==="PENDING") { this.processedEvents.add(key); this.createAudit("STALE_PENDING_IGNORED","transaction-ingest",{providerTransactionId:input.providerTransactionId}); return {duplicate:false,stale:true,transaction:sameProvider}; }
    let reconciledId:string|undefined;
    if(input.status==="POSTED"&&input.pendingProviderTransactionId) {
      const pending=this.transactions.find((item)=>item.providerTransactionId===input.pendingProviderTransactionId&&item.status==="PENDING");
      if(pending){pending.status="RECONCILED";pending.updatedAt=iso();reconciledId=pending.id;}
    }
    const transaction:Transaction={
      id:sameProvider?.id||id("txn"),eventId:input.eventId,eventKey:key,providerTransactionId:input.providerTransactionId,pendingProviderTransactionId:input.pendingProviderTransactionId||null,
      accountId:input.accountId,merchant:input.merchant.trim(),normalizedMerchant:normalizeMerchant(input.merchant),amountCents:input.amountCents,status:input.status,
      category:input.category||this.categorize(input.merchant),authorizedAt:iso(input.authorizedAt||new Date()),postedAt:input.status==="POSTED"?iso(input.postedAt||new Date()):null,source:input.source||"api",updatedAt:iso()
    };
    if(sameProvider) this.transactions=this.transactions.filter((item)=>item.id!==sameProvider.id);
    this.transactions.unshift(transaction);this.processedEvents.add(key);this.createAudit(reconciledId?"PENDING_RECONCILED":"TRANSACTION_INGESTED","transaction-ingest",{transactionId:transaction.id,status:transaction.status,reconciledId});
    return {duplicate:false,transaction,reconciledId};
  }

  accountBalance(accountId:string,includePending=false):number { const account=this.findAccount(accountId); return account.openingBalanceCents+this.transactions.filter((txn)=>txn.accountId===accountId&&(txn.status==="POSTED"||(includePending&&txn.status==="PENDING"))).reduce((sum,txn)=>sum+txn.amountCents,0); }
  rebuildCategories():number { let changed=0; for(const txn of this.transactions){const next=this.categorize(txn.merchant);if(txn.category!==next){txn.category=next;changed+=1;}}this.createAudit("CATEGORIES_REBUILT","worker:categorizer",{changed});return changed; }

  detectRecurring():RecurringPattern[] {
    const groups=new Map<string,Transaction[]>();
    for(const txn of this.transactions.filter((item)=>item.status==="POSTED")){const key=`${txn.accountId}:${txn.normalizedMerchant}`;groups.set(key,[...(groups.get(key)||[]),txn]);}
    const patterns:RecurringPattern[]=[];
    for(const items of groups.values()){
      if(items.length<2)continue;items.sort((a,b)=>a.authorizedAt.localeCompare(b.authorizedAt));const intervals=items.slice(1).map((item,index)=>(new Date(item.authorizedAt).getTime()-new Date(items[index].authorizedAt).getTime())/86_400_000);const cadence=Math.round(intervals.reduce((a,b)=>a+b,0)/intervals.length);if(cadence<20||cadence>40)continue;
      const amounts=items.map((item)=>item.amountCents);const average=Math.round(amounts.reduce((a,b)=>a+b,0)/amounts.length);const variance=Math.max(...amounts.map((amount)=>Math.abs(amount-average)));const confidence=Math.max(.5,Math.min(.99,1-variance/Math.max(Math.abs(average),1)));
      const last=items[items.length-1];patterns.push({id:`recurring-${last.normalizedMerchant.replaceAll(" ","-")}`,merchant:last.merchant,category:last.category,averageAmountCents:average,cadenceDays:cadence,lastAt:last.authorizedAt,nextAt:addDays(cadence,last.authorizedAt),confidence:Number(confidence.toFixed(2))});
    }
    this.recurring=patterns.sort((a,b)=>a.nextAt.localeCompare(b.nextAt));this.createAudit("RECURRING_DETECTED","worker:recurring",{patterns:patterns.length});return patterns;
  }

  rebuildForecast(horizonDays=30,asOf:string|Date=new Date()):ForecastEntry[] {
    assertCondition(horizonDays>0&&horizonDays<=90,"horizonDays must be between 1 and 90");const start=new Date(asOf).getTime();const end=start+horizonDays*86_400_000;let balance=this.accounts.reduce((sum,account)=>sum+this.accountBalance(account.id,true),0);const events:{date:string;merchant:string;amountCents:number}[]=[];
    for(const pattern of this.recurring){let date=new Date(pattern.nextAt).getTime();while(date<start)date+=pattern.cadenceDays*86_400_000;while(date<=end){events.push({date:iso(date),merchant:pattern.merchant,amountCents:pattern.averageAmountCents});date+=pattern.cadenceDays*86_400_000;}}
    events.sort((a,b)=>a.date.localeCompare(b.date));this.forecast=events.map((event)=>{balance+=event.amountCents;return{id:id("forecast"),...event,projectedBalanceCents:balance,kind:"recurring" as const};});this.createAudit("FORECAST_REBUILT","worker:forecast",{horizonDays,events:this.forecast.length});return this.forecast;
  }

  budgetStatus(asOf:string|Date=new Date()):Array<Budget&{spentCents:number;remainingCents:number;percent:number;alert:boolean}> { const date=new Date(asOf);const monthStart=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1);return this.budgets.map((budget)=>{const spent=-this.transactions.filter((txn)=>txn.status==="POSTED"&&txn.category===budget.category&&txn.amountCents<0&&new Date(txn.postedAt||txn.authorizedAt).getTime()>=monthStart).reduce((sum,txn)=>sum+txn.amountCents,0);const percent=Math.round(spent/budget.limitCents*100);return{...budget,spentCents:spent,remainingCents:budget.limitCents-spent,percent,alert:percent>=80};}); }
  ensureJob(kind:CashFlowJob["kind"],payload:CashFlowJob["payload"]={}):CashFlowJob { const dedupeKey=`${kind}:${iso().slice(0,13)}:${JSON.stringify(payload)}`;const existing=this.jobs.find((job)=>job.dedupeKey===dedupeKey);if(existing)return existing;const job:CashFlowJob={id:id("job"),kind,status:"QUEUED",attempts:0,maxAttempts:3,dedupeKey,payload,queuedAt:iso(),completedAt:null,lastError:null};this.jobs.unshift(job);return job; }
  dispatchNextJob():{processed:boolean;job?:CashFlowJob}{const job=this.jobs.find((item)=>item.status==="QUEUED"||item.status==="RETRY");if(!job)return{processed:false};job.status="RUNNING";job.attempts+=1;if(this.failNextJob){this.failNextJob=false;job.status=job.attempts>=job.maxAttempts?"DEAD":"RETRY";job.lastError="simulated projection worker timeout";this.createAudit("JOB_RETRY","worker",{jobId:job.id});return{processed:true,job};}if(job.kind==="CATEGORIZE_REBUILD")this.rebuildCategories();if(job.kind==="RECURRING_DETECTION")this.detectRecurring();if(job.kind==="FORECAST_REBUILD")this.rebuildForecast(Number(job.payload.horizonDays||30));if(job.kind==="BUDGET_SCAN")this.createAudit("BUDGET_SCAN_COMPLETED","worker:budget",{alerts:this.budgetStatus().filter((item)=>item.alert).length});job.status="COMPLETED";job.completedAt=iso();job.lastError=null;this.createAudit("JOB_COMPLETED","worker",{jobId:job.id,kind:job.kind});return{processed:true,job};}
  drainJobs(max=50):{processed:number;completed:number}{let processed=0,completed=0;while(processed<max){const result=this.dispatchNextJob();if(!result.processed||!result.job)break;processed+=1;if(result.job.status==="COMPLETED")completed+=1;}return{processed,completed};}

  snapshot():Record<string,unknown>{const ledgerBalance=this.accounts.reduce((sum,account)=>sum+this.accountBalance(account.id,false),0);const availableBalance=this.accounts.reduce((sum,account)=>sum+this.accountBalance(account.id,true),0);const posted=this.transactions.filter((txn)=>txn.status==="POSTED");const income=posted.filter((txn)=>txn.amountCents>0).reduce((sum,txn)=>sum+txn.amountCents,0);const spending=-posted.filter((txn)=>txn.amountCents<0).reduce((sum,txn)=>sum+txn.amountCents,0);const lowPoint=Math.min(availableBalance,...this.forecast.map((item)=>item.projectedBalanceCents));const budgetStatus=this.budgetStatus();return{accounts:this.accounts,transactions:this.transactions,rules:this.rules,budgets:this.budgets,budgetStatus,recurring:this.recurring,forecast:this.forecast,jobs:this.jobs,audit:this.audit,accountBalances:this.accounts.map((account)=>({...account,ledgerBalanceCents:this.accountBalance(account.id),availableBalanceCents:this.accountBalance(account.id,true)})),metrics:{ledgerBalanceCents:ledgerBalance,availableBalanceCents:availableBalance,pendingCount:this.transactions.filter((txn)=>txn.status==="PENDING").length,incomeCents:income,spendingCents:spending,recurringCount:this.recurring.length,forecastLowCents:lowPoint,budgetAlerts:budgetStatus.filter((item)=>item.alert).length,queuedJobs:this.jobs.filter((job)=>job.status==="QUEUED"||job.status==="RETRY").length}};}
  exportState():Record<string,unknown>{return{accounts:this.accounts,transactions:this.transactions,rules:this.rules,budgets:this.budgets,recurring:this.recurring,forecast:this.forecast,jobs:this.jobs,audit:this.audit,processedEvents:[...this.processedEvents]};}
  importState(state:Record<string,unknown>):void{this.accounts=(state.accounts as Account[])||[];this.transactions=(state.transactions as Transaction[])||[];this.rules=(state.rules as CategoryRule[])||[];this.budgets=(state.budgets as Budget[])||[];this.recurring=(state.recurring as RecurringPattern[])||[];this.forecast=(state.forecast as ForecastEntry[])||[];this.jobs=(state.jobs as CashFlowJob[])||[];this.audit=(state.audit as AuditEvent[])||[];this.processedEvents=new Set((state.processedEvents as string[])||[]);}
}

export function createSeededCashFlow(now:Date=new Date()):PersonalCashFlow{const cashFlow=new PersonalCashFlow();cashFlow.seed(now);return cashFlow;}
