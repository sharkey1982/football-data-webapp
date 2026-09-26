import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// ============================================================================
// ingest-cup-data -- Carabao Cup (LC) and FA Cup (FAC) fixtures and results
// from footballwebpages.co.uk. Called daily by pg_cron job ingest-cup-data-daily.
//
// 2026-09-25 (v5): team lookup now also reads team_aliases (source
// 'FootballWebPages'). Until then a club the hard-coded NAME map didn't
// cover was silently skipped -- 10 of 79 Carabao Cup rows a day, incl.
// Coventry 1-3 Aston Villa -- while cron recorded "succeeded". Each run is
// now recorded in result_ingestion_runs. Every Carabao Cup entrant is one of
// the 92 league clubs, all of which we hold, so ANY unmatched Carabao Cup row
// is a real mapping gap and marks the run 'partial'. FA Cup qualifying is
// mostly non-league clubs we deliberately don't track, so its unmatched rows
// are reported in details but don't affect status.
//
// Also v5: played FA Cup rows are titled "Home 2-0 Away", not "Home v Away",
// and the row pattern only accepted the latter -- so no played FA Cup result
// had ever been ingested (e.g. Morecambe 2-0 Southport, 19 Sept 2026).
//
// 2026-09-26 (v8): fixtures were upserted on the natural key, which includes
// kickoff_date, so every date the source showed for a tie became another row
// (Carabao Cup round 4: seven ties on both 27 and 28 Oct, Everton v Newcastle
// three times). A tie is now found by competition, season, teams and round
// within 60 days of the listed date, and updated in place; a date or time
// change is logged to fixture_changes. The round number comes from a fixed
// slug map, not the dropdown position: the source lists round 4 under both
// "fourth-round" and "round-of-16", and the position of each moved as rounds
// were added. An unknown round slug marks the run 'partial'. Unique index
// fixtures_cup_tie_unique backs this up. The round list also now keeps
// "quarter-finals", "semi-finals" and "final", which the old filter (slugs
// containing "round") would have skipped.
// ============================================================================
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
function describeError(e:unknown):string{if(e instanceof Error)return e.message||String(e.name||'Error');if(typeof e==='string')return e;if(e&&typeof e==='object'){const o=e as Record<string,unknown>;const parts=['message','code','details','hint'].filter(k=>typeof o[k]==='string'&&(o[k] as string).length>0).map(k=>`${k}: ${o[k]}`);if(parts.length>0)return parts.join(' | ');try{const j=JSON.stringify(e);if(j&&j!=='{}')return j;}catch{/* fall through */}}return 'Unknown error (no message available)';}
const COMPETITIONS:{slug:string,code:string}[]=[{slug:'efl-cup',code:'LC'},{slug:'fa-cup',code:'FAC'}];
// Round number (fixtures.matchweek) per source slug. Two slugs for one round
// share a number; a replay has its own (it reverses home and away anyway).
// The FA Cup numbers match the positions used before v8, so rows already
// stored keep their round.
const ROUND:Record<string,Record<string,number>>={
 LC:{'preliminary-round':0,'first-round':1,'second-round':2,'third-round':3,'fourth-round':4,'round-of-16':4,'fifth-round':5,'quarter-final':5,'quarter-finals':5,'semi-final':6,'semi-finals':6,'final':7},
 FAC:{'extra-preliminary-round':0,'extra-preliminary-round-replay':1,'preliminary-round':2,'preliminary-round-replay':3,'first-qualifying-round':4,'first-qualifying-round-replay':5,'second-qualifying-round':6,'second-qualifying-round-replay':7,'third-qualifying-round':8,'third-qualifying-round-replay':9,'fourth-qualifying-round':10,'fourth-qualifying-round-replay':11,'first-round':12,'first-round-replay':13,'second-round':14,'second-round-replay':15,'third-round':16,'third-round-replay':17,'fourth-round':18,'fourth-round-replay':19,'fifth-round':20,'fifth-round-replay':21,'sixth-round':22,'quarter-final':22,'quarter-finals':22,'semi-final':24,'semi-finals':24,'final':26}};
