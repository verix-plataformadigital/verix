declare const Deno: any;

const ALLOWED_ORIGINS = new Set([
  "https://verix-plataformadigital.github.io",
  "https://verix.vxops.workers.dev",
  "http://localhost",
  "http://127.0.0.1"
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "",
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Frame-Options": "DENY"
  };
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// This must match the major.minor release in package.json; guarded by telemetry integrity tests.
const CURRENT_APP_VERSION = "1.5";
function canonicalAppVersion(value: unknown): string {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d+)\.(\d+)(?:\.\d+)?(?:[-+].*)?$/);
  return match ? `${match[1]}.${match[2]}` : raw;
}

function json(data: unknown, status=200, req?: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers:{
      "Content-Type":"application/json",
      ...corsHeaders(req || new Request("https://verix-plataformadigital.github.io"))
    }
  });
}

function b64Bytes(s: string) {
  const binary = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function hmac(body: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {name:"HMAC",hash:"SHA-256"},
    false,
    ["verify"]
  );
  return key;
}

async function verifyToken(req: Request) {
  try {
  const auth = req.headers.get("Authorization") || "";
  const raw = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const parts = raw.split(".");
  if (parts.length !== 2) return false;

  const secret = Deno.env.get("VERIX_ADMIN_SECRET") || "";
  if (!secret) return false;

  const key = await hmac(parts[0], secret);
  const sig = b64Bytes(parts[1]);

  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    new TextEncoder().encode(parts[0])
  );
  if (!ok) return false;

  const payloadBinary = b64Bytes(parts[0]);
  const payload = JSON.parse(new TextDecoder().decode(payloadBinary));

  return payload?.scope === "admin"
    && Number(payload?.exp || 0) > Math.floor(Date.now() / 1000);
  } catch (_) {
    return false;
  }
}

