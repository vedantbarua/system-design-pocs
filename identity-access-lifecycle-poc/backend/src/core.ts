import crypto from "node:crypto";

export type UserStatus = "ACTIVE" | "SUSPENDED" | "DEPROVISIONED";
export type SessionStatus = "ACTIVE" | "REVOCATION_PENDING" | "REVOKED" | "EXPIRED";
export type GrantStatus = "ACTIVE" | "PENDING_REVOKE" | "REVOKED" | "EXPIRED";
export type JobStatus = "QUEUED" | "RUNNING" | "RETRY" | "COMPLETED" | "DEAD";
export type ReviewStatus = "OPEN" | "COMPLETED";
export type ReviewDecision = "PENDING" | "APPROVED" | "REVOKED";
export type SyncOperation = "UPSERT_USER" | "ADD_MEMBERSHIP" | "REMOVE_MEMBERSHIP" | "DEPROVISION_USER";

export type Organization = {id:string; name:string; domain:string};
export type Group = {id:string; organizationId:string; name:string; role:string; privileged:boolean};
export type User = {id:string; externalId:string; organizationId:string; email:string; name:string; department:string; status:UserStatus; createdAt:string; updatedAt:string};
export type Membership = {id:string; userId:string; groupId:string; source:"SCIM"|"MANUAL"; createdAt:string};
export type Entitlement = {id:string; name:string; resource:string; risk:"LOW"|"MEDIUM"|"HIGH"};
export type AccessGrant = {id:string; userId:string; entitlementId:string; reason:string; source:"GROUP"|"JIT"|"MANUAL"; status:GrantStatus; startsAt:string; expiresAt:string|null; revokedAt:string|null};
export type Session = {id:string; userId:string; provider:string; ip:string; status:SessionStatus; issuedAt:string; expiresAt:string; revokedAt:string|null};
export type SyncEvent = {id:string; eventId:string; source:string; operation:SyncOperation; status:"APPLIED"|"REJECTED"; subject:string; reason:string|null; receivedAt:string};
export type ReviewItem = {id:string; campaignId:string; grantId:string; userId:string; entitlementId:string; decision:ReviewDecision; reviewer:string|null; decidedAt:string|null; note:string|null};
export type ReviewCampaign = {id:string; name:string; status:ReviewStatus; dueAt:string; createdAt:string; completedAt:string|null};
export type LifecycleJob = {id:string; kind:"REVOCATION_PROPAGATION"|"DIRECTORY_SYNC"|"ACCESS_EXPIRY"|"REVIEW_REMINDER"; status:JobStatus; attempts:number; maxAttempts:number; dedupeKey:string; payload:Record<string,string|number>; queuedAt:string; completedAt:string|null; lastError:string|null};
export type Audit = {id:string; action:string; actor:string; details:Record<string,unknown>; at:string};
export type SyncInput = {eventId:string; source?:string; operation:SyncOperation; externalId?:string; email?:string; name?:string; department?:string; userId?:string; groupId?:string};

export function assertCondition(value:unknown,message:string):asserts value {if(!value)throw new Error(message)}
export function id(prefix:string){return `${prefix}-${crypto.randomUUID().slice(0,8)}`}
export function iso(value:string|number|Date=new Date()){const date=new Date(value);assertCondition(!Number.isNaN(date.getTime()),"invalid timestamp");return date.toISOString()}
export function addHours(hours:number,value:string|number|Date=new Date()){return new Date(new Date(value).getTime()+hours*3_600_000).toISOString()}
export function addDays(days:number,value:string|number|Date=new Date()){return addHours(days*24,value)}
export function syncKey(source:string,eventId:string){assertCondition(source,"source is required");assertCondition(eventId,"eventId is required");return `${source}:${eventId}`}

export class IdentityLifecycle {
  organizations:Organization[]=[]; groups:Group[]=[]; users:User[]=[]; memberships:Membership[]=[]; entitlements:Entitlement[]=[];
  grants:AccessGrant[]=[]; sessions:Session[]=[]; syncEvents:SyncEvent[]=[]; campaigns:ReviewCampaign[]=[]; reviewItems:ReviewItem[]=[];
  jobs:LifecycleJob[]=[]; audit:Audit[]=[]; processed=new Set<string>(); failNextJob=false;

