# Generates supabase/migrations/20261007000000_intlw_women.sql from the men's intl
# migrations (intl -> intlw). Kept so a later change to the men's schema can be
# mirrored the same way: python scripts/gen_intlw_migration.py (from the repo root).
import re, pathlib
mig = pathlib.Path('supabase/migrations')
files = ['20261005130000_intl_phase1.sql', '20261005150000_intl_delete_where.sql', '20261005170000_intl_summaries.sql',
         '20261005190000_intl_continental.sql', '20261005200000_intl_visuals.sql', '20261005210000_intl_projections_squads.sql',
         '20261005220000_intl_clubs.sql', '20261006110000_intl_squad_snapshots.sql', '20261006200000_intl_model_info_view.sql']
out = ['''-- ============================================================================
-- Women's international football (Chris, 6 Oct 2026: "continue with
-- recommendations" on adding the women's game).
--
-- The intlw schema is the men's intl schema, table for table and function for
-- function, so the same importer (scripts/intl_import.py --women), model and
-- squads job can fill it and the same pages can read it through public.intlw_*
-- views. Generated from the intl migrations below with intl -> intlw, so the
-- two stay in step; the integrity checks are left to the men's side.
--
--   ''' + '\n--   '.join(files) + '''
--
-- Source: martj42/womens-international-results (same format as the men's file).
-- ============================================================================
''']
for f in files:
    s = (mig / f).read_text()
    # drop the integrity function (it watches the men's jobs)
    s = re.sub(r"(?:-- -+\n-- Integrity.*?\n-- -+\n)?create or replace function public\.check_intl_integrity\(\).*?\n\$\$;\n", "", s, flags=re.S)
    s = re.sub(r"(revoke|grant) [^\n]*check_intl_integrity[^\n]*\n", "", s)
    s = re.sub(r"\bschema (if not exists )?intl\b", lambda m: f"schema {m.group(1) or ''}intlw", s)
    s = re.sub(r"'intl_", "'intlw_", s)
    s = re.sub(r"\bintl\.", "intlw.", s)
    s = re.sub(r"\bpublic\.intl_", "public.intlw_", s)
    assert 'check_intl' not in s, f
    out.append(f"\n-- ---------------------------------------------------------------------------\n-- from {f}\n-- ---------------------------------------------------------------------------\n" + s)
text = ''.join(out)
leftover = sorted(set(re.findall(r"\bintl_[a-z_]+", text)))
print('bare intl_ names left:', leftover)
pathlib.Path('supabase/migrations/20261007000000_intlw_women.sql').write_text(text)
print(len(text))