const WINDOW_DAYS=60;
function addDays(iso:string,n:number){const d=new Date(`${iso}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function dayDiff(a:string,b:string){return Math.abs((Date.parse(`${a}T00:00:00Z`)-Date.parse(`${b}T00:00:00Z`))/86400000)}
const NAME:Record<string,string>={
'AFC Bournemouth':'Bournemouth','Blackburn Rovers':'Blackburn','Bolton Wanderers':'Bolton','Bradford City':'Bradford','Bristol Rovers':'Bristol Rvs','Burton Albion':'Burton','Cardiff City':'Cardiff','Charlton Athletic':'Charlton','Colchester United':'Colchester','Crawley Town':'Crawley Town','Crewe Alexandra':'Crewe','Derby County':'Derby','Doncaster Rovers':'Doncaster','Exeter City':'Exeter','Fleetwood Town':'Fleetwood Town','Grimsby Town':'Grimsby','Huddersfield Town':'Huddersfield','Hull City':'Hull','Ipswich Town':'Ipswich','Leeds United':'Leeds','Leicester City':'Leicester','Lincoln City':'Lincoln','Luton Town':'Luton','Manchester City':'Man City','Manchester United':'Man United','Mansfield Town':'Mansfield','Middlesbrough':'Middlesbrough','Milton Keynes Dons':'Milton Keynes Dons','Newcastle United':'Newcastle','Newport County':'Newport County','Northampton Town':'Northampton','Norwich City':'Norwich','Nottingham Forest':"Nott'm Forest",'Notts County':'Notts County','Oldham Athletic':'Oldham','Oxford United':'Oxford','Peterborough United':'Peterboro','Plymouth Argyle':'Plymouth','Port Vale':'Port Vale','Preston North End':'Preston','Queens Park Rangers':'QPR','Reading':'Reading','Rochdale':'Rochdale','Rotherham United':'Rotherham','Salford City':'Salford','Sheffield United':'Sheffield United','Sheffield Wednesday':'Sheffield Weds','Shrewsbury Town':'Shrewsbury','Southampton':'Southampton','Stevenage':'Stevenage','Stockport County':'Stockport','Stoke City':'Stoke','Swansea City':'Swansea','Swindon Town':'Swindon','Tottenham Hotspur':'Tottenham','Tranmere Rovers':'Tranmere','Walsall':'Walsall','Watford':'Watford','West Bromwich Albion':'West Brom','West Ham United':'West Ham','Wigan Athletic':'Wigan','Wolverhampton Wanderers':'Wolves','Wycombe Wanderers':'Wycombe','York City':'York','Arsenal':'Arsenal','Aston Villa':'Aston Villa','Brentford':'Brentford','Brighton and Hove Albion':'Brighton','Burnley':'Burnley','Chelsea':'Chelsea','Crystal Palace':'Crystal Palace','Everton':'Everton','Fulham':'Fulham','Liverpool':'Liverpool','Sunderland':'Sunderland'};
function clean(s:string){return s.replace(/&amp;/g,'&').replace(/&#39;/g,"'").trim()}
function parseDate(s:string){const [d,m,y]=s.split('/').map(Number);return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function parseTime(s:string){s=s.trim().toLowerCase(); if(s==='ft'||s==='aet'||s==='pens'||!s)return null; const m=s.match(/^(\d{1,2})(?:\.(\d{2}))?(am|pm)$/); if(!m)return null; let h=+m[1],mi=+(m[2]||0);if(m[3]==='pm'&&h<12)h+=12;if(m[3]==='am'&&h===12)h=0;return `${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}:00`}
function rows(html:string){const out:any[]=[]; const trs=html.match(/<tr[^>]*(?:id="match-[^"]+-score-row"|title="[^"]+\s(?:v|\d+-\d+)\s[^"]+")[^>]*>[\s\S]*?<\/tr>/g)||[]; for(const tr of trs){const dm=tr.match(/export-only">(\d{1,2}\/\d{1,2}\/\d{4})<\/td>/); const sm=tr.match(/<td class="status"[^>]*>([^<]*)<\/td>/); const hm=tr.match(/home-team"[^>]*data-export="([^"]+)"/); const am=tr.match(/away-team"[^>]*?(?:colspan="2" )?data-export="([^"]+)"/); if(!dm||!hm||!am)continue; const scores=[...tr.matchAll(/<td class="score (?:home|away)-score">(\d+)<\/td>/g)].map(x=>+x[1]); out.push({date:parseDate(dm[1]),status:clean(sm?.[1]||''),home:clean(hm[1]),away:clean(am[1]),hg:scores.length===2?scores[0]:null,ag:scores.length===2?scores[1]:null}); } return out;}

Deno.serve(async()=>{
 const {data:run}=await sb.from('result_ingestion_runs').insert({source_name:'FootballWebPages (cups)',status:'running'}).select('ingestion_run_id').single();
 const runId=run?.ingestion_run_id;
 const finish=async(fields:Record<string,unknown>)=>{ if(runId) await sb.from('result_ingestion_runs').update({finished_at:new Date().toISOString(),...fields}).eq('ingestion_run_id',runId); };
 try{
  const {data:teams,error:te}=await sb.from('teams').select('team_id,canonical_name'); if(te)throw te;
  const teamMap=new Map<string,number>((teams||[]).map((t:any)=>[t.canonical_name,t.team_id]));
  const {data:aliases,error:ae}=await sb.from('team_aliases').select('raw_name,team_id').eq('source_name','FootballWebPages'); if(ae)throw ae;
  const aliasMap=new Map<string,number>((aliases||[]).map((a:any)=>[a.raw_name,a.team_id]));
  const resolve=(raw:string)=>aliasMap.get(raw) ?? teamMap.get(NAME[raw]||raw);
  const {data:season}=await sb.from('seasons').select('season_id').eq('label','2627').single(); if(!season)throw new Error('season 2627 mapping missing');
  const results:any[]=[];
  let tSeen=0,tFix=0,tMatch=0,tDropped=0; const gaps=new Set<string>(); const tUnknownRounds:string[]=[];
  for(const comp of COMPETITIONS){
   const BASE=`https://www.footballwebpages.co.uk/fixtures-results/${comp.slug}`;
   const {data:league}=await sb.from('leagues').select('league_id').eq('code',comp.code).single(); if(!league){results.push({competition:comp.code,error:'league mapping missing'});continue;}
   try{
    const base=await (await fetch(`${BASE}/third-round`)).text(); const slugs=[...base.matchAll(/<option value="([^"]+)"(?: selected="selected")?>[^<]+<\/option>/g)].map(x=>x[1]).filter(x=>x&&(x.includes('round')||x.includes('final'))); const rounds=[...new Set(slugs)];
    let seen=0,fixtures=0,matches=0,dropped=0,oneSided=0,moved=0; const unmatched=new Set<string>();
    const unknownRounds=rounds.filter(s=>ROUND[comp.code]?.[s]===undefined); if(unknownRounds.length)tUnknownRounds.push(...unknownRounds.map(s=>`${comp.code}:${s}`));
    for(let ri=0;ri<rounds.length;ri++){const slug=rounds[ri];const roundNo=ROUND[comp.code]?.[slug];if(roundNo===undefined)continue;const html=await (await fetch(`${BASE}/${slug}`)).text(); for(const r of rows(html)){seen++;
     const hid=resolve(r.home),aid=resolve(r.away);
     if(!hid||!aid){
      if(!hid)unmatched.add(r.home); if(!aid)unmatched.add(r.away);
      if(hid||aid)oneSided++;
      if(comp.code==='LC'){ dropped++; if(!hid)gaps.add(r.home); if(!aid)gaps.add(r.away); }
      continue;
     }
     const played=r.hg!==null&&r.ag!==null; const time=parseTime(r.status);
     // One row per tie: same competition, season, teams and round within
     // WINDOW_DAYS of the listed date. Never keyed on the date itself.
     const fp:any={league_id:league.league_id,season_id:season.season_id,home_team_id:hid,away_team_id:aid,kickoff_date:r.date,kickoff_time:time,matchweek:roundNo,status:played?'played':'scheduled',source_name:'FootballWebPages',source_file:`${BASE}/${slug}`,updated_at:new Date().toISOString()};
     const {data:cands,error:ce}=await sb.from('fixtures').select('fixture_id,kickoff_date,kickoff_time').eq('league_id',league.league_id).eq('season_id',season.season_id).eq('home_team_id',hid).eq('away_team_id',aid).eq('matchweek',roundNo).gte('kickoff_date',addDays(r.date,-WINDOW_DAYS)).lte('kickoff_date',addDays(r.date,WINDOW_DAYS)); if(ce)throw ce;
     const existing=(cands||[]).sort((a:any,b:any)=>dayDiff(a.kickoff_date,r.date)-dayDiff(b.kickoff_date,r.date))[0];
     if(existing){
      // A blank time on the source (TBC, or FT on a played row) never wipes a known one.
      if(time===null)fp.kickoff_time=existing.kickoff_time;
      if(existing.kickoff_date!==r.date||(existing.kickoff_time??null)!==(fp.kickoff_time??null)){
       const {error:le}=await sb.from('fixture_changes').insert({fixture_id:existing.fixture_id,old_kickoff_date:existing.kickoff_date,new_kickoff_date:r.date,old_kickoff_time:existing.kickoff_time,new_kickoff_time:fp.kickoff_time}); if(le)throw le; moved++;
      }
      const {error:ue}=await sb.from('fixtures').update(fp).eq('fixture_id',existing.fixture_id); if(ue)throw ue;
     }else{
      const {error:ie}=await sb.from('fixtures').insert(fp); if(ie)throw ie;
     }
     fixtures++;
     if(played){const mp:any={league_id:league.league_id,season_id:season.season_id,home_team_id:hid,away_team_id:aid,match_date:r.date,kickoff_time:time,full_time_home_goals:r.hg,full_time_away_goals:r.ag,full_time_result:r.hg>r.ag?'H':r.hg<r.ag?'A':'D',source_name:'FootballWebPages',source_file:`${BASE}/${slug}`,updated_at:new Date().toISOString()}; const {error:me}=await sb.from('matches').upsert(mp,{onConflict:'league_id,season_id,match_date,home_team_id,away_team_id'});if(me)throw me;matches++;}
    }}
    tSeen+=seen;tFix+=fixtures;tMatch+=matches;tDropped+=dropped;
    results.push({competition:comp.code,rounds,seen,fixtures,kickoff_changes:moved,matches,mapping_gap_rows:dropped,one_sided_rows:oneSided,unmatched:[...unmatched],unknown_rounds:unknownRounds});
   }catch(e){results.push({competition:comp.code,error:describeError(e)})}
  }
  const {data:predictions,error:pe}=await sb.rpc('backfill_fixture_predictions'); if(pe)throw pe;
  const anyError=results.some(r=>r.error);
  const status=anyError?'failed':(tDropped>0||tUnknownRounds.length>0?'partial':'success');
  const partialMsg=[tDropped>0?`${tDropped} Carabao Cup row(s) dropped -- add team_aliases (source FootballWebPages) for: ${[...gaps].join(', ')}`:null,tUnknownRounds.length>0?`round page(s) not ingested, add to ROUND map in ingest-cup-data: ${tUnknownRounds.join(', ')}`:null].filter(Boolean).join('; ');
  await finish({status,competitions_attempted:COMPETITIONS.length,rows_seen:tSeen,rows_stored:tFix,matches_upserted:tMatch,unmatched_rows:tDropped,
   error_message:anyError?results.filter(r=>r.error).map(r=>`${r.competition}: ${r.error}`).join('; '):(partialMsg||null),
   details:{results,carabao_mapping_gaps:[...gaps],unknown_rounds:tUnknownRounds,predictions_updated:predictions}});
  return Response.json({status,run_id:runId,results,carabao_mapping_gaps:[...gaps],predictions_updated:predictions});
 }catch(e){
  await finish({status:'failed',error_message:describeError(e)});
  return Response.json({status:'failed',error:describeError(e)},{status:500});
 }
});
