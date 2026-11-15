-- Admin emails: lead Site pages with real visitors (Chris, 15 Nov 2026,
-- "Review the recent traffic... Is it real?"). Cloudflare Web Analytics
-- counts everything that runs our pages in a browser, including our own
-- weekly smoke test (the ~95-visit spikes on 31 Oct, 2 Nov and 9 Nov) and
-- crawlers (7 and 10 Nov: US, no referrer, one view each on archive pages).
-- Google Analytics engaged sessions (10+ seconds, 2+ pages or a conversion,
-- cookie-consenting people only) are the nearest thing to real readers.
--
-- private.digest_real_visitors(digest, day) prepends to the "traffic"
-- section: engaged sessions for the day and the last 7 days, and where they
-- came from (AI assistants, X, Google search, direct). It relabels the
-- Cloudflare lines as all traffic including bots, drops the morning email's
-- separate Google Analytics line (now covered), and puts real visitors in
-- the headline. Called from private.admin_digest for both editions. The
-- smoke test no longer loads analytics beacons (scripts/smoke/weekly_smoke.mjs).
-- Safe to re-run.

create or replace function private.digest_real_visitors(p_digest jsonb, p_day date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d date; d_latest date; e bigint; s bigint; u bigint; e7 bigint; s7 bigint;
  ai bigint; xx bigint; gs bigint; dir bigint; ai7 bigint;
  v_lines jsonb; v_head text; v_new jsonb;
begin
  select max(date) into d_latest from ga.daily_totals where date <= p_day;
  if d_latest is null then return p_digest; end if;
  d := d_latest;
  select coalesce(sum(engaged_sessions), 0), coalesce(sum(sessions), 0), coalesce(sum(active_users), 0) into e, s, u
    from ga.daily_totals where date = d;
  select coalesce(sum(engaged_sessions), 0), coalesce(sum(sessions), 0) into e7, s7
    from ga.daily_totals where date > d - 7 and date <= d;
  select coalesce(sum(sessions) filter (where channel_group = 'AI Assistant' or source ~* '(chatgpt|openai|perplexity|claude|anthropic|gemini|copilot|deepseek|meta\.ai)'), 0),
         coalesce(sum(sessions) filter (where source ~* '^(t\.co|x\.com|twitter\.com|mobile\.twitter\.com)$'), 0),
         coalesce(sum(sessions) filter (where source = 'google' and medium = 'organic'), 0),
         coalesce(sum(sessions) filter (where channel_group = 'Direct'), 0)
    into ai, xx, gs, dir from ga.daily_by_channel where date = d;
  select coalesce(sum(sessions) filter (where channel_group = 'AI Assistant' or source ~* '(chatgpt|openai|perplexity|claude|anthropic|gemini|copilot|deepseek|meta\.ai)'), 0)
    into ai7 from ga.daily_by_channel where date > d - 7 and date <= d;

  v_new := jsonb_build_array(
    format('Real visitors, %s%s: %s (of %s, %s). Last 7 days: %s of %s sessions.',
      to_char(d, 'Dy FMDD Mon'), case when d < p_day then ' (latest Google Analytics day)' else '' end,
      private.digest_n(e, 'engaged session'), private.digest_n(s, 'session'), private.digest_n(u, 'visitor'),
      private.digest_int(e7), private.digest_int(s7)),
    format('Where they came from that day: AI assistants %s, X %s, Google search %s, direct %s. AI assistants over 7 days: %s.',
      private.digest_int(ai), private.digest_int(xx), private.digest_int(gs), private.digest_int(dir), private.digest_n(ai7, 'session')),
    'Google Analytics counts only people who accept cookies; engaged means 10+ seconds or 2+ pages. Cloudflare below counts all traffic, including crawlers.');

  select jsonb_agg(case when x.e->>'key' = 'traffic' then
           jsonb_set(x.e, '{lines}', v_new || coalesce((
             select jsonb_agg(to_jsonb(replace(l.v, '(Cloudflare, every visitor)', '(Cloudflare: all traffic, including bots)')) order by l.o)
               from jsonb_array_elements_text(x.e->'lines') with ordinality l(v, o)
              where l.v not like 'Google Analytics, latest complete day%'), '[]'::jsonb))
         else x.e end order by x.o)
    into v_lines
    from jsonb_array_elements(p_digest->'sections') with ordinality x(e, o);
  if v_lines is null then return p_digest; end if;

  v_head := regexp_replace(coalesce(p_digest->>'headline', ''), '([0-9,]+ visits?)\M',
              format('%s (\1 incl. bots)', private.digest_n(e, 'real visitor')));
  return jsonb_set(jsonb_set(p_digest, '{sections}', v_lines), '{headline}', to_jsonb(v_head));
end;
$$;
revoke all on function private.digest_real_visitors(jsonb, date) from public, anon, authenticated;

create or replace function private.admin_digest(p_from timestamptz, p_to timestamptz, p_edition text default 'evening')
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_from timestamptz := p_from; v_to timestamptz := p_to; v jsonb; v_extra jsonb; v_x numeric;
begin
  if p_edition = 'evening' then
    v := private.admin_daily_digest(coalesce((p_from at time zone 'Europe/London')::date, (now() at time zone 'Europe/London')::date))
         || jsonb_build_object('edition', 'evening');
    v_from := coalesce(p_from, date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London');
    v_to := coalesce(p_to, now());
  elsif p_edition = 'morning' then
    if v_from is null or v_to is null then
      select coalesce(v_from, w.w_from), coalesce(v_to, w.w_to) into v_from, v_to
        from private.admin_morning_window((now() at time zone 'Europe/London')::date) w;
    end if;
    v := private.admin_overnight_digest(v_from, v_to);
  else
    raise exception 'unknown edition %', p_edition;
  end if;
  begin
    v_extra := private.admin_reply_sections(v_from, v_to);
  exception when others then
    v_extra := jsonb_build_array(jsonb_build_object('key', 'replies', 'title', 'Reply ideas and mentions', 'link', 'https://fixtureshark.com/admin/social',
                                                    'lines', jsonb_build_array('Could not build this section: ' || left(sqlerrm, 200))));
  end;
  -- Real visitors first in Site pages; Cloudflare relabelled (15 Nov 2026).
  begin
    v := private.digest_real_visitors(v, case when p_edition = 'morning' then (v_to at time zone 'Europe/London')::date - 1
                                              else (v_from at time zone 'Europe/London')::date end);
  exception when others then null;
  end;
  select a.o into v_x from jsonb_array_elements(v->'sections') with ordinality a(e, o) where a.e->>'key' = 'x' limit 1;
  v_x := coalesce(v_x, jsonb_array_length(v->'sections'));
  return jsonb_set(v, '{sections}', (
    select jsonb_agg(z.e order by z.o) from (
      select a.e, a.o::numeric o from jsonb_array_elements(v->'sections') with ordinality a(e, o)
      union all
      select b.e, v_x + b.o / 10.0 from jsonb_array_elements(v_extra) with ordinality b(e, o)) z));
end;
$$;
revoke all on function private.admin_digest(timestamptz, timestamptz, text) from public, anon, authenticated;
