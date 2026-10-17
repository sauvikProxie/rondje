-- =============================================================================
-- Rondje — initial vocabulary (apply after supabase/schema.sql)
--
-- * Nouns cover the eight themes from spec 7.3. Each noun has one emoji, its
--   Dutch word (lower case) and its correct article. Emoji and words are unique,
--   so no two pairs in a game can share an emoji or a word.
-- * From every noun the script derives three explicit pairs:
--     image_pairs  (emoji + same emoji)
--     word_image   (emoji + word)              e.g. 🚲 + "fiets"
--     de_het       (emoji + article and noun)  e.g. 🏠 + "het huis"
-- * Opposites are a general set (not tied to themes): 20 explicit pairs, each
--   word used in exactly one pair.
-- Re-runnable: existing rows are left untouched.
-- =============================================================================

insert into public.vocabulary_items (slug, word, article, emoji, theme, level)
values
	-- Transport
	('auto', 'auto', 'de', '🚗', 'transport', 'beginner'),
	('fiets', 'fiets', 'de', '🚲', 'transport', 'beginner'),
	('bus', 'bus', 'de', '🚌', 'transport', 'beginner'),
	('trein', 'trein', 'de', '🚆', 'transport', 'beginner'),
	('vliegtuig', 'vliegtuig', 'het', '✈️', 'transport', 'beginner'),
	('boot', 'boot', 'de', '🚤', 'transport', 'beginner'),
	('tram', 'tram', 'de', '🚊', 'transport', 'elementary'),
	('taxi', 'taxi', 'de', '🚕', 'transport', 'beginner'),
	('vrachtwagen', 'vrachtwagen', 'de', '🚚', 'transport', 'elementary'),
	('helikopter', 'helikopter', 'de', '🚁', 'transport', 'elementary'),

	-- Eten en drinken
	('appel', 'appel', 'de', '🍎', 'eten_en_drinken', 'beginner'),
	('brood', 'brood', 'het', '🍞', 'eten_en_drinken', 'beginner'),
	('kaas', 'kaas', 'de', '🧀', 'eten_en_drinken', 'beginner'),
	('ei', 'ei', 'het', '🥚', 'eten_en_drinken', 'beginner'),
	('melk', 'melk', 'de', '🥛', 'eten_en_drinken', 'beginner'),
	('koffie', 'koffie', 'de', '☕', 'eten_en_drinken', 'beginner'),
	('banaan', 'banaan', 'de', '🍌', 'eten_en_drinken', 'beginner'),
	('wortel', 'wortel', 'de', '🥕', 'eten_en_drinken', 'elementary'),
	('aardbei', 'aardbei', 'de', '🍓', 'eten_en_drinken', 'elementary'),
	('citroen', 'citroen', 'de', '🍋', 'eten_en_drinken', 'elementary'),

	-- Huis
	('huis', 'huis', 'het', '🏠', 'huis', 'beginner'),
	('deur', 'deur', 'de', '🚪', 'huis', 'beginner'),
	('bed', 'bed', 'het', '🛏️', 'huis', 'beginner'),
	('stoel', 'stoel', 'de', '🪑', 'huis', 'beginner'),
	('bank', 'bank', 'de', '🛋️', 'huis', 'elementary'),
	('sleutel', 'sleutel', 'de', '🔑', 'huis', 'beginner'),
	('raam', 'raam', 'het', '🪟', 'huis', 'beginner'),
	('lamp', 'lamp', 'de', '💡', 'huis', 'beginner'),
	('douche', 'douche', 'de', '🚿', 'huis', 'elementary'),
	('bad', 'bad', 'het', '🛁', 'huis', 'beginner'),

	-- Lichaam en dokter
	('oog', 'oog', 'het', '👁️', 'lichaam_en_dokter', 'beginner'),
	('neus', 'neus', 'de', '👃', 'lichaam_en_dokter', 'beginner'),
	('oor', 'oor', 'het', '👂', 'lichaam_en_dokter', 'beginner'),
	('mond', 'mond', 'de', '👄', 'lichaam_en_dokter', 'beginner'),
	('hand', 'hand', 'de', '✋', 'lichaam_en_dokter', 'beginner'),
	('voet', 'voet', 'de', '🦶', 'lichaam_en_dokter', 'beginner'),
	('been', 'been', 'het', '🦵', 'lichaam_en_dokter', 'elementary'),
	('tand', 'tand', 'de', '🦷', 'lichaam_en_dokter', 'elementary'),
	('dokter', 'dokter', 'de', '🧑‍⚕️', 'lichaam_en_dokter', 'beginner'),
	('ziekenhuis', 'ziekenhuis', 'het', '🏥', 'lichaam_en_dokter', 'elementary'),
	('pil', 'pil', 'de', '💊', 'lichaam_en_dokter', 'elementary'),
	('pleister', 'pleister', 'de', '🩹', 'lichaam_en_dokter', 'intermediate'),

	-- Werk
	('computer', 'computer', 'de', '💻', 'werk', 'beginner'),
	('pen', 'pen', 'de', '🖊️', 'werk', 'beginner'),
	('potlood', 'potlood', 'het', '✏️', 'werk', 'beginner'),
	('telefoon', 'telefoon', 'de', '📱', 'werk', 'beginner'),
	('kantoor', 'kantoor', 'het', '🏢', 'werk', 'elementary'),
	('hamer', 'hamer', 'de', '🔨', 'werk', 'elementary'),
	('brief', 'brief', 'de', '✉️', 'werk', 'elementary'),
	('map', 'map', 'de', '📁', 'werk', 'intermediate'),
	('kalender', 'kalender', 'de', '📅', 'werk', 'elementary'),
	('schaar', 'schaar', 'de', '✂️', 'werk', 'intermediate'),

	-- Boodschappen
	('winkelwagen', 'winkelwagen', 'de', '🛒', 'boodschappen', 'elementary'),
	('geld', 'geld', 'het', '💶', 'boodschappen', 'beginner'),
	('portemonnee', 'portemonnee', 'de', '👛', 'boodschappen', 'intermediate'),
	('mand', 'mand', 'de', '🧺', 'boodschappen', 'elementary'),
	('bonnetje', 'bonnetje', 'het', '🧾', 'boodschappen', 'intermediate'),
	('pinpas', 'pinpas', 'de', '💳', 'boodschappen', 'elementary'),
	('tas', 'tas', 'de', '🛍️', 'boodschappen', 'beginner'),
	('zout', 'zout', 'het', '🧂', 'boodschappen', 'elementary'),
	('vis', 'vis', 'de', '🐟', 'boodschappen', 'beginner'),
	('rijst', 'rijst', 'de', '🍚', 'boodschappen', 'beginner'),

	-- Weer
	('zon', 'zon', 'de', '☀️', 'weer', 'beginner'),
	('regen', 'regen', 'de', '🌧️', 'weer', 'beginner'),
	('sneeuw', 'sneeuw', 'de', '❄️', 'weer', 'beginner'),
	('wolk', 'wolk', 'de', '☁️', 'weer', 'beginner'),
	('wind', 'wind', 'de', '🌬️', 'weer', 'beginner'),
	('bliksem', 'bliksem', 'de', '⚡', 'weer', 'elementary'),
	('regenboog', 'regenboog', 'de', '🌈', 'weer', 'elementary'),
	('paraplu', 'paraplu', 'de', '☂️', 'weer', 'beginner'),
	('mist', 'mist', 'de', '🌫️', 'weer', 'intermediate'),
	('onweer', 'onweer', 'het', '⛈️', 'weer', 'intermediate'),

	-- Familie
	('gezin', 'gezin', 'het', '👪', 'familie', 'elementary'),
	('baby', 'baby', 'de', '👶', 'familie', 'beginner'),
	('oma', 'oma', 'de', '👵', 'familie', 'beginner'),
	('opa', 'opa', 'de', '👴', 'familie', 'beginner'),
	('meisje', 'meisje', 'het', '👧', 'familie', 'beginner'),
	('jongen', 'jongen', 'de', '👦', 'familie', 'beginner'),
	('man', 'man', 'de', '👨', 'familie', 'beginner'),
	('vrouw', 'vrouw', 'de', '👩', 'familie', 'beginner'),
	('kind', 'kind', 'het', '🧒', 'familie', 'beginner'),
	('bruiloft', 'bruiloft', 'de', '💒', 'familie', 'intermediate')
