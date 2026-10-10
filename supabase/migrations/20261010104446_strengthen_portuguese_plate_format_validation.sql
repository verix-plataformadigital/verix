-- Align the administrative "valid format" metric with the IMT rule for the current series.
CREATE OR REPLACE FUNCTION public.verix_portuguese_plate_format_valid(p_raw text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
DECLARE
  v text := upper(btrim(coalesce(p_raw, '')));
  m text[];
BEGIN
  IF v ~ '^[A-Z]{2}[ -]?[0-9]{2}[ -]?[0-9]{2}$'
     OR v ~ '^[0-9]{2}[ -]?[0-9]{2}[ -]?[A-Z]{2}$'
     OR v ~ '^[0-9]{2}[ -]?[A-Z]{2}[ -]?[0-9]{2}$' THEN
    RETURN true;
  END IF;
  m := regexp_match(v, '^([A-Z]{2})[ -]?[0-9]{2}[ -]?([A-Z]{2})$');
  IF m IS NULL THEN RETURN false; END IF;
  IF m[1] IN ('AA', 'EE', 'II', 'OO', 'UU')
     OR m[2] IN ('AA', 'EE', 'II', 'OO', 'UU') THEN
    RETURN true;
  END IF;
  RETURN substring(m[1] from 2 for 1) NOT IN ('A', 'E', 'I', 'O', 'U')
     AND substring(m[2] from 2 for 1) NOT IN ('A', 'E', 'I', 'O', 'U');
END;
$function$;

REVOKE ALL ON FUNCTION public.verix_portuguese_plate_format_valid(text) FROM PUBLIC, anon, authenticated;

DO $migration$
DECLARE
  v_definition text;
  v_old_predicate text := $old$regexp_replace(upper(coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula','')), '[[:space:]-]', '', 'g')
          ~ '^(?:[A-Z]{2}[0-9]{4}|[0-9]{4}[A-Z]{2}|[0-9]{2}[A-Z]{2}[0-9]{2}|[A-Z]{2}[0-9]{2}[A-Z]{2})$'$old$;
  v_new_predicate text := $new$public.verix_portuguese_plate_format_valid(coalesce(metadata->>'matricula',metadata->'asfDiagnostic'->>'matricula',''))$new$;
  v_occurrences integer;
BEGIN
  SELECT pg_get_functiondef('public.verix2_admin_analytics(timestamptz)'::regprocedure) INTO v_definition;
  v_occurrences := (length(v_definition) - length(replace(v_definition, v_old_predicate, ''))) / length(v_old_predicate);
  IF v_occurrences <> 4 THEN
    RAISE EXCEPTION 'Expected four old valid-plate predicates in admin analytics; found %', v_occurrences;
  END IF;
  v_definition := replace(v_definition, v_old_predicate, v_new_predicate);
  IF position(v_old_predicate IN v_definition) > 0
     OR (length(v_definition) - length(replace(v_definition, v_new_predicate, ''))) / length(v_new_predicate) <> 4 THEN
    RAISE EXCEPTION 'Could not verify all four strict plate predicates; refusing partial analytics update';
  END IF;
  EXECUTE v_definition;
END
$migration$;
