-- Prediction-accuracy posts off automatic posting (Chris, 25 Oct 2026: the
-- first one "makes no sense"). It was about GW7 while GW8 was being played,
-- and "86% for that result" and the betting-favourite comparison read badly.
-- Back on once the wording and timing are agreed.
update public.social_settings
   set auto_post_types = array_remove(auto_post_types, 'prediction_accuracy'), updated_at = now()
 where id;
update public.social_post_candidates set approval_status = 'superseded', updated_at = now()
 where post_type = 'prediction_accuracy' and publication_status = 'unpublished' and approval_status in ('pending', 'approved');
