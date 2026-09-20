import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
Deno.serve(async()=>{const {data:run}=await sb.from('result_ingestion_runs').insert({source_name:'football-data.co.uk'}).select().single();const id=run?.ingestion_run_id;try{const {data:cfg}=await sb.from('data_source_competitions').select('*').eq('enabled',true);return Response.json({status:'test',run_id:id,competitions:cfg?.length||0});}catch(e){return Response.json({error:String(e)},{status:500})}});
