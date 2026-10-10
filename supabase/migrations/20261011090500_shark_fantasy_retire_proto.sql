-- ============================================================================
-- Shark Fantasy: retire the `proto` league (10 Oct 2026). It was created with
-- the first world (made-up names, 20 a club) and the first rules; nobody had
-- joined and no round was played. The weekly league restarts in the Beat the
-- Shark world as `weekly` (created by the runner after this is applied).
-- `proto` becomes a test league: admins can still look at it or play it out
-- from the page, and the Sunday job no longer touches it.
-- ============================================================================
update sf.universes set is_test = true where id = 'proto' and not is_test and not is_public;