async function rpc(name: string, body: Record<string,unknown>) {
  const r = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method:"POST",
    headers:{
      apikey:serviceKey,
      Authorization:`Bearer ${serviceKey}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify(body)
  });

  const t = await r.text();

  if(!r.ok) {
    throw new Error(`${name}: ${t || r.status}`);
  }

  return t ? JSON.parse(t) : null;
}



function n(v:unknown):number|null{const x=Number(v);return Number.isFinite(x)?x:null;}
function cinSnapshotOf(e:any):any{
  const c=e?.metadata?.cin;
  return c && typeof c==="object" && !Array.isArray(c) ? c : null;
}
function percentile(values:number[],p:number):number|null{
  const a=values.filter((value:number)=>Number.isFinite(value)).sort((x:number,y:number)=>x-y);
  if(!a.length)return null;
  const i=(a.length-1)*p, lo=Math.floor(i), hi=Math.ceil(i);
  return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(i-lo);
}
function sessionPattern(rows:any[]){
  const speedRows=rows.filter((e:any)=>e.event==="cinemometer_speed_entry" && cinSnapshotOf(e)?.velocidade_registada!=null);
  const calculationRows=rows.filter((e:any)=>e.event==="cinemometer_calculation" && cinSnapshotOf(e)?.velocidade_registada!=null);
  const measurements=speedRows.length?speedRows:calculationRows;
  const speeds:number[]=measurements.map((e:any)=>Number(cinSnapshotOf(e).velocidade_registada)).filter((value:number)=>Number.isFinite(value));
  const unique=[...new Set(speeds)];
  const times:number[]=measurements.map((e:any)=>new Date(e.occurred_at).getTime()).filter((value:number)=>Number.isFinite(value)).sort((a:number,b:number)=>a-b);
  const intervals=[]; for(let i=1;i<times.length;i++) intervals.push((times[i]-times[i-1])/1000);
  const round5=speeds.length?100*speeds.filter((v:number)=>v%5===0).length/speeds.length:null;
  const round10=speeds.length?100*speeds.filter((v:number)=>v%10===0).length/speeds.length:null;
  const repeats=speeds.length>1?100*(1-unique.length/speeds.length):0;
  let monotonic=true, direction=0;
  for(let i=1;i<speeds.length;i++){
    const d=speeds[i]-speeds[i-1];
    if(d===0)continue;
    if(direction===0)direction=d>0?1:-1;
    else if((d>0?1:-1)!==direction){monotonic=false;break;}
  }
  const counts=new Map<number,number>(); speeds.forEach(v=>counts.set(v,(counts.get(v)||0)+1));
  const top=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,2);
  let alternating2=false;
  if(speeds.length>=6 && top.length===2){
    alternating2=speeds.every((v,i)=>i%2===0?v===top[0][0]:v===top[1][0]) ||
                 speeds.every((v,i)=>i%2===0?v===top[1][0]:v===top[0][0]);
  }
  const copies=rows.filter((e:any)=>e.event==="cinemometer_copy_code"||e.event==="cinemometer_copy_text").length;
  const configCount=measurements.filter((e:any)=>cinSnapshotOf(e)?.aparelho_configurado===true).length;
  const operatorCount=measurements.filter((e:any)=>cinSnapshotOf(e)?.operador_identificado===true).length;
  const first=times[0]??null, last=times[times.length-1]??first;
  const durationMin=first!=null&&last!=null?Math.max(0,(last-first)/60000):0;
  const flags:string[]=[];
  if(speeds.length<3)flags.push("poucos_dados");
  if(speeds.length>=5 && unique.length===1)flags.push("todas_velocidades_iguais");
  if(speeds.length>=6 && alternating2)flags.push("alternancia_de_2_valores");
  if(speeds.length>=6 && monotonic && unique.length>=4)flags.push("sequencia_monotona");
  if(speeds.length>=8 && round5!=null && round5>=80)flags.push("forte_concentracao_em_multiplos_de_5");
  const medInt=percentile(intervals,.5);
  if(speeds.length>=6 && medInt!=null && medInt<2)flags.push("intervalos_muito_curto");
  let pattern="dados_insuficientes";
  if(speeds.length>=3){
    const hasOperationalEvidence=durationMin>=1 || copies>0 || rows.some((e:any)=>!!cinSnapshotOf(e)?.operador_identificado) || rows.some((e:any)=>!!cinSnapshotOf(e)?.aparelho_configurado);
    pattern=flags.length ? "padrao_atipico_a_rever" : (hasOperationalEvidence ? "compativel_com_uso_operacional" : "atividade_curta_sem_contexto");
  }
  const latest=measurements.length?cinSnapshotOf(measurements[measurements.length-1]):(cinSnapshotOf(rows[rows.length-1])||{});
  return {
    calculations:speeds.length,
    raw_calculation_events:calculationRows.length,
    speed_entry_events:speedRows.length,
    config_coverage_pct:measurements.length?100*configCount/measurements.length:null,
    operator_coverage_pct:measurements.length?100*operatorCount/measurements.length:null,
    speed_sequence:speeds.slice(0,60),
    unique_speeds:unique.length,
    min_speed:speeds.length?Math.min(...speeds):null,
    max_speed:speeds.length?Math.max(...speeds):null,
    avg_speed:speeds.length?speeds.reduce((a,b)=>a+b,0)/speeds.length:null,
    speed_p50:percentile(speeds,.5),
    round5_pct:round5,
    round10_pct:round10,
    repeated_speed_pct:repeats,
    median_interval_s:medInt,
    duration_min:durationMin,
    copies,
    pattern,
    flags,
    operator:{
      nome:latest?.operador_nome||null,
      numero:latest?.operador_numero||null,
      posto:latest?.operador_posto||null,
      identificado:latest?.operador_identificado===true
    },
    aparelho:{
      marca:latest?.aparelho_marca||null,
      modelo:latest?.aparelho_modelo||null,
      serie:latest?.aparelho_serie||null,
      configurado:latest?.aparelho_configurado===true
    },
    configuracao:{
      modo:latest?.modo||null,
      veiculo:latest?.veiculo||null,
      enquadramento:latest?.enquadramento||null,
      limite:latest?.limite??null,
      verificacao:latest?.verificacao||null
    }
  };
}

function windowStartTodayLisbon(now: string): string {
  const instant = new Date(now);
  const fmt = (date: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(date).map(part => [part.type, part.value]));
  const today = fmt(instant);
  const targetWall = Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day), 0, 0, 0, 0);
  let candidate = targetWall;
  // Resolve the Lisbon offset instead of assuming UTC+0/+1; this also handles DST transitions.
  for (let i = 0; i < 4; i++) {
    const local = fmt(new Date(candidate));
    const representedWall = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day),
      Number(local.hour), Number(local.minute), Number(local.second), 0);
    const delta = targetWall - representedWall;
    if (delta === 0) break;
    candidate += delta;
  }
  return new Date(candidate).toISOString();
}
async function loadInsuranceNoCases(now:string, pageLimit?:number, pageOffset=0){
  async function fetchPage(limit:number,offset:number){
    const qs = new URLSearchParams();
    qs.set("select","event_id,matricula,occurred_at,created_at,expires_at");
    qs.set("expires_at","gt."+now);
    // The 24-hour window starts when the server records the result, not when an
    // offline client originally generated its event. Existing rows are not rewritten.
    qs.set("created_at","gte."+new Date(Date.parse(now)-24*60*60*1000).toISOString());
    qs.set("order","occurred_at.desc,event_id.desc");
    qs.set("limit",String(limit));
    qs.set("offset",String(offset));
    const response = await fetch(supabaseUrl+"/rest/v1/verix_insurance_no_cases?"+qs.toString(),{
      headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey}
    });
    const text = await response.text();
    if(!response.ok) throw new Error("insurance_no_cases:"+text);
    const rows:any[] = text ? JSON.parse(text) : [];
    if(!Array.isArray(rows)) throw new Error("insurance_no_cases:invalid_page");
    return rows;
  }

  // New Admin clients load only one page initially, then fetch more on demand.
  // Older clients that omit pagination parameters retain the complete-list contract.
  if(pageLimit!==undefined){
    const safeLimit=Math.max(1,Math.min(101,Math.floor(Number(pageLimit)||101)));
    const safeOffset=Math.max(0,Math.min(1000000,Math.floor(Number(pageOffset)||0)));
    return await fetchPage(safeLimit,safeOffset);
  }

  const pageSize=1000, maxPages=100;
  const cases:any[]=[];
  for(let page=0;page<maxPages;page++){
    const rows=await fetchPage(pageSize,page*pageSize);
    cases.push(...rows);
    if(rows.length<pageSize)return cases;
  }
  throw new Error("insurance_no_cases_page_limit");
}
function buildErrorPlateCases(rows:any[],plateOf:(e:any)=>string,validPortuguesePlate:(value:unknown)=>boolean,shortId:(value:any)=>string){
  const errorPlateByQuery=new Map<string,{event:any;matricula:string}>();
  for(const e of rows){
    const plate=plateOf(e);
    // Validate before deduplication: a later incomplete retry must not hide a valid capture.
    if(!validPortuguesePlate(plate)) continue;
    const queryId=String(e?.query_id||e?.event_id||"");
    if(!queryId) continue;
    const previous=errorPlateByQuery.get(queryId);
    if(!previous || String(e?.occurred_at||"")>=String(previous.event?.occurred_at||"")){
      errorPlateByQuery.set(queryId,{event:e,matricula:plate});
    }
  }
  return [...errorPlateByQuery.values()].map(({event:e,matricula})=>{
    const a=e?.metadata?.asfDiagnostic||{};
    return {
      matricula:String(matricula).toUpperCase().replace(/[^A-Z0-9]/g,""),
      occurred_at:e?.occurred_at||null,
      error_type:a.asfErrorType||"unknown",
      http_status:a.asfHttpStatus??null,
      error_message:a.asfMessage||e?.metadata?.asfUserMessage||a.asfAttempts?.slice(-1)?.[0]?.message||null,
      browser:e?.browser||"Unknown",
      query_id:shortId(e?.query_id),
      app_version:e?.app_version||null,
      build_id:e?.metadata?.build_id||a.build_id||null
    };
  }).sort((a,b)=>String(b.occurred_at||"").localeCompare(String(a.occurred_at||""))).slice(0,100);
}

async function loadErrorInvestigation24h(now:string){
  const pageSize=1000, maxPages=100;
  const rows:any[]=[];
  const startAt=windowStartTodayLisbon(now);
  for(let page=0;page<maxPages;page++){
    const qs = new URLSearchParams();
    qs.set("select","event_id,occurred_at,event,installation_id,query_id,app_version,browser,metadata");
    qs.set("event","eq.vehicle_insurance_error");
    qs.set("occurred_at","gte."+startAt);
    qs.set("order","occurred_at.asc,event_id.asc");
    qs.set("limit",String(pageSize));
    qs.set("offset",String(page*pageSize));
    const rr=await fetch(supabaseUrl+"/rest/v1/verix2_events?"+qs.toString(),{headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey}});
    const tt=await rr.text();
    if(!rr.ok)throw new Error("error_investigation:"+tt);
    const pageRows=tt?JSON.parse(tt):[];
    if(!Array.isArray(pageRows))throw new Error("error_investigation:invalid_page");
    rows.push(...pageRows);
    if(pageRows.length<pageSize)break;
    if(page===maxPages-1)throw new Error("error_investigation:page_limit");
  }
  const currentVersionRows=rows.filter((e:any)=>canonicalAppVersion(e?.app_version)===CURRENT_APP_VERSION);
  const shortId=(v:any)=>{const s=String(v||"");return s.length>14?s.slice(0,8)+"…"+s.slice(-4):s;};
  type ErrorDimension = {queryIds:Set<string>;events:number};
  const byHash=new Map<string,ErrorDimension>(), byType=new Map<string,ErrorDimension>(), byInstall=new Map<string,ErrorDimension>();
  const bursts=new Map<string,ErrorDimension>();
  const addDimension=(map:Map<string,ErrorDimension>,key:string,queryId:unknown)=>{
    let bucket=map.get(key);
    if(!bucket){bucket={queryIds:new Set<string>(),events:0};map.set(key,bucket);}
    bucket.events++;
    if(queryId) bucket.queryIds.add(String(queryId));
  };
  for(const e of currentVersionRows){
    const a=e?.metadata?.asfDiagnostic||{}, hash=String(a.asfResponseHash||"sem-hash"), type=String(a.asfErrorType||"unknown"), inst=String(e?.installation_id||"unknown");
    addDimension(byHash,hash,e?.query_id); addDimension(byType,type,e?.query_id); addDimension(byInstall,inst,e?.query_id);
    const t=new Date(e.occurred_at).getTime();
    if(Number.isFinite(t)){
      const k=new Date(Math.floor(t/300000)*300000).toISOString();
      addDimension(bursts,k,e?.query_id);
    }
  }
  const hashRows=[...byHash.entries()].map(([hash,b])=>({hash,count:b.queryIds.size,event_count:b.events})).sort((a,b)=>b.count-a.count||b.event_count-a.event_count).slice(0,10);
  const typeRows=[...byType.entries()].map(([type,b])=>({type,count:b.queryIds.size,event_count:b.events})).sort((a,b)=>b.count-a.count||b.event_count-a.event_count);
  const installRows=[...byInstall.entries()].map(([installation_id,b])=>({installation_id:shortId(installation_id),count:b.queryIds.size,event_count:b.events})).sort((a,b)=>b.count-a.count||b.event_count-a.event_count).slice(0,10);
  const burstRows=[...bursts.entries()].map(([start,b])=>({start,count:b.queryIds.size,event_count:b.events})).sort((a,b)=>b.count-a.count||b.event_count-a.event_count).slice(0,12);
  const normalizePlate=(value:unknown)=>String(value??"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  const validPortuguesePlate=(value:unknown)=>{
    const plate=normalizePlate(value);
    // Match public.verix2_is_portuguese_plate_format exactly.
    // Historical series excluded K, W and Y; 2020+ AA-01-AA series
    // exclude the reserved 00 sequence and most vowels at positions 2/6.
    if(/^(?:[A-JL-VXZ]{2}[0-9]{4}|[0-9]{4}[A-JL-VXZ]{2}|[0-9]{2}[A-JL-VXZ]{2}[0-9]{2})$/.test(plate)) return true;
    if(!/^[A-Z]{2}[0-9]{2}[A-Z]{2}$/.test(plate) || plate.slice(2,4)==="00") return false;
    const second=plate.slice(1,2), sixth=plate.slice(5,6);
    const secondAllowed=!/^[AEIOU]$/.test(second)||(plate[0]===second&&/^[AEIOU]$/.test(second));
    const sixthAllowed=!/^[AEIOU]$/.test(sixth)||(plate[4]===sixth&&/^[AEIOU]$/.test(sixth));
    return secondAllowed&&sixthAllowed;
  };
  const plateOf=(e:any)=>{
    const candidates=[e?.metadata?.matriculaCapturada,e?.metadata?.asfDiagnostic?.matricula,e?.metadata?.matriculaNormalizada,e?.metadata?.matricula];
    const normalized=candidates.map((value:any)=>String(value??"").trim().toUpperCase().replace(/[^A-Z0-9 -]/g,"").slice(0,30)).filter((value:string)=>value.length>0);
    // Prefer any complete Portuguese registration over a partial OCR/input fragment.
    return normalized.find((value:string)=>validPortuguesePlate(value))||normalized[0]||"";
  };
  const latestErrorByQuery=new Map<string,any>();
  for(const e of currentVersionRows){
    const queryId=String(e?.query_id||"");
    if(!queryId) continue;
    const previous=latestErrorByQuery.get(queryId);
    if(!previous || String(e?.occurred_at||"")>=String(previous?.occurred_at||"")) latestErrorByQuery.set(queryId,e);
  }
  const plateCases=[...latestErrorByQuery.values()].map((e:any)=>{
    const plate=plateOf(e),a=e?.metadata?.asfDiagnostic||{};
    return {matricula:plate||"Não capturada",plate_kind:!plate?"missing":validPortuguesePlate(plate)?"portuguese":"unverified",occurred_at:e?.occurred_at||null,error_type:a.asfErrorType||"unknown",browser:e?.browser||"Unknown",query_id:shortId(e?.query_id)};
  }).sort((a:any,b:any)=>String(a.occurred_at||"").localeCompare(String(b.occurred_at||""))).slice(-100).reverse();
  const recent=currentVersionRows.slice(-12).reverse().map((e:any)=>{
     const a=e?.metadata?.asfDiagnostic||{},client=e?.metadata?.client||{},plate=plateOf(e);
     const attempts=Array.isArray(a.asfAttempts)?a.asfAttempts.slice(-6).map((t:any)=>({
       type:String(t?.errorType|| (t?.status!=null?"http_"+t.status:"unknown")).slice(0,40),
       status:t?.status??null,
       duration_ms:t?.durationMs??null,
       response_bytes:t?.responseBytes??null
     })):[];
     return {
       occurred_at:e?.occurred_at||null,installation_id:shortId(e?.installation_id),query_id:shortId(e?.query_id),
       browser:e?.browser||"Unknown",matricula:plate||null,
       captured_plate_length:plate?plate.toUpperCase().replace(/[^A-Z0-9]/g,"").length:null,
       client_online:typeof client.online==="boolean"?client.online:null,
       client_effective_type:client.effectiveType||null,client_rtt_ms:client.rttMs??null,
       error_type:a.asfErrorType||"unknown",transport:a.asfTransport||null,
       relay_latency_ms:a.asfRelayLatencyMs??null,http_status:a.asfHttpStatus??null,
       duration_ms:a.asfDurationMs??null,response_hash:a.asfResponseHash||null,
       response_class:a.asfResponseClass||null,graphql_error_count:a.asfGraphqlErrorCount??null,
       response_bytes:a.asfResponseBytes??null,parse_path:a.asfParsePath||null,
       attempts,build_id:e?.metadata?.build_id||a.build_id||null
     };
   });
  return {generated_at:now,current_app_version:CURRENT_APP_VERSION,errors_24h:rows.length,error_queries_24h:new Set(rows.map((e:any)=>String(e?.query_id||"")).filter(Boolean)).size,current_version_errors:new Set(currentVersionRows.map((e:any)=>String(e?.query_id||"")).filter(Boolean)).size,current_version_error_events:currentVersionRows.length,current_version_installations:new Set(currentVersionRows.map((e:any)=>String(e?.installation_id||""))).size,current_version_plates:new Set(currentVersionRows.map((e:any)=>plateOf(e)).filter((p:string)=>validPortuguesePlate(p))).size,current_version_hashes:byHash.size,current_version_types:typeRows,current_version_hashes_top:hashRows,current_version_installations_top:installRows,current_version_bursts_5m:burstRows,current_version_plate_cases:plateCases,error_plate_cases_24h:buildErrorPlateCases(rows,plateOf,validPortuguesePlate,shortId),latest_current_version:recent};
}
async function loadLifetime(now:string){
  async function resetAllAt(){
    const q=new URLSearchParams({select:"reset_all_at",singleton:"eq.true",limit:"1"});
    const r=await fetch(supabaseUrl+"/rest/v1/verix2_dashboard_state?"+q.toString(),{headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey}});
    if(!r.ok) throw new Error("lifetime_reset:"+await r.text());
    const rows=JSON.parse((await r.text())||"[]");
    return rows?.[0]?.reset_all_at || "1970-01-01T00:00:00Z";
  }
  const startAt=await resetAllAt();
  async function count(path:string,field:string){
    const q=new URLSearchParams({select:"*",limit:"1"}); q.set(field,"gte."+startAt);
    const r=await fetch(supabaseUrl+"/rest/v1/"+path+"?"+q.toString(),{headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey,Prefer:"count=exact"}});
    if(!r.ok)throw new Error("lifetime_count:"+path+":"+await r.text());
    const range=r.headers.get("content-range")||"";const m=range.match(/\/(\d+)$/);return m?Number(m[1]):0;
  }
  const eventsTotal=await count("verix2_events","occurred_at");
  const installationsTotal=await count("verix2_installations","first_seen");
  const sessionsTotal=await count("verix2_sessions","started_at");
  async function edge(order:string){
    const q=new URLSearchParams({select:"occurred_at",order,limit:"1"});q.set("occurred_at","gte."+startAt);
    const r=await fetch(supabaseUrl+"/rest/v1/verix2_events?"+q.toString(),{headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey}});
    const t=r.ok?await r.text():"[]";const rows=t?JSON.parse(t):[];return rows?.[0]?.occurred_at||null;
  }
  return {generated_at:now,reset_all_at:startAt,events_total:eventsTotal,installations_total:installationsTotal,sessions_total:sessionsTotal,first_event_at:await edge("occurred_at.asc"),last_event_at:await edge("occurred_at.desc")};
}
async function loadCinemometerAnalytics24h(now:string){
  const qs = new URLSearchParams();
  qs.set("select","occurred_at,event,session_id,installation_id,app_version,browser,metadata");
  qs.set("event","in.(cinemometer_speed_entry,cinemometer_calculation,cinemometer_copy_code,cinemometer_copy_text,cinemometer_copy_location,cinemometer_profile_select,cinemometer_profile_new,cinemometer_profile_duplicate,cinemometer_profile_delete,cinemometer_profile_save)");
  qs.set("occurred_at","gte." + windowStartTodayLisbon(now));
  qs.set("order","occurred_at.asc");
  qs.set("limit","5000");
  const rr=await fetch(supabaseUrl+"/rest/v1/verix2_events?"+qs.toString(),{headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey}});
  const tt=await rr.text();
  if(!rr.ok)throw new Error("cin_analytics:"+tt);
  const events=tt?JSON.parse(tt):[];
  const groups=new Map<string,any[]>();
  for(const e of events){
    const c=cinSnapshotOf(e)||{};
    const key=String(c.operation_id || e?.session_id || "sem_sessao");
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key)!.push(e);
  }
  const sessions=[...groups.entries()].map(([operation_id,rows])=>({...sessionPattern(rows),operation_id,session_id:rows[0]?.session_id||null,installation_id:rows[0]?.installation_id||null,app_version:rows[rows.length-1]?.app_version||rows[0]?.app_version||null,browser:rows[rows.length-1]?.browser||rows[0]?.browser||null,first_seen:rows[0]?.occurred_at||null,last_seen:rows[rows.length-1]?.occurred_at||null}))
    .sort((a,b)=>String(b.last_seen||"").localeCompare(String(a.last_seen||"")));
  const speedEntries=events.filter((e:any)=>e.event==="cinemometer_speed_entry" && cinSnapshotOf(e)?.velocidade_registada!=null);
  const calcEvents=events.filter((e:any)=>e.event==="cinemometer_calculation" && cinSnapshotOf(e)?.velocidade_registada!=null);
  const measurementEvents=speedEntries.length?speedEntries:calcEvents;
  const speeds:number[]=measurementEvents.map((e:any)=>Number(cinSnapshotOf(e).velocidade_registada)).filter((value:number)=>Number.isFinite(value));
  const analyticsSpeedValues:number[]=events
    .filter((e:any)=>["cinemometer_speed_entry","cinemometer_calculation"].includes(e.event) && cinSnapshotOf(e)?.velocidade_registada!=null)
    .map((e:any)=>String(cinSnapshotOf(e).velocidade_registada))
    .filter((v:string)=>/^[0-9]+(\\.[0-9]+)?$/.test(v))
    .map(Number)
    .filter((value:number)=>Number.isFinite(value));
  const distributionMap=new Map<number,number>();
  for(const speed of analyticsSpeedValues){
    const bucket=Math.floor(speed/10)*10;
    distributionMap.set(bucket,(distributionMap.get(bucket)||0)+1);
  }
  const distribution_24h=[...distributionMap.entries()]
    .map(([bucket_start,qty])=>({bucket_start,qty}))
    .sort((a,b)=>a.bucket_start-b.bucket_start);
  const operatorMap=new Map<string,any>();
  for(const row of calcEvents){
    const c=cinSnapshotOf(row)||{};
    const key=[c.operador_numero||"",c.operador_nome||"",c.operador_posto||""].join("|")||"não identificado";
    const cur=operatorMap.get(key)||{nome:c.operador_nome||null,numero:c.operador_numero||null,posto:c.operador_posto||null,identificado:!!(c.operador_numero||c.operador_nome),sessions:new Set<string>(),calculations:0,last_seen:row.occurred_at};
    if(row.session_id)cur.sessions.add(String(row.session_id));
    cur.calculations++;
    if(String(row.occurred_at)>String(cur.last_seen))cur.last_seen=row.occurred_at;
    operatorMap.set(key,cur);
  }
  const operators=[...operatorMap.values()].map((x:any)=>({nome:x.nome,numero:x.numero,posto:x.posto,identificado:x.identificado,sessions:x.sessions.size,calculations:x.calculations,last_seen:x.last_seen})).sort((a,b)=>b.calculations-a.calculations);
  const flags=new Map<string,number>();
  sessions.forEach(s=>s.flags.forEach(f=>flags.set(f,(flags.get(f)||0)+1)));
  const patternCounts=new Map<string,number>(); sessions.forEach(s=>patternCounts.set(s.pattern,(patternCounts.get(s.pattern)||0)+1));
  return {
    generated_at:now,
    events:events.length,
    sessions:sessions.length,
    calculations:calcEvents.length,
    speed_entries:speedEntries.length,
    measurement_events:measurementEvents.length,
    copy_code:events.filter((e:any)=>e.event==="cinemometer_copy_code").length,
    copy_text:events.filter((e:any)=>e.event==="cinemometer_copy_text").length,
    copy_location:events.filter((e:any)=>e.event==="cinemometer_copy_location").length,
    sessions_with_operator:sessions.filter(s=>s.operator.identificado).length,
    sessions_with_apparatus:sessions.filter(s=>s.aparelho?.configurado).length,
    speed_p50:percentile(speeds,.5),
    speed_avg:speeds.length?speeds.reduce((a,b)=>a+b,0)/speeds.length:null,
    analytics_speed_p50_24h:percentile(analyticsSpeedValues,.5),
    analytics_speed_avg_24h:analyticsSpeedValues.length?analyticsSpeedValues.reduce((a,b)=>a+b,0)/analyticsSpeedValues.length:null,
    distribution_24h,
    speed_min:speeds.length?Math.min(...speeds):null,
    speed_max:speeds.length?Math.max(...speeds):null,
    round5_pct:speeds.length?100*speeds.filter(v=>v%5===0).length/speeds.length:null,
    round10_pct:speeds.length?100*speeds.filter(v=>v%10===0).length/speeds.length:null,
    sessions_compatible:sessions.filter(s=>s.pattern==="compativel_com_uso_operacional").length,
    sessions_atypical:sessions.filter(s=>s.pattern==="padrao_atipico_a_rever").length,
    sessions_with_copy:sessions.filter(s=>s.copies>0).length,
    sessions_with_3plus_measurements:sessions.filter(s=>s.calculations>=3).length,
    pattern_counts:Object.fromEntries(patternCounts),
    flag_counts:Object.fromEntries(flags),
    operators,
    recent_sessions:sessions.slice(0,30)
  };
}

let cachedStats: { at:number; body:string; key:string } | null = null;
let cachedAnalytics: { at:number; body:string } | null = null;
let cachedDiagnostics: { at:number; body:string } | null = null;
const STATS_CACHE_MS = 15000;
const ANALYTICS_CACHE_MS = 300000;
const DETAIL_CACHE_MS = 30000;
const AUXILIARY_CACHE_MS = 60000;
const SYSTEM_CACHE_MS = 60000;
const USAGE_CACHE_MS = 300000;
const detailResponseCache = new Map<string,{at:number;body:string}>();

function getDetailCache(key:string,ttl:number,req:Request,forceRefresh=false):Response|null {
  if(forceRefresh)return null;
  const entry=detailResponseCache.get(key);
  if(!entry || Date.now()-entry.at>=ttl)return null;
  return new Response(entry.body,{status:200,headers:{"Content-Type":"application/json",...corsHeaders(req),"X-Verix-Detail-Cache":"HIT"}});
}
function setDetailCache(key:string,body:string) {
  detailResponseCache.set(key,{at:Date.now(),body});
}

async function reset24h() {
  const result = await rpc("verix2_reset_all_periods", {});
  return Array.isArray(result) ? result[0] : result;
}

async function resetState() {
  const r = await fetch(
    `${supabaseUrl}/rest/v1/verix2_dashboard_state?select=reset_24h_at,reset_all_at&singleton=eq.true&limit=1`,
    {
      headers:{
        apikey:serviceKey,
        Authorization:`Bearer ${serviceKey}`
      }
    }
  );

  const t = await r.text();

  if(!r.ok) {
    throw new Error(`reset_state: ${t || r.status}`);
  }

  const rows = t ? JSON.parse(t) : [];

  return {reset_24h_at:rows?.[0]?.reset_24h_at||null,reset_all_at:rows?.[0]?.reset_all_at||null};
}

Deno.serve(async (req:Request) => {
  if(req.method==="OPTIONS") {
    return new Response(null,{status:204,headers:corsHeaders(req)});
  }

  if(req.method!=="GET" && req.method!=="POST") {
    return json({ok:false,error:"method_not_allowed"},405,req);
  }

  if(!(await verifyToken(req))) {
    return json({ok:false,error:"unauthorized"},401,req);
  }

  try {
    const url = new URL(req.url);
    const detail = url.searchParams.get("detail") || "";
    const forceRefresh = url.searchParams.get("fresh") === "1";

    // V3 dashboard contract: compact period aggregates are precomputed and cached in PostgreSQL.
    if(req.method === "GET" && detail === "dashboard-v3") {
      const now = new Date().toISOString();
      try {
        const [cachedMetrics, liveActivity, liveSummary] = await Promise.all([
          rpc("verix2_admin_dashboard_v3", { p_now: now, p_force_refresh: false }),
          rpc("verix2_admin_live_activity_v3", { p_now: now }),
          rpc("verix2_admin_live_summary_v1", { p_now: now })
        ]);
        const metrics = {
          ...cachedMetrics,
          users: {
            ...(cachedMetrics?.users || {}),
            consultationsLast3Minutes: Number(liveActivity?.consultations || 0),
            activeInstallationsLast3Minutes: Number(liveActivity?.activeInstallations || 0),
            onlineNow: Number(liveSummary?.onlineNow || 0),
            onlineSessions: Number(liveSummary?.onlineSessions || 0),
            activeNow: Number(liveSummary?.activeNow || 0),
            consultationsInProgress: Number(liveSummary?.consultationsInProgress || 0),
            installationsConsultedLastHour: Number(liveSummary?.installationsConsultedLastHour || 0),
            registeredInstallations: Number(liveSummary?.registeredInstallations || 0),
            livePresenceObservedAt: liveSummary?.observedAt || now
          }
        };
        return json({ok:true,detail:"dashboard-v3",generatedAt:now,data:metrics},200,req);
      } catch(error) {
        return json({ok:false,error:"dashboard_v3_failed",detail:String((error as Error)?.message||error)},500,req);
      }
    }

    // Detailed error ledger: raw response bodies, request headers and caller stacks are never exposed.
    if(req.method === "GET" && detail === "error-ledger-v3") {
      const requestedPeriod = url.searchParams.get("period") || "today";
      const period = ["today","week","total"].includes(requestedPeriod) ? requestedPeriod : "today";
      const limit = Math.max(1,Math.min(200,Math.floor(Number(url.searchParams.get("limit") || 50))));
      const offset = Math.max(0,Math.min(1000000,Math.floor(Number(url.searchParams.get("offset") || 0))));
      const now = new Date().toISOString();
      try {
        const ledger = await rpc("verix2_admin_error_ledger_v3", {
          p_period: period,
          p_now: now,
          p_limit: limit,
          p_offset: offset
        });
        return json({ok:true,detail:"error-ledger-v3",generatedAt:now,data:ledger},200,req);
      } catch(error) {
        return json({ok:false,error:"error_ledger_v3_failed",detail:String((error as Error)?.message||error)},500,req);
      }
    }

    // This plate list is only served after the admin token has been validated.
    if(req.method==="GET" && detail==="insurance-no-cases") {
      const paged=url.searchParams.has("limit")||url.searchParams.has("offset");
      const rawLimit=Number(url.searchParams.get("limit")||101);
      const rawOffset=Number(url.searchParams.get("offset")||0);
      const pageLimit=paged?Math.max(1,Math.min(101,Number.isFinite(rawLimit)?Math.floor(rawLimit):101)):undefined;
      const pageOffset=paged?Math.max(0,Math.min(1000000,Number.isFinite(rawOffset)?Math.floor(rawOffset):0)):0;
      const cacheKey=paged ? `insurance-no-cases:${pageLimit}:${pageOffset}` : "insurance-no-cases:all";
      const cached=getDetailCache(cacheKey,DETAIL_CACHE_MS,req,forceRefresh);
      if(cached)return cached;
      const now = new Date().toISOString();
      try {
        const loaded = await loadInsuranceNoCases(now,pageLimit,pageOffset);
        const cases=paged?loaded.slice(0,100):loaded;
        const hasMore=paged&&loaded.length>100;
        const nextOffset=paged?pageOffset+cases.length:null;
        const body=JSON.stringify({ok:true,detail:"insurance-no-cases",generatedAt:now,cases,hasMore,nextOffset});
        setDetailCache(cacheKey,body);
        return new Response(body,{status:200,headers:{"Content-Type":"application/json",...corsHeaders(req),"X-Verix-Detail-Cache":"MISS"}});
      } catch(error) {
        return json({ok:false,error:"insurance_no_cases_failed"},500,req);
      }
    }

    if(req.method==="GET" && detail==="total") {
      const cached=getDetailCache("total",AUXILIARY_CACHE_MS,req,forceRefresh);
      if(cached)return cached;
      const now=new Date().toISOString();
      try {
        const analytics=await rpc("verix2_admin_total_fast",{p_now:now});
        const body=JSON.stringify({ok:true,detail:"total",generatedAt:now,analytics});
        setDetailCache("total",body);
        return new Response(body,{status:200,headers:{"Content-Type":"application/json",...corsHeaders(req),"X-Verix-Detail-Cache":"MISS"}});
      } catch(error) {
        return json({ok:false,error:"total_detail_failed",detail:String((error as Error)?.message||error)},500,req);
      }
    }

    if(req.method==="GET" && detail==="auxiliary") {
      const cached=getDetailCache("auxiliary",AUXILIARY_CACHE_MS,req,forceRefresh);
      if(cached)return cached;
      const now=new Date().toISOString();
      try {
        const auxiliary=await rpc("verix2_admin_auxiliary_fast",{p_now:now});
        const body=JSON.stringify({ok:true,detail:"auxiliary",generatedAt:now,auxiliary});
        setDetailCache("auxiliary",body);
        return new Response(body,{status:200,headers:{"Content-Type":"application/json",...corsHeaders(req),"X-Verix-Detail-Cache":"MISS"}});
      } catch(error) {
        return json({ok:false,error:"auxiliary_detail_failed",detail:String((error as Error)?.message||error)},500,req);
      }
    }

    if(req.method==="GET" && detail==="usage") {
      const cached=getDetailCache("usage",USAGE_CACHE_MS,req,forceRefresh);
      if(cached)return cached;
      const now=new Date().toISOString();
      try {
        const [usageResult,hourlyResult]=await Promise.allSettled([
          rpc("verix2_admin_usage_detail_fast",{p_now:now}),
          rpc("verix2_admin_hourly_active_interactions",{p_now:now})
        ]);
        if(usageResult.status==="rejected")throw usageResult.reason;
        const usage=usageResult.value && typeof usageResult.value==="object" ? usageResult.value : {};
        const hourly=hourlyResult.status==="fulfilled" && Array.isArray(hourlyResult.value) ? hourlyResult.value : [];
        const body=JSON.stringify({
          ok:true,detail:"usage",generatedAt:now,usage:{...usage,hourly},
          hourlyAvailable:hourlyResult.status==="fulfilled"
        });
        setDetailCache("usage",body);
        return new Response(body,{status:200,headers:{"Content-Type":"application/json",...corsHeaders(req),"X-Verix-Detail-Cache":"MISS"}});
      } catch(error) {
        return json({ok:false,error:"usage_detail_failed",detail:String((error as Error)?.message||error)},500,req);
      }
    }

    // Legacy cross-section analytics remain for old clients only.
    if(req.method==="GET" && detail==="analytics") {
      const now = new Date().toISOString();
      try {
        if(!forceRefresh && cachedAnalytics && (Date.now()-cachedAnalytics.at)<ANALYTICS_CACHE_MS) {
          return new Response(cachedAnalytics.body,{status:200,headers:{"Content-Type":"application/json",...corsHeaders(req),"X-Verix-Analytics-Cache":"HIT"}});
        }
        const analytics = await rpc("verix2_admin_analytics",{p_now:now});
        const body = JSON.stringify({ok:true,detail:"analytics",generatedAt:now,analytics});
        cachedAnalytics = {at:Date.now(),body};
        return new Response(body,{status:200,headers:{"Content-Type":"application/json",...corsHeaders(req),"X-Verix-Analytics-Cache":"MISS"}});
      } catch(error) {
        return json({ok:false,error:"analytics_detail_failed",detail:String((error as Error)?.message||error)},500,req);
      }
    }

    // ASF diagnostics are only needed by the Insurance and Performance sections.
    // Keep them off the initial dashboard path and cache briefly to avoid repeated scans.
    if(req.method==="GET" && detail==="diagnostics") {
      const now = new Date().toISOString();
      try {
        if(cachedDiagnostics && (Date.now()-cachedDiagnostics.at)<DETAIL_CACHE_MS) {
          return new Response(cachedDiagnostics.body,{status:200,headers:{"Content-Type":"application/json",...corsHeaders(req),"X-Verix-Diagnostics-Cache":"HIT"}});
        }
        const diagnostics = await rpc("verix2_asf_diagnostics",{p_now:now,p_recent_limit:25});
        const body = JSON.stringify({ok:true,detail:"diagnostics",generatedAt:now,diagnostics});
        cachedDiagnostics = {at:Date.now(),body};
        return new Response(body,{status:200,headers:{"Content-Type":"application/json",...corsHeaders(req),"X-Verix-Diagnostics-Cache":"MISS"}});
      } catch(error) {
        return json({ok:false,error:"diagnostics_detail_failed",detail:String((error as Error)?.message||error)},500,req);
      }
    }

    // Heavy diagnostics are explicitly lazy-loaded by the Admin UI.
    if(req.method==="GET" && detail==="speed") {
      const cached=getDetailCache("speed",DETAIL_CACHE_MS,req,forceRefresh);
      if(cached)return cached;
      const now = new Date().toISOString();
      try {
        const cinemometer=await loadCinemometerAnalytics24h(now);
        const body=JSON.stringify({ok:true,detail:"speed",generatedAt:now,cinemometer});
        setDetailCache("speed",body);
        return new Response(body,{status:200,headers:{"Content-Type":"application/json",...corsHeaders(req),"X-Verix-Detail-Cache":"MISS"}});
      } catch(error) {
        return json({
          ok:false,
          error:"speed_detail_failed",
          detail:String((error as Error)?.message||error)
        },500,req);
      }
    }

    if(req.method==="GET" && detail==="errors-summary") {
      const cached=getDetailCache("errors-summary",DETAIL_CACHE_MS,req,forceRefresh);
      if(cached)return cached;
      const now=new Date().toISOString();
      try {
        const errors=await rpc("verix2_admin_errors_fast",{p_now:now});
        const body=JSON.stringify({ok:true,detail:"errors-summary",generatedAt:now,errors});
        setDetailCache("errors-summary",body);
        return new Response(body,{status:200,headers:{"Content-Type":"application/json",...corsHeaders(req),"X-Verix-Detail-Cache":"MISS"}});
      } catch(error) {
        return json({ok:false,error:"errors_summary_failed",detail:String((error as Error)?.message||error)},500,req);
      }
    }

    if(req.method==="GET" && detail==="errors") {
      const cached=getDetailCache("errors",DETAIL_CACHE_MS,req,forceRefresh);
      if(cached)return cached;
      const now = new Date().toISOString();
      try {
        const investigation=await loadErrorInvestigation24h(now);
        const body=JSON.stringify({ok:true,detail:"errors",generatedAt:now,investigation});
        setDetailCache("errors",body);
        return new Response(body,{status:200,headers:{"Content-Type":"application/json",...corsHeaders(req),"X-Verix-Detail-Cache":"MISS"}});
      } catch(error) {
        return json({
          ok:false,
          error:"errors_detail_failed",
          detail:String((error as Error)?.message||error)
        },500,req);
      }
    }

    if(req.method==="GET" && detail==="system") {
      const cached=getDetailCache("system",SYSTEM_CACHE_MS,req,forceRefresh);
      if(cached)return cached;
      const now = new Date().toISOString();
      try {
        const [lifetimeResult,telemetryResult]=await Promise.allSettled([
          loadLifetime(now),
          rpc("verix2_admin_system_telemetry_fast",{p_now:now})
        ]);
        if(lifetimeResult.status==="rejected")throw lifetimeResult.reason;
        const lifetime=lifetimeResult.value;
        const telemetry=telemetryResult.status==="fulfilled" ? telemetryResult.value : {};
        const body=JSON.stringify({
          ok:true,detail:"system",generatedAt:now,lifetime,telemetry,
          telemetryAvailable:telemetryResult.status==="fulfilled"
        });
        setDetailCache("system",body);
        return new Response(body,{status:200,headers:{"Content-Type":"application/json",...corsHeaders(req),"X-Verix-Detail-Cache":"MISS"}});
      } catch(error) {
        return json({
          ok:false,
          error:"system_detail_failed",
          detail:String((error as Error)?.message||error)
        },500,req);
      }
    }

    if(req.method==="POST") {
      let body: any = {};
      try { body = await req.json(); } catch {}

      if(body?.action !== "reset_all_periods") {
        return json({ok:false,error:"invalid_action"},400,req);
      }

      const resetAt = await reset24h();
      cachedStats = null;
      cachedAnalytics = null;
      cachedDiagnostics = null;
      detailResponseCache.clear();
      cachedDiagnostics = null;

      return json({
        ok:true,
        action:"reset_all_periods",
        reset_at:resetAt || new Date().toISOString()
      },200,req);
    }

    const now = new Date().toISOString();

    const statsCacheKey = url.searchParams.get("v") || "legacy";
    // These Admin releases use the compact dashboard contract and shared DB cache.
    const legacyClient = ![
      "admin-simple-2026-10-11-r8",
      "admin-simple-2026-10-11-r9",
      "admin-simple-2026-10-12-r10",
      "admin-simple-2026-10-12-r11",
      "admin-simple-2026-10-12-r12",
      "admin-simple-2026-10-13-r13",
      "admin-simple-2026-10-13-r14",
      "admin-simple-2026-10-13-r15",
      "admin-simple-2026-10-14-r16",
      "admin-simple-2026-10-17-r17"
    ].includes(statsCacheKey);

    if(!forceRefresh && cachedStats && cachedStats.key===statsCacheKey && (Date.now()-cachedStats.at)<STATS_CACHE_MS) {
      return new Response(cachedStats.body,{
        status:200,
        headers:{
          "Content-Type":"application/json",
          ...corsHeaders(req),
          "X-Verix-Stats-Cache":"HIT"
        }
      });
    }

    // Fast path: the consolidated analytics RPC already contains the
    // dashboard, insurance, legislation, usage and most cinemometer data.
    const settled = await Promise.allSettled([
      rpc(legacyClient ? "verix2_admin_analytics" : "verix2_admin_dashboard_cached",{
        p_now:now,
        p_force_refresh:forceRefresh
      }),
      resetState(),
      rpc("verix2_consulted_installations_3m",{p_now:now}),
      rpc("verix2_admin_live_presence",{p_now:now})
    ]);

    const errors:any = {};
    const analytics = settled[0].status==="fulfilled" ? settled[0].value : {};
    const resetAt = settled[1].status==="fulfilled" ? settled[1].value : null;
    const recentConsultedRaw = settled[2].status==="fulfilled" ? settled[2].value : null;
    const livePresenceRaw = settled[3].status==="fulfilled" ? settled[3].value : null;
    const livePresence = livePresenceRaw && typeof livePresenceRaw==="object" && !Array.isArray(livePresenceRaw)
      ? livePresenceRaw
      : {};
    const recentConsultedNumeric = recentConsultedRaw==null ? null : Number(recentConsultedRaw);
    const recentConsulted3m = recentConsultedNumeric!==null && Number.isFinite(recentConsultedNumeric)
      ? recentConsultedNumeric
      : null;

    for(const [i,name] of [[0,"dashboard"],[1,"reset"],[2,"recent_query_presence"],[3,"live_presence"]] as const) {
      if(settled[i].status==="rejected") {
        const reason:any=settled[i].reason;
        errors[name]=String(reason?.message||reason);
      }
    }

    const analyticsObj = analytics && typeof analytics==="object"
      ? analytics
      : {};
    const overviewForAdmin = {
      ...(analyticsObj.overview && typeof analyticsObj.overview==="object" ? analyticsObj.overview : {}),
      ...livePresence,
      consulted_3m:recentConsulted3m
    };
    const usageObj = analyticsObj.usage && typeof analyticsObj.usage==="object"
      ? analyticsObj.usage
      : {};
    // Daily trends, sessions and hourly activity are loaded only when Usage/Trends is opened.
    // Omit these fields here so a background summary poll cannot erase already-loaded detail.
    const usageForAdmin = {
      ...usageObj
    };
    const analyticsForAdmin = {
      ...analyticsObj,
      overview:overviewForAdmin,
      usage:usageForAdmin
    };

    const payload = {
      ok:true,
      dashboardOnly:!legacyClient,
      generatedAt:typeof analyticsObj.generated_at==="string" ? analyticsObj.generated_at : now,
      current_app_version:CURRENT_APP_VERSION,
      reset24hAt:resetAt?.reset_24h_at || null,
      resetAllAt:resetAt?.reset_all_at || null,
      overview:overviewForAdmin,
      analytics:analyticsForAdmin,
      diagnostics:{},
      investigation:{},
      lifetime:{},
      cinemometer:{},
      errors
    };

    const body=JSON.stringify(payload);
    cachedStats={at:Date.now(),body,key:statsCacheKey};

    return new Response(body,{
      status:200,
      headers:{
        "Content-Type":"application/json",
        ...corsHeaders(req),
        "X-Verix-Stats-Cache":"MISS"
      }
    });

  } catch(error) {
    return json({
      ok:false,
      error:"stats_v2_failed",
      detail:String((error as Error)?.message||error)
    },500,req);
  }
});
