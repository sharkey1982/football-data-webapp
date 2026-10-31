-- Fewer automatic X posts (Chris, 31 Oct 2026: "reduce the posting cadence and
-- focus more on finding good opportunities to reply to instead"). Our 32 posts
-- to 26 Oct had 143 impressions in total and 1 link click: standalone posts
-- from a new account reach almost nobody, replies on big accounts do.
--
-- Keep posting automatically only the weekly FPL pieces: captaincy, the
-- gameweek preview/reflection thread, the week's changes, the week ahead, and
-- fixture moves. Daily price changes, market watch, availability, facts, quiz
-- answers and the daily market view stop posting on their own (candidates
-- are still made and can be approved on /admin/social). Caps come down to
-- 3 a day and 60 a month. Safe to re-run.
update public.social_settings
   set auto_post_types = array['fixture_moved', 'fpl_captaincy', 'fpl_week_changes', 'gameweek_outlook', 'gameweek_thread'],
       max_posts_per_day = 3,
       max_posts_per_month = 60,
       updated_at = now()
 where id;
