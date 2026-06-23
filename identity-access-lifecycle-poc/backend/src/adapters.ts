import {Kafka,type Consumer,type Producer} from "kafkajs";
import pg from "pg";
import {createClient,type RedisClientType} from "redis";

type Message={topic:string;key:string;value:Record<string,unknown>};

export class Infrastructure {
  mode="memory";kafkaMode="memory";postgresMode="memory";redisMode="memory";messages:Message[]=[];
  producer:Producer|null=null;consumer:Consumer|null=null;pool:pg.Pool|null=null;redis:RedisClientType|null=null;private state:Record<string,unknown>|null=null;
  async connect(){await Promise.all([this.connectDb(),this.connectRedis(),this.connectKafka()]);this.mode=[this.postgresMode,this.redisMode,this.kafkaMode].join("+");return this}
  async connectDb(){const url=process.env.IDENTITY_DATABASE_URL||"memory://";if(url==="memory://")return;try{this.pool=new pg.Pool({connectionString:url});await this.pool.query(`CREATE TABLE IF NOT EXISTS identity_snapshots(id TEXT PRIMARY KEY,state JSONB NOT NULL,updated_at TIMESTAMPTZ DEFAULT NOW())`);await this.pool.query(`CREATE TABLE IF NOT EXISTS identity_events(event_key TEXT PRIMARY KEY,topic TEXT NOT NULL,payload JSONB NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW())`);this.postgresMode="postgres"}catch(error){console.warn(`PostgreSQL unavailable (${(error as Error).message}); using memory`);await this.closeDb()}}
  async connectRedis(){const url=process.env.IDENTITY_REDIS_URL||"memory://";if(url==="memory://")return;try{this.redis=createClient({url});await this.redis.connect();this.redisMode="redis"}catch(error){console.warn(`Redis unavailable (${(error as Error).message}); using memory`);await this.closeRedis()}}
  async connectKafka(){const brokers=(process.env.IDENTITY_KAFKA_BROKERS||"memory://").split(",");if(brokers.includes("memory://"))return;try{const kafka=new Kafka({clientId:"identity-lifecycle",brokers});this.producer=kafka.producer();this.consumer=kafka.consumer({groupId:"identity-lifecycle-poc"});await this.producer.connect();await this.consumer.connect();this.kafkaMode="kafka"}catch(error){console.warn(`Kafka unavailable (${(error as Error).message}); using memory`);await this.closeKafka()}}
  async publish(topic:string,key:string,value:Record<string,unknown>){if(this.producer){await this.producer.send({topic,messages:[{key,value:JSON.stringify(value)}]});return}this.messages.push({topic,key,value:structuredClone(value)})}
  async consume(topic:string,handler:(message:Record<string,unknown>)=>Promise<void>){if(!this.consumer)return;await this.consumer.subscribe({topic,fromBeginning:false});await this.consumer.run({eachMessage:async({message})=>{if(message.value)await handler(JSON.parse(message.value.toString()))}})}
  async drain(topic:string,handler:(message:Record<string,unknown>)=>Promise<void>){let processed=0;const remaining:Message[]=[];for(const message of this.messages){if(message.topic===topic){await handler(message.value);processed++}else remaining.push(message)}this.messages=remaining;return {processed}}
  async save(state:Record<string,unknown>){this.state=structuredClone(state);if(this.pool)await this.pool.query(`INSERT INTO identity_snapshots(id,state,updated_at)VALUES('demo',$1::jsonb,NOW())ON CONFLICT(id)DO UPDATE SET state=EXCLUDED.state,updated_at=NOW()`,[JSON.stringify(state)]);if(this.redis)await this.redis.setEx("identity:snapshot",300,JSON.stringify(state))}
  async load(){if(this.pool){const result=await this.pool.query("SELECT state FROM identity_snapshots WHERE id='demo'");return result.rows[0]?.state||null}return this.state}
  async append(topic:string,key:string,payload:Record<string,unknown>){if(this.pool)await this.pool.query(`INSERT INTO identity_events(event_key,topic,payload)VALUES($1,$2,$3::jsonb)ON CONFLICT DO NOTHING`,[key,topic,JSON.stringify(payload)])}
  async closeKafka(){if(this.consumer)await this.consumer.disconnect().catch(()=>{});if(this.producer)await this.producer.disconnect().catch(()=>{});this.consumer=null;this.producer=null}
  async closeRedis(){if(this.redis?.isOpen)await this.redis.quit().catch(()=>{});this.redis=null}
  async closeDb(){if(this.pool)await this.pool.end().catch(()=>{});this.pool=null}
  async close(){await Promise.all([this.closeKafka(),this.closeRedis(),this.closeDb()])}
}
