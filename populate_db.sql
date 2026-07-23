\c pulse_db;

-- Curățăm tabelele existente
TRUNCATE TABLE friendships, comments, event_joins, check_ins, events, users CASCADE;

-- === 1. UTILIZATORI DEMO ===
-- Am înlocuit 'u1111...' cu '11111...' pentru a avea UUID-uri valide (numai caractere hexazecimale)
INSERT INTO users (id, username, email, password_hash, avatar_url, role, bio) VALUES
('11111111-1111-1111-1111-111111111111', 'dj_andrei', 'andrei@pulse.dev', '$2a$10$7Z2vH7X8E6mYqZ.hO4FwO.Z3hF7J0G2yB0n7o7Y2b3C4d5e6f7g8h', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde', 'organizer', 'Rezident DJ la Kristal Club. Techno & House enthusiast.'),
('22222222-2222-2222-2222-222222222222', 'maria_s', 'maria@pulse.dev', '$2a$10$7Z2vH7X8E6mYqZ.hO4FwO.Z3hF7J0G2yB0n7o7Y2b3C4d5e6f7g8h', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330', 'user', 'Just here for the bass and good vibes.'),
('33333333-3333-3333-3333-333333333333', 'vlad_pop', 'vlad@pulse.dev', '$2a$10$7Z2vH7X8E6mYqZ.hO4FwO.Z3hF7J0G2yB0n7o7Y2b3C4d5e6f7g8h', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d', 'user', 'Club hopper. House music all night long.');

-- === 2. EVENIMENTE ===
-- Dacă tabela ta folosește organizer_id, se va insera corect aici.
INSERT INTO events (id, organizer_id, title, description, category, banner_url, location_name, city, vibe, latitude, longitude, start_time, end_time, is_live) VALUES
-- Petrecere LIVE ACUM
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Subterranean Beats', 'An underground journey into deep tech and minimal techno.', 'Techno', 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7', 'Club Guesthouse, București', 'Bucuresti', 'Underground', 44.4268, 26.1025, NOW() - INTERVAL '2 hours', NOW() + INTERVAL '4 hours', true),

-- Petrecere VIITOARE
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Sunset Rooftop Session', 'Melodic house and sunset drinks on the best rooftop in town.', 'House', 'https://images.unsplash.com/photo-1574391884720-bbc3740c59d1', 'Linea / Closer to the Moon', 'Bucuresti', 'Chill', 44.4325, 26.0998, NOW() + INTERVAL '12 hours', NOW() + INTERVAL '18 hours', false),

-- Festival weekend-ul următor
('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'Summer Pulse Festival', 'Three days of music, art, and community by the lake.', 'Festival', 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745', 'Lacul Snagov', 'Bucuresti', 'Outdoor', 44.7042, 26.1739, NOW() + INTERVAL '5 days', NOW() + INTERVAL '8 days', false);

-- === 3. INTERACȚIUNI ===
-- Maria face check-in la Guesthouse (live)
INSERT INTO check_ins (user_id, event_id) VALUES
('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- Vlad cere să dea Join la petrecerea de pe Rooftop
INSERT INTO event_joins (event_id, user_id, status) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'accepted');

-- === 4. COMENTARII ===
INSERT INTO comments (event_id, user_id, content) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Sistemul de sunet e demențial la Guesthouse diseară! 🔥'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'Ajunge cineva pe la 12? Ne vedem acolo!');