on conflict (slug) do nothing;

-- Opposite words (no emoji, no article, no theme).
insert into public.vocabulary_items (slug, word, article, emoji, theme, level)
values
	('groot', 'groot', null, null, null, 'beginner'),
	('klein', 'klein', null, null, null, 'beginner'),
	('warm', 'warm', null, null, null, 'beginner'),
	('koud', 'koud', null, null, null, 'beginner'),
	('open', 'open', null, null, null, 'beginner'),
	('dicht', 'dicht', null, null, null, 'beginner'),
	('hoog', 'hoog', null, null, null, 'beginner'),
	('laag', 'laag', null, null, null, 'beginner'),
	('lang', 'lang', null, null, null, 'beginner'),
	('kort', 'kort', null, null, null, 'beginner'),
	('snel', 'snel', null, null, null, 'beginner'),
	('langzaam', 'langzaam', null, null, null, 'elementary'),
	('oud', 'oud', null, null, null, 'beginner'),
	('jong', 'jong', null, null, null, 'beginner'),
	('licht', 'licht', null, null, null, 'elementary'),
	('donker', 'donker', null, null, null, 'elementary'),
	('dik', 'dik', null, null, null, 'beginner'),
	('dun', 'dun', null, null, null, 'beginner'),
	('vol', 'vol', null, null, null, 'beginner'),
	('leeg', 'leeg', null, null, null, 'beginner'),
	('nat', 'nat', null, null, null, 'beginner'),
	('droog', 'droog', null, null, null, 'elementary'),
	('vroeg', 'vroeg', null, null, null, 'elementary'),
	('laat', 'laat', null, null, null, 'elementary'),
	('duur', 'duur', null, null, null, 'elementary'),
	('goedkoop', 'goedkoop', null, null, null, 'elementary'),
	('blij', 'blij', null, null, null, 'elementary'),
	('verdrietig', 'verdrietig', null, null, null, 'intermediate'),
	('sterk', 'sterk', null, null, null, 'elementary'),
	('zwak', 'zwak', null, null, null, 'elementary'),
	('hard', 'hard', null, null, null, 'elementary'),
	('zacht', 'zacht', null, null, null, 'elementary'),
	('makkelijk', 'makkelijk', null, null, null, 'elementary'),
	('moeilijk', 'moeilijk', null, null, null, 'elementary'),
	('schoon', 'schoon', null, null, null, 'elementary'),
	('vies', 'vies', null, null, null, 'elementary'),
	('arm', 'arm', null, null, null, 'intermediate'),
	('rijk', 'rijk', null, null, null, 'intermediate'),
	('binnen', 'binnen', null, null, null, 'elementary'),
	('buiten', 'buiten', null, null, null, 'elementary')