  seed(now:Date=new Date()){
    this.organizations=[{id:"org-northstar",name:"Northstar Labs",domain:"northstar.example"}];
    this.groups=[
      {id:"group-engineering",organizationId:"org-northstar",name:"Engineering",role:"developer",privileged:false},
      {id:"group-production",organizationId:"org-northstar",name:"Production Operators",role:"production-admin",privileged:true},
      {id:"group-finance",organizationId:"org-northstar",name:"Finance",role:"billing-viewer",privileged:false}
    ];
    this.users=[
      {id:"user-alice",externalId:"scim-1001",organizationId:"org-northstar",email:"alice@northstar.example",name:"Alice Chen",department:"Engineering",status:"ACTIVE",createdAt:addDays(-240,now),updatedAt:addDays(-2,now)},
      {id:"user-bob",externalId:"scim-1002",organizationId:"org-northstar",email:"bob@northstar.example",name:"Bob Rivera",department:"Finance",status:"ACTIVE",createdAt:addDays(-120,now),updatedAt:addDays(-1,now)},
      {id:"user-maya",externalId:"scim-1003",organizationId:"org-northstar",email:"maya@northstar.example",name:"Maya Patel",department:"Engineering",status:"SUSPENDED",createdAt:addDays(-80,now),updatedAt:addHours(-6,now)}
    ];
    this.memberships=[
      {id:"membership-alice-eng",userId:"user-alice",groupId:"group-engineering",source:"SCIM",createdAt:addDays(-200,now)},
      {id:"membership-alice-prod",userId:"user-alice",groupId:"group-production",source:"SCIM",createdAt:addDays(-90,now)},
      {id:"membership-bob-fin",userId:"user-bob",groupId:"group-finance",source:"SCIM",createdAt:addDays(-100,now)}
    ];
    this.entitlements=[
      {id:"ent-source",name:"Source repositories",resource:"github/northstar",risk:"LOW"},
      {id:"ent-prod",name:"Production console",resource:"cloud/prod",risk:"HIGH"},
      {id:"ent-billing",name:"Billing reports",resource:"finance/reports",risk:"MEDIUM"},
      {id:"ent-support",name:"Customer support",resource:"support/admin",risk:"HIGH"}
    ];
    this.grants=[
      {id:"grant-alice-source",userId:"user-alice",entitlementId:"ent-source",reason:"Engineering group",source:"GROUP",status:"ACTIVE",startsAt:addDays(-200,now),expiresAt:null,revokedAt:null},
      {id:"grant-alice-prod",userId:"user-alice",entitlementId:"ent-prod",reason:"Production Operators group",source:"GROUP",status:"ACTIVE",startsAt:addDays(-90,now),expiresAt:null,revokedAt:null},
      {id:"grant-bob-billing",userId:"user-bob",entitlementId:"ent-billing",reason:"Finance group",source:"GROUP",status:"ACTIVE",startsAt:addDays(-100,now),expiresAt:null,revokedAt:null},
      {id:"grant-bob-support",userId:"user-bob",entitlementId:"ent-support",reason:"Incident INC-481",source:"JIT",status:"ACTIVE",startsAt:addHours(-1,now),expiresAt:addHours(3,now),revokedAt:null}
    ];
    this.sessions=[
      {id:"session-alice",userId:"user-alice",provider:"OIDC",ip:"10.20.1.14",status:"ACTIVE",issuedAt:addHours(-2,now),expiresAt:addHours(6,now),revokedAt:null},
      {id:"session-bob",userId:"user-bob",provider:"OIDC",ip:"10.20.2.9",status:"ACTIVE",issuedAt:addHours(-1,now),expiresAt:addHours(7,now),revokedAt:null},
      {id:"session-maya",userId:"user-maya",provider:"OIDC",ip:"10.20.1.38",status:"REVOCATION_PENDING",issuedAt:addHours(-8,now),expiresAt:addHours(1,now),revokedAt:null}
    ];
    this.syncEvents=[];this.campaigns=[];this.reviewItems=[];this.jobs=[];this.audit=[];this.processed=new Set();this.failNextJob=false;
    this.ensureJob("REVOCATION_PROPAGATION",{userId:"user-maya"},"seed:maya-revocation");
    this.createReview("Quarterly privileged access",addDays(7,now),true,now);
    this.audit=[];this.createAudit("DEMO_SEEDED","system",{users:this.users.length,grants:this.grants.length});
  }

  createAudit(action:string,actor:string,details:Record<string,unknown>){const row={id:id("audit"),action,actor,details,at:iso()};this.audit.unshift(row);return row}
  findUser(userId:string){const user=this.users.find(row=>row.id===userId);assertCondition(user,"user not found");return user}
  findGroup(groupId:string){const group=this.groups.find(row=>row.id===groupId);assertCondition(group,"group not found");return group}
  findGrant(grantId:string){const grant=this.grants.find(row=>row.id===grantId);assertCondition(grant,"grant not found");return grant}

