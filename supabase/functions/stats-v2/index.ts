import { canonicalSpeedMeasurements, groupCinemometerEvents, summarizeErrorRows } from "../_shared/telemetry-analytics.mjs";
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



function n(v){const x=Number(v);return Number.isFinite(x)?x:null;}
function cinSnapshotOf(e){
  const c=e?.metadata?.cin;
  return c && typeof c==="object" && !Array.isArray(c) ? c : null;
}
function percentile(values,p){
  const a=values.filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length)return null;
  const i=(a.length-1)*p, lo=Math.floor(i), hi=Math.ceil(i);
  return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(i-lo);
}
function sessionPattern(rows){
  const speedRows=rows.filter((e:any)=>e.event==="cinemometer_speed_entry" && cinSnapshotOf(e)?.velocidade_registada!=null);
  const calculationRows=rows.filter((e:any)=>e.event==="cinemometer_calculation" && cinSnapshotOf(e)?.velocidade_registada!=null);
  const measurements=canonicalSpeedMeasurements(rows);
  const speeds=measurements.map((e:any)=>Number(cinSnapshotOf(e).velocidade_registada)).filter(Number.isFinite);
  const unique=[...new Set(speeds)];
  const times=measurements.map((e:any)=>new Date(e.occurred_at).getTime()).filter(Number.isFinite).sort((a,b)=>a-b);
  const intervals=[]; for(let i=1;i<times.length;i++) intervals.push((times[i]-times[i-1])/1000);
  const round5=speeds.length?100*speeds.filter(v=>v%5===0).length/speeds.length:null;
  const round10=speeds.length?100*speeds.filter(v=>v%10===0).length/speeds.length:null;
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
  const operatorCount=measurements.filter((e:any)=>{const c=cinSnapshotOf(e)||{};return c.operador_identificado===true||!!(c.operador_numero||c.operador_nome);}).length;
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
  const latest=calculationRows.length?cinSnapshotOf(calculationRows[calculationRows.length-1]):(cinSnapshotOf(rows[rows.length-1])||{});
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

async function loadErrorInvestigation24h(now:string){
  const qs = new URLSearchParams();
  qs.set("select","occurred_at,event,event_id,installation_id,query_id,app_version,browser,metadata");
  qs.set("event","eq.vehicle_insurance_error");
  qs.set("and","(occurred_at.gte."+new Date(Date.now()-24*60*60*1000).toISOString()+",occurred_at.lt."+now+")");
  qs.set("order","occurred_at.desc");
  qs.set("limit","1000");
  const rr=await fetch(supabaseUrl+"/rest/v1/verix2_events?"+qs.toString(),{
    headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey,Prefer:"count=exact"}
  });
  const tt=await rr.text();
  if(!rr.ok)throw new Error("error_investigation:"+tt);
  const rows=tt?JSON.parse(tt):[];
  const range=rr.headers.get("content-range")||"";
  const match=range.match(/\/(\d+)$/);
  const totalCount=match?Number(match[1]):rows.length;
  return {generated_at:now,...summarizeErrorRows(rows,totalCount)};
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
  qs.set("and","(occurred_at.gte."+new Date(Date.now()-24*60*60*1000).toISOString()+",occurred_at.lt."+now+")");
  qs.set("order","occurred_at.asc");
  qs.set("limit","5000");
  const rr=await fetch(supabaseUrl+"/rest/v1/verix2_events?"+qs.toString(),{headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey}});
  const tt=await rr.text();
  if(!rr.ok)throw new Error("cin_analytics:"+tt);
  const events=tt?JSON.parse(tt):[];
  const range=rr.headers.get("content-range")||"";
  const rangeMatch=range.match(/\\/(\\d+)$/);
  const totalEventCount=rangeMatch?Number(rangeMatch[1]):events.length;
  const groups=groupCinemometerEvents(events);
  const sessions=groups.map((group:any)=>{
    const rows=group.events as any[];
    const calculationRows=rows.filter((e:any)=>e.event==="cinemometer_calculation" && cinSnapshotOf(e)?.velocidade_registada!=null);
    const latestRow=calculationRows[calculationRows.length-1]||rows[rows.length-1];
    return {
      ...sessionPattern(rows),
      operation_id:cinSnapshotOf(latestRow)?.operation_id||null,
      grouping_basis:group.grouping_basis,
      session_id:rows[0]?.session_id||null,
      installation_id:rows[0]?.installation_id||null,
      app_version:latestRow?.app_version||rows[0]?.app_version||null,
      browser:latestRow?.browser||rows[0]?.browser||null,
      first_seen:group.first_seen||rows[0]?.occurred_at||null,
      last_seen:group.last_seen||rows[rows.length-1]?.occurred_at||null
    };
  }).sort((a:any,b:any)=>String(b.last_seen||"").localeCompare(String(a.last_seen||"")));
  const speedEntries=events.filter((e:any)=>e.event==="cinemometer_speed_entry" && cinSnapshotOf(e)?.velocidade_registada!=null);
  const calcEvents=events.filter((e:any)=>e.event==="cinemometer_calculation" && cinSnapshotOf(e)?.velocidade_registada!=null);
  const measurementEvents=canonicalSpeedMeasurements(events);
  const speeds=measurementEvents.map((e:any)=>Number(cinSnapshotOf(e).velocidade_registada)).filter(Number.isFinite);
  const operatorMap=new Map<string,any>();
  for(const row of calcEvents){
    const c=cinSnapshotOf(row)||{};
    const keyParts=[c.operador_numero,c.operador_nome,c.operador_posto].filter((v:any)=>v!==null&&v!==undefined&&String(v).trim()!=="");
    const key=keyParts.length?keyParts.map(String).join("|"):"unidentified";
    const cur=operatorMap.get(key)||{nome:c.operador_nome||null,numero:c.operador_numero||null,posto:c.operador_posto||null,identificado:c.operador_identificado===true||!!(c.operador_numero||c.operador_nome),sessions:new Set<string>(),calculations:0,last_seen:row.occurred_at};
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
    total_events:totalEventCount,
    sample_count:events.length,
    sampled:totalEventCount>events.length,
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

let cachedStats: { at:number; body:string } | null = null;
const STATS_CACHE_MS = 15000;

async function reset24h() {
  const result = await rpc("verix2_reset_24h", {});
  return Array.isArray(result) ? result[0] : result;
}

async function resetState() {
  const r = await fetch(
    `${supabaseUrl}/rest/v1/verix2_dashboard_state?select=reset_24h_at&singleton=eq.true&limit=1`,
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

  return rows?.[0]?.reset_24h_at || null;
}

Deno.serve(async (req) => {
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

    // Heavy diagnostics are explicitly lazy-loaded by the Admin UI.
    if(req.method==="GET" && detail==="speed") {
      const now = new Date().toISOString();
      try {
        return json({
          ok:true,
          detail:"speed",
          generatedAt:now,
          cinemometer:await loadCinemometerAnalytics24h(now)
        },200,req);
      } catch(error) {
        return json({
          ok:false,
          error:"speed_detail_failed",
          detail:String((error as Error)?.message||error)
        },500,req);
      }
    }

    if(req.method==="GET" && detail==="errors") {
      const now = new Date().toISOString();
      try {
        return json({
          ok:true,
          detail:"errors",
          generatedAt:now,
          investigation:await loadErrorInvestigation24h(now)
        },200,req);
      } catch(error) {
        return json({
          ok:false,
          error:"errors_detail_failed",
          detail:String((error as Error)?.message||error)
        },500,req);
      }
    }

    if(req.method==="GET" && detail==="system") {
      const now = new Date().toISOString();
      try {
        return json({
          ok:true,
          detail:"system",
          generatedAt:now,
          lifetime:await loadLifetime(now)
        },200,req);
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

      if(body?.action !== "reset_24h") {
        return json({ok:false,error:"invalid_action"},400,req);
      }

      const resetAt = await reset24h();
      cachedStats = null;

      return json({
        ok:true,
        action:"reset_24h",
        reset_at:resetAt || new Date().toISOString()
      },200,req);
    }

    const now = new Date().toISOString();

    if(cachedStats && (Date.now()-cachedStats.at)<STATS_CACHE_MS) {
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
      rpc("verix2_admin_analytics",{p_now:now}),
      rpc("verix2_asf_diagnostics",{p_now:now,p_recent_limit:25}),
      rpc("verix2_telemetry_metrics_v3",{p_now:now}),
      resetState()
    ]);

    const errors:any = {};
    const analytics = settled[0].status==="fulfilled" ? settled[0].value : {};
    const diagnostics = settled[1].status==="fulfilled" ? settled[1].value : {};
    const canonicalMetrics = settled[2].status==="fulfilled" ? settled[2].value : null;
    const resetAt = settled[3].status==="fulfilled" ? settled[3].value : null;

    for(const [i,name] of [[0,"analytics"],[1,"diagnostics"],[2,"telemetry_metrics"],[3,"reset"]] as const) {
      if(settled[i].status==="rejected") {
        const reason:any=settled[i].reason;
        errors[name]=String(reason?.message||reason);
      }
    }

    const analyticsObj:any = analytics && typeof analytics==="object" ? analytics : {};
    if(canonicalMetrics && typeof canonicalMetrics==="object") {
      if(canonicalMetrics.bounds) analyticsObj.bounds=canonicalMetrics.bounds;
      if(canonicalMetrics.insurance) analyticsObj.insurance=canonicalMetrics.insurance;
      if(canonicalMetrics.query_quality) analyticsObj.query_quality=canonicalMetrics.query_quality;
      if(canonicalMetrics.errors) analyticsObj.errors=canonicalMetrics.errors;
      if(canonicalMetrics.telemetry) analyticsObj.telemetry=canonicalMetrics.telemetry;
      if(canonicalMetrics.speed_summary || canonicalMetrics.speed_distribution_24h) {
        analyticsObj.speed={...(analyticsObj.speed||{})};
        if(canonicalMetrics.speed_summary) analyticsObj.speed.summary=canonicalMetrics.speed_summary;
        if(canonicalMetrics.speed_distribution_24h) analyticsObj.speed.distribution_24h=canonicalMetrics.speed_distribution_24h;
      }
      analyticsObj.usage={...(analyticsObj.usage||{}),...(canonicalMetrics.usage||{})};
      if(canonicalMetrics.sessions) analyticsObj.usage.sessions=canonicalMetrics.sessions;
      if(canonicalMetrics.actions) analyticsObj.overview={
        ...(analyticsObj.overview||{}),
        actions_24h:canonicalMetrics.actions["24h"],
        actions_7d:canonicalMetrics.actions["7d"],
        actions_30d:canonicalMetrics.actions["30d"]
      };
    }

    const payload = {
      ok:true,
      generatedAt:now,
      reset24hAt:resetAt || null,
      overview:analyticsObj.overview || null,
      analytics:analyticsObj,
      diagnostics:diagnostics || {},
      investigation:{},
      lifetime:{},
      cinemometer:{},
      errors
    };

    const body=JSON.stringify(payload);
    cachedStats={at:Date.now(),body};

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