on conflict (slug) do nothing;

-- Image Pairs, Word–Image and De Het pairs for every noun.
insert into public.vocabulary_pairs (variant, item_a, face_a, item_b, face_b)
select v.variant, i.id, 'image', i.id, v.face_b
from public.vocabulary_items i
cross join (
	values
		('image_pairs'::public.game_variant, 'image'::public.card_face_kind),
		('word_image'::public.game_variant, 'word'::public.card_face_kind),
		('de_het'::public.game_variant, 'article_word'::public.card_face_kind)
) as v (variant, face_b)
where i.emoji is not null and i.article is not null
on conflict (variant, item_a, item_b) do nothing;

-- Opposites: explicitly defined relationships.
insert into public.vocabulary_pairs (variant, item_a, face_a, item_b, face_b)
select 'opposites', a.id, 'word', b.id, 'word'
from (
	values
		('groot', 'klein'),
		('warm', 'koud'),
		('open', 'dicht'),
		('hoog', 'laag'),
		('lang', 'kort'),
		('snel', 'langzaam'),
		('oud', 'jong'),
		('licht', 'donker'),
		('dik', 'dun'),
		('vol', 'leeg'),
		('nat', 'droog'),
		('vroeg', 'laat'),
		('duur', 'goedkoop'),
		('blij', 'verdrietig'),
		('sterk', 'zwak'),
		('hard', 'zacht'),
		('makkelijk', 'moeilijk'),
		('schoon', 'vies'),
		('arm', 'rijk'),
		('binnen', 'buiten')
) as o (slug_a, slug_b)
join public.vocabulary_items a on a.slug = o.slug_a
join public.vocabulary_items b on b.slug = o.slug_b
on conflict (variant, item_a, item_b) do nothing;