  ingest(input:SyncInput){
    const source=input.source||"scim";const key=syncKey(source,input.eventId);if(this.processed.has(key))return {duplicate:true};
    let subject=input.userId||input.externalId||input.email||"unknown";let status:"APPLIED"|"REJECTED"="APPLIED",reason:string|null=null;
    try{
      if(input.operation==="UPSERT_USER"){
        assertCondition(input.externalId&&input.email&&input.name,"externalId, email, and name are required");
        let user=this.users.find(row=>row.externalId===input.externalId);
        if(user){user.email=input.email;user.name=input.name;user.department=input.department||user.department;user.status="ACTIVE";user.updatedAt=iso();}
        else {user={id:id("user"),externalId:input.externalId,organizationId:this.organizations[0].id,email:input.email,name:input.name,department:input.department||"Unassigned",status:"ACTIVE",createdAt:iso(),updatedAt:iso()};this.users.push(user)}
        subject=user.id;
      } else if(input.operation==="ADD_MEMBERSHIP"){
        const user=this.findUser(String(input.userId)),group=this.findGroup(String(input.groupId));subject=user.id;
        if(!this.memberships.some(row=>row.userId===user.id&&row.groupId===group.id))this.memberships.push({id:id("membership"),userId:user.id,groupId:group.id,source:"SCIM",createdAt:iso()});
      } else if(input.operation==="REMOVE_MEMBERSHIP"){
        const user=this.findUser(String(input.userId)),group=this.findGroup(String(input.groupId));subject=user.id;
        this.memberships=this.memberships.filter(row=>!(row.userId===user.id&&row.groupId===group.id));
      } else if(input.operation==="DEPROVISION_USER") this.deprovision(String(input.userId),"scim-sync");
    } catch(error){status="REJECTED";reason=(error as Error).message}
    const event:SyncEvent={id:id("sync"),eventId:input.eventId,source,operation:input.operation,status,subject,reason,receivedAt:iso()};
    this.syncEvents.unshift(event);this.processed.add(key);this.createAudit(`SYNC_${status}`,source,{eventId:event.eventId,operation:event.operation,subject,reason});
    return {duplicate:false,event};
  }

  suspend(userId:string,actor="admin-console"){
    const user=this.findUser(userId);assertCondition(user.status!=="DEPROVISIONED","deprovisioned user cannot be suspended");user.status="SUSPENDED";user.updatedAt=iso();
    for(const session of this.sessions.filter(row=>row.userId===userId&&row.status==="ACTIVE"))session.status="REVOCATION_PENDING";
    this.ensureJob("REVOCATION_PROPAGATION",{userId},`suspend:${userId}:${iso().slice(0,13)}`);this.createAudit("USER_SUSPENDED",actor,{userId});return user;
  }

  reactivate(userId:string,actor="admin-console"){
    const user=this.findUser(userId);assertCondition(user.status==="SUSPENDED","only suspended users can be reactivated");user.status="ACTIVE";user.updatedAt=iso();this.createAudit("USER_REACTIVATED",actor,{userId});return user;
  }

  deprovision(userId:string,actor="admin-console"){
    const user=this.findUser(userId);if(user.status==="DEPROVISIONED")return user;user.status="DEPROVISIONED";user.updatedAt=iso();
    for(const session of this.sessions.filter(row=>row.userId===userId&&row.status==="ACTIVE"))session.status="REVOCATION_PENDING";
    for(const grant of this.grants.filter(row=>row.userId===userId&&row.status==="ACTIVE"))grant.status="PENDING_REVOKE";
    this.memberships=this.memberships.filter(row=>row.userId!==userId);this.ensureJob("REVOCATION_PROPAGATION",{userId},`deprovision:${userId}`);this.createAudit("USER_DEPROVISIONED",actor,{userId});return user;
  }

  openSession(userId:string,ip:string){const user=this.findUser(userId);assertCondition(user.status==="ACTIVE","user is not active");const session:Session={id:id("session"),userId,provider:"OIDC",ip,status:"ACTIVE",issuedAt:iso(),expiresAt:addHours(8),revokedAt:null};this.sessions.unshift(session);this.createAudit("SESSION_ISSUED","oidc-provider",{userId,sessionId:session.id});return session}

