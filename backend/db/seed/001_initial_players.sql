-- Initial load of the 69 club players and the InitialRanking event (position 1 = first row below).
--
-- * Idempotent: does nothing if an InitialRanking event already exists, so it never duplicates players or events.
-- * Atomic: the whole script runs in one transaction.
-- * Safe for production (Neon) and local. Edit the two dates below if the club's start date differs;
--   every real match must be dated after INITIAL_AT.
--
-- Run (see README):  psql "<connection string>" -f backend/db/seed/001_initial_players.sql

BEGIN;

DO $seed$
DECLARE
    initial_at timestamptz := '2026-01-01 03:00:00+00';   -- INITIAL_AT: 01/01/2026 00:00 club time (UTC-3); join date and date of the InitialRanking event
    initial_event_id bigint;
    order_ids integer[];
BEGIN
    IF EXISTS (SELECT 1 FROM ranking_events WHERE kind = 'InitialRanking') THEN
        RAISE NOTICE 'InitialRanking already exists: nothing to do.';
        RETURN;
    END IF;

    CREATE TEMP TABLE initial_ranking (pos integer PRIMARY KEY, full_name text NOT NULL) ON COMMIT DROP;

    INSERT INTO initial_ranking (pos, full_name) VALUES
        (1, 'Fran Vazquez'), (2, 'Gastón Quintana'), (3, 'Julian Benmergui'), (4, 'Juan Vazquez'),
        (5, 'Pablo Castillo'), (6, 'Gaston Carpanelli'), (7, 'Pablo Carpanelli'), (8, 'Fede Soda'),
        (9, 'Lucas Landro'), (10, 'Emiliano Rodriguez'), (11, 'Nicolás Szlapo'), (12, 'Daniel Murdoch'),
        (13, 'Daniel Bernascone'), (14, 'Hernan del Pozo'), (15, 'Óscar González'), (16, 'Daniel Dallinge'),
        (17, 'Julio Hernandez'), (18, 'Matias Avalos'), (19, 'Rodrigo Pacheco'), (20, 'Alejandro Albarracin'),
        (21, 'Gustavo San Martín'), (22, 'Luciano Dou'), (23, 'Fernando Varela'), (24, 'Raul Báez'),
        (25, 'Eugenio Arenes'), (26, 'Daniel Tonietti'), (27, 'Emilio Fontana'), (28, 'Ariel Dubedout'),
        (29, 'Matias Casadei'), (30, 'Cristian Nitty'), (31, 'Fede Herrera'), (32, 'Sebastian Viseich'),
        (33, 'Guillermo Valerio'), (34, 'Martin Reyes'), (35, 'Agustin Reyes'), (36, 'Mariano Herman'),
        (37, 'Lautaro Landin'), (38, 'Nicolas Niveyro'), (39, 'Marcos Tineo'), (40, 'Martin Gomez'),
        (41, 'Pablo Tanous'), (42, 'Sebastian Custeau'), (43, 'Valentin Medina'), (44, 'Guillermo Crespo'),
        (45, 'Pablo Castells'), (46, 'Juan Benegas'), (47, 'Diego Di Nucci'), (48, 'Carlitos Perez'),
        (49, 'Alfredo Kina'), (50, 'Jorge Garrido'), (51, 'Tacio Battilana'), (52, 'Martin Benson'),
        (53, 'Martin Pintos'), (54, 'Simon Moran'), (55, 'Francisco Cata'), (56, 'Luis Infante'),
        (57, 'Benicio Dorsa'), (58, 'Fabricio Landaluce'), (59, 'Bruno Elia'), (60, 'Pablo Esteban'),
        (61, 'Gaston Beraldo'), (62, 'Alan Lubris'), (63, 'Marcelo Perez'), (64, 'Marcelo Naccarato'),
        (65, 'Bruno Macri'), (66, 'Flavio Arnoldo'), (67, 'Juan Manuel Arizaga'), (68, 'Diego Caggero'),
        (69, 'Nestor Sassano');

    INSERT INTO players (full_name, joined_at, is_active)
    SELECT i.full_name, initial_at, true
    FROM initial_ranking i
    ORDER BY i.pos;

    SELECT array_agg(p.id ORDER BY i.pos) INTO order_ids
    FROM initial_ranking i
    JOIN players p ON p.full_name = i.full_name;

    INSERT INTO ranking_events (kind, occurred_at, created_at, initial_order)
    VALUES ('InitialRanking', initial_at, now(), order_ids)
    RETURNING id INTO initial_event_id;

    -- Snapshot and history are derived data (regenerable with: rebuild-ranking); seeded so the ranking is readable right away.
    INSERT INTO ranking_snapshot (position, player_id)
    SELECT ord, pid FROM unnest(order_ids) WITH ORDINALITY AS t(pid, ord);

    INSERT INTO ranking_history (event_id, player_id, occurred_at, from_position, to_position)
    SELECT initial_event_id, pid, initial_at, NULL, ord FROM unnest(order_ids) WITH ORDINALITY AS t(pid, ord);
END
$seed$;

COMMIT;
