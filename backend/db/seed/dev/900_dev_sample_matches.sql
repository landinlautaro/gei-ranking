-- DEVELOPMENT ONLY. Sample matches on top of 001_initial_players.sql so the public API and UI have data to show.
-- NEVER run this against production (Neon).
--
-- * Refuses to run unless the database is named 'gei_ranking' (the docker-compose database).
-- * Idempotent: does nothing if sample matches (notes starting with '[dev-seed]') already exist.
-- * Match results only; positions, movement text and the ranking are produced by the engine. After running, execute:
--       dotnet run --project backend/src/GeiRanking.Api -- rebuild-ranking
--
-- Run:  psql "Host=localhost port=5433 dbname=gei_ranking user=gei" -f backend/db/seed/dev/900_dev_sample_matches.sql

BEGIN;

DO $seed$
DECLARE
    m record;
    new_match_id integer;
BEGIN
    IF current_database() <> 'gei_ranking' THEN
        RAISE EXCEPTION 'Dev seed refused: database "%" is not the local development database.', current_database();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM ranking_events WHERE kind = 'InitialRanking') THEN
        RAISE EXCEPTION 'Run 001_initial_players.sql first.';
    END IF;

    IF EXISTS (SELECT 1 FROM matches WHERE notes LIKE '[dev-seed]%') THEN
        RAISE NOTICE 'Sample matches already loaded: nothing to do.';
        RETURN;
    END IF;

    -- Chronological. Every challenge is within 5 places given the ladder at that moment.
    FOR m IN
        SELECT * FROM (VALUES
            -- played_at, challenger, challenged, winner, completion, status, score(json), note
            ('2026-09-01 22:00+00'::timestamptz, 'Fede Soda',          'Pablo Castillo',     'Fede Soda',          'Normal',     'Valid',  '{"sets":[{"challengerGames":6,"challengedGames":4},{"challengerGames":6,"challengedGames":3}]}', ''),
            ('2026-09-03 22:00+00', 'Lucas Landro',        'Pablo Carpanelli',   'Pablo Carpanelli',   'Normal',     'Valid',  '{"sets":[{"challengerGames":3,"challengedGames":6},{"challengerGames":5,"challengedGames":7}]}', ''),
            ('2026-09-05 22:00+00', 'Emiliano Rodriguez',  'Lucas Landro',       'Emiliano Rodriguez', 'Normal',     'Valid',  '{"sets":[{"challengerGames":4,"challengedGames":6},{"challengerGames":6,"challengedGames":3}],"superTieBreak":{"challenger":10,"challenged":7}}', ''),
            ('2026-09-08 22:00+00', 'Nicolás Szlapo',      'Pablo Castillo',     'Nicolás Szlapo',     'Walkover',   'Valid',  '{"sets":[]}', ' W.O. del desafiado'),
            ('2026-09-10 22:00+00', 'Daniel Murdoch',      'Pablo Castillo',     'Daniel Murdoch',     'Retirement', 'Valid',  '{"sets":[{"challengerGames":6,"challengedGames":2},{"challengerGames":3,"challengedGames":1}]}', ' Abandona por lesión'),
            ('2026-09-12 22:00+00', 'Juan Vazquez',        'Julian Benmergui',   'Julian Benmergui',   'Normal',     'Valid',  '{"sets":[{"challengerGames":6,"challengedGames":7,"tieBreak":{"challenger":4,"challenged":7}},{"challengerGames":4,"challengedGames":6}]}', ''),
            ('2026-09-15 22:00+00', 'Gastón Quintana',     'Fran Vazquez',       'Fran Vazquez',       'Normal',     'Valid',  '{"sets":[{"challengerGames":1,"challengedGames":6},{"challengerGames":0,"challengedGames":6}]}', ''),
            ('2026-09-18 22:00+00', 'Juan Vazquez',        'Gastón Quintana',    'Juan Vazquez',       'Normal',     'Valid',  '{"sets":[{"challengerGames":6,"challengedGames":4},{"challengerGames":3,"challengedGames":6}],"superTieBreak":{"challenger":10,"challenged":8}}', ''),
            ('2026-09-20 22:00+00', 'Fede Soda',           'Juan Vazquez',       'Fede Soda',          'Normal',     'Valid',  '{"sets":[{"challengerGames":7,"challengedGames":5},{"challengerGames":6,"challengedGames":2}]}', ''),
            ('2026-09-25 22:00+00', 'Daniel Bernascone',   'Lucas Landro',       'Daniel Bernascone',  'Normal',     'Valid',  '{"sets":[{"challengerGames":6,"challengedGames":3},{"challengerGames":6,"challengedGames":4}]}', ''),
            ('2026-09-26 22:00+00', 'Matias Avalos',       'Hernan del Pozo',    'Matias Avalos',      'Normal',     'Voided', '{"sets":[{"challengerGames":6,"challengedGames":1},{"challengerGames":6,"challengedGames":1}]}', ' Anulado: cargado por error')
        ) AS t(played_at, challenger, challenged, winner, completion, status, score, note)
        ORDER BY played_at
    LOOP
        INSERT INTO matches (played_at, challenger_id, challenged_id, winner_id, score, completion, status, notes, created_at, updated_at)
        SELECT m.played_at, c.id, d.id, w.id, m.score::jsonb, m.completion, m.status, '[dev-seed]' || m.note, m.played_at, m.played_at
        FROM players c, players d, players w
        WHERE c.full_name = m.challenger AND d.full_name = m.challenged AND w.full_name = m.winner
        RETURNING id INTO new_match_id;

        INSERT INTO ranking_events (kind, occurred_at, created_at, match_id)
        VALUES ('MatchPlayed', m.played_at, m.played_at, new_match_id);
    END LOOP;
END
$seed$;

COMMIT;