  grantJit(userId:string,entitlementId:string,hours:number,reason:string,actor="admin-console"){
    const user=this.findUser(userId);assertCondition(user.status==="ACTIVE","user is not active");assertCondition(this.entitlements.some(row=>row.id===entitlementId),"entitlement not found");assertCondition(Number.isFinite(hours)&&hours>0&&hours<=24,"duration must be between 1 and 24 hours");assertCondition(reason.trim(),"reason is required");
    const grant:AccessGrant={id:id("grant"),userId,entitlementId,reason,source:"JIT",status:"ACTIVE",startsAt:iso(),expiresAt:addHours(hours),revokedAt:null};this.grants.unshift(grant);this.createAudit("JIT_ACCESS_GRANTED",actor,{userId,entitlementId,hours,grantId:grant.id});return grant;
  }

  revokeGrant(grantId:string,actor="admin-console"){
    const grant=this.findGrant(grantId);if(grant.status==="REVOKED"||grant.status==="EXPIRED")return grant;grant.status="PENDING_REVOKE";
    this.ensureJob("REVOCATION_PROPAGATION",{userId:grant.userId,grantId},`grant:${grantId}`);this.createAudit("ACCESS_REVOCATION_REQUESTED",actor,{grantId,userId:grant.userId});return grant;
  }

  expireAccess(asOf:string|Date=new Date()){
    let expired=0;for(const grant of this.grants){if(grant.status==="ACTIVE"&&grant.expiresAt&&new Date(grant.expiresAt)<=new Date(asOf)){grant.status="EXPIRED";grant.revokedAt=iso(asOf);expired++;}}
    let sessions=0;for(const session of this.sessions){if(session.status==="ACTIVE"&&new Date(session.expiresAt)<=new Date(asOf)){session.status="EXPIRED";sessions++;}}
    this.createAudit("ACCESS_EXPIRY_SCAN","worker:expiry",{expired,sessions});return {expired,sessions};
  }

  createReview(name:string,dueAt:string|Date,privilegedOnly=true,now:string|Date=new Date()){
    assertCondition(name.trim(),"campaign name is required");const campaign:ReviewCampaign={id:id("review"),name,status:"OPEN",dueAt:iso(dueAt),createdAt:iso(now),completedAt:null};this.campaigns.unshift(campaign);
    const grants=this.grants.filter(grant=>grant.status==="ACTIVE"&&(!privilegedOnly||this.entitlements.find(row=>row.id===grant.entitlementId)?.risk==="HIGH"));
    for(const grant of grants)this.reviewItems.push({id:id("item"),campaignId:campaign.id,grantId:grant.id,userId:grant.userId,entitlementId:grant.entitlementId,decision:"PENDING",reviewer:null,decidedAt:null,note:null});
    this.createAudit("ACCESS_REVIEW_CREATED","governance",{campaignId:campaign.id,items:grants.length});return campaign;
  }

  decideReview(itemId:string,decision:Exclude<ReviewDecision,"PENDING">,reviewer:string,note=""){
    const item=this.reviewItems.find(row=>row.id===itemId);assertCondition(item,"review item not found");const campaign=this.campaigns.find(row=>row.id===item.campaignId);assertCondition(campaign?.status==="OPEN","campaign is closed");assertCondition(reviewer.trim(),"reviewer is required");
    item.decision=decision;item.reviewer=reviewer;item.decidedAt=iso();item.note=note||null;if(decision==="REVOKED")this.revokeGrant(item.grantId,`reviewer:${reviewer}`);this.createAudit("ACCESS_REVIEW_DECIDED",reviewer,{itemId,decision});return item;
  }

  completeReview(campaignId:string){const campaign=this.campaigns.find(row=>row.id===campaignId);assertCondition(campaign,"campaign not found");const items=this.reviewItems.filter(row=>row.campaignId===campaignId);assertCondition(items.length>0,"campaign has no review items");assertCondition(items.every(row=>row.decision!=="PENDING"),"all review items must be decided");campaign.status="COMPLETED";campaign.completedAt=iso();this.createAudit("ACCESS_REVIEW_COMPLETED","governance",{campaignId,items:items.length});return campaign}

  ensureJob(kind:LifecycleJob["kind"],payload:LifecycleJob["payload"]={},dedupeKey=`${kind}:${iso().slice(0,13)}:${JSON.stringify(payload)}`){const existing=this.jobs.find(row=>row.dedupeKey===dedupeKey);if(existing)return existing;const job:LifecycleJob={id:id("job"),kind,status:"QUEUED",attempts:0,maxAttempts:3,dedupeKey,payload,queuedAt:iso(),completedAt:null,lastError:null};this.jobs.unshift(job);return job}

  dispatchNextJob(){
    const job=this.jobs.find(row=>row.status==="QUEUED"||row.status==="RETRY");if(!job)return {processed:false};job.status="RUNNING";job.attempts++;
    if(this.failNextJob){this.failNextJob=false;job.status=job.attempts>=job.maxAttempts?"DEAD":"RETRY";job.lastError="simulated downstream identity provider timeout";this.createAudit("JOB_RETRY_SCHEDULED","worker",{jobId:job.id,attempt:job.attempts});return {processed:true,job}}
    if(job.kind==="REVOCATION_PROPAGATION"){
      const userId=String(job.payload.userId||"");for(const session of this.sessions.filter(row=>row.userId===userId&&row.status==="REVOCATION_PENDING")){session.status="REVOKED";session.revokedAt=iso()}
      const grantId=job.payload.grantId?String(job.payload.grantId):null;for(const grant of this.grants.filter(row=>row.userId===userId&&row.status==="PENDING_REVOKE"&&(!grantId||row.id===grantId))){grant.status="REVOKED";grant.revokedAt=iso()}
    }
    if(job.kind==="ACCESS_EXPIRY")this.expireAccess();
    job.status="COMPLETED";job.completedAt=iso();job.lastError=null;this.createAudit("JOB_COMPLETED","worker",{jobId:job.id,kind:job.kind});return {processed:true,job};
  }

  drainJobs(max=50){let processed=0,completed=0;while(processed<max){const result=this.dispatchNextJob();if(!result.processed||!result.job)break;processed++;if(result.job.status==="COMPLETED")completed++;if(result.job.status==="RETRY")continue}return {processed,completed}}

  snapshot(){
    const activeGrants=this.grants.filter(row=>row.status==="ACTIVE");const reviewItems=this.reviewItems.map(item=>({...item,user:this.users.find(row=>row.id===item.userId),entitlement:this.entitlements.find(row=>row.id===item.entitlementId)}));
    return {organizations:this.organizations,groups:this.groups,users:this.users,memberships:this.memberships,entitlements:this.entitlements,grants:this.grants,sessions:this.sessions,syncEvents:this.syncEvents,campaigns:this.campaigns,reviewItems,jobs:this.jobs,audit:this.audit,metrics:{activeUsers:this.users.filter(row=>row.status==="ACTIVE").length,privilegedUsers:new Set(activeGrants.filter(grant=>this.entitlements.find(row=>row.id===grant.entitlementId)?.risk==="HIGH").map(grant=>grant.userId)).size,activeSessions:this.sessions.filter(row=>row.status==="ACTIVE").length,pendingRevocations:this.sessions.filter(row=>row.status==="REVOCATION_PENDING").length+this.grants.filter(row=>row.status==="PENDING_REVOKE").length,expiringGrants:activeGrants.filter(row=>row.expiresAt).length,openReviews:this.reviewItems.filter(row=>row.decision==="PENDING").length,queuedJobs:this.jobs.filter(row=>row.status==="QUEUED"||row.status==="RETRY").length,syncFailures:this.syncEvents.filter(row=>row.status==="REJECTED").length}};
  }

  exportState(){return {organizations:this.organizations,groups:this.groups,users:this.users,memberships:this.memberships,entitlements:this.entitlements,grants:this.grants,sessions:this.sessions,syncEvents:this.syncEvents,campaigns:this.campaigns,reviewItems:this.reviewItems,jobs:this.jobs,audit:this.audit,processed:[...this.processed]}}
  importState(state:Record<string,unknown>){this.organizations=(state.organizations as Organization[])||[];this.groups=(state.groups as Group[])||[];this.users=(state.users as User[])||[];this.memberships=(state.memberships as Membership[])||[];this.entitlements=(state.entitlements as Entitlement[])||[];this.grants=(state.grants as AccessGrant[])||[];this.sessions=(state.sessions as Session[])||[];this.syncEvents=(state.syncEvents as SyncEvent[])||[];this.campaigns=(state.campaigns as ReviewCampaign[])||[];this.reviewItems=(state.reviewItems as ReviewItem[])||[];this.jobs=(state.jobs as LifecycleJob[])||[];this.audit=(state.audit as Audit[])||[];this.processed=new Set((state.processed as string[])||[])}
}

export function createSeededLifecycle(now:Date=new Date()){const lifecycle=new IdentityLifecycle();lifecycle.seed(now);return lifecycle}
