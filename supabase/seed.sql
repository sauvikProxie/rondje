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
-- * Fill in the Blanks: grammar sentences with one blank ("___"). Where the
--   blank needs a specific word form, the base form is given in brackets so a
--   typed answer has exactly one correct form. The three distractors are
--   always wrong in that sentence.
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

-- Fill in the Blanks: grammar sentences.
insert into public.grammar_questions (slug, sentence, answer, distractors, translation, topic, level)
values
	-- Verbs: present tense
	('verb_werken', 'Ik ___ (werken) in een ziekenhuis.', 'werk', array['werkt', 'werken', 'gewerkt'], 'I work in a hospital.', 'verbs', 'beginner'),
	('verb_wonen', 'Jij ___ (wonen) in Utrecht, toch?', 'woont', array['woon', 'wonen', 'gewoond'], 'You live in Utrecht, right?', 'verbs', 'beginner'),
	('verb_spreken', 'Wij ___ (spreken) een beetje Nederlands.', 'spreken', array['spreek', 'spreekt', 'gesproken'], 'We speak a little Dutch.', 'verbs', 'beginner'),
	('verb_hebben', 'Mijn zus ___ (hebben) twee kinderen.', 'heeft', array['hebt', 'heb', 'hebben'], 'My sister has two children.', 'verbs', 'beginner'),
	('verb_zijn', '___ (zijn) jullie morgen thuis?', 'Zijn', array['Is', 'Ben', 'Bent'], 'Are you (all) at home tomorrow?', 'verbs', 'beginner'),
	('verb_kunnen', 'Hij ___ (kunnen) goed koken.', 'kan', array['kunt', 'kunnen', 'kant'], 'He can cook well.', 'verbs', 'elementary'),
	('verb_komen', 'Wanneer ___ (komen) jij naar het feest?', 'kom', array['komt', 'komen', 'gekomen'], 'When are you coming to the party?', 'verbs', 'elementary'),
	('verb_gaan', 'De kinderen ___ (gaan) met de trein naar school.', 'gaan', array['gaat', 'ga', 'gegaan'], 'The children go to school by train.', 'verbs', 'beginner'),

	-- Articles: de or het
	('article_kinderen', '___ kinderen spelen in de tuin.', 'De', array['Het', 'Een', 'Dit'], 'The children are playing in the garden.', 'articles', 'beginner'),
	('article_boek', 'Ik lees ___ boek over Amsterdam.', 'het', array['de', 'den', 'deze'], 'I am reading the book about Amsterdam.', 'articles', 'beginner'),
	('article_meisje', '___ meisje heeft een rode fiets.', 'Het', array['De', 'Deze', 'Den'], 'The girl has a red bike.', 'articles', 'elementary'),
	('article_station', 'Waar is ___ station?', 'het', array['de', 'den', 'deze'], 'Where is the station?', 'articles', 'beginner'),
	('article_weer', '___ weer is vandaag mooi.', 'Het', array['De', 'Deze', 'Den'], 'The weather is nice today.', 'articles', 'elementary'),
	('article_man', 'Hoe heet ___ man naast jou?', 'de', array['het', 'dit', 'den'], 'What is the name of the man next to you?', 'articles', 'elementary'),

	-- Prepositions
	('prep_wonen_in', 'Ik woon ___ Nederland.', 'in', array['op', 'aan', 'naar'], 'I live in the Netherlands.', 'prepositions', 'beginner'),
	('prep_liggen_op', 'Het boek ligt ___ de tafel.', 'op', array['aan', 'naar', 'uit'], 'The book is on the table.', 'prepositions', 'beginner'),
	('prep_gaan_naar', 'We gaan morgen ___ de supermarkt.', 'naar', array['in', 'op', 'aan'], 'We are going to the supermarket tomorrow.', 'prepositions', 'beginner'),
	('prep_wachten_op', 'Ik wacht ___ de bus.', 'op', array['aan', 'naar', 'in'], 'I am waiting for the bus.', 'prepositions', 'elementary'),
	('prep_bang_voor', 'Ze is bang ___ honden.', 'voor', array['op', 'aan', 'naar'], 'She is afraid of dogs.', 'prepositions', 'intermediate'),
	('prep_denken_aan', 'Ik denk vaak ___ mijn familie.', 'aan', array['op', 'naar', 'bij'], 'I often think of my family.', 'prepositions', 'intermediate'),
	('prep_om_uur', 'De les begint ___ negen uur.', 'om', array['op', 'in', 'aan'], 'The lesson starts at nine o''clock.', 'prepositions', 'elementary'),

	-- Pronouns
	('pron_hij', 'Mijn broer is ziek. ___ blijft vandaag thuis.', 'Hij', array['Hem', 'Zijn', 'Haar'], 'My brother is ill. He is staying at home today.', 'pronouns', 'beginner'),
	('pron_hem_telefoon', 'Waar is mijn telefoon? Ik kan ___ niet vinden.', 'hem', array['het', 'hij', 'zijn'], 'Where is my phone? I can''t find it.', 'pronouns', 'intermediate'),
	('pron_mijn', 'Is dat jouw jas? Nee, het is ___ jas.', 'mijn', array['ik', 'mij', 'mijne'], 'Is that your coat? No, it is my coat.', 'pronouns', 'beginner'),
	('pron_onze', 'Wij hebben een hond. ___ hond heet Max.', 'Onze', array['Ons', 'Wij', 'Hen'], 'We have a dog. Our dog is called Max.', 'pronouns', 'elementary'),
	('pron_hem_peter', 'Dit is Peter. Ken jij ___?', 'hem', array['hij', 'zijn', 'hen'], 'This is Peter. Do you know him?', 'pronouns', 'beginner'),

	-- Adjectives: with or without -e
	('adj_groot', 'Ik heb een ___ (groot) huis.', 'groot', array['grote', 'grootte', 'groten'], 'I have a big house.', 'adjectives', 'intermediate'),
	('adj_rood', 'De ___ (rood) fiets is van mij.', 'rode', array['rood', 'roodde', 'roden'], 'The red bike is mine.', 'adjectives', 'elementary'),
	('adj_klein', 'Het ___ (klein) kind slaapt.', 'kleine', array['klein', 'kleinen', 'kleiner'], 'The small child is sleeping.', 'adjectives', 'intermediate'),
	('adj_mooi', 'Zij draagt een ___ (mooi) jurk.', 'mooie', array['mooi', 'mooien', 'mooier'], 'She is wearing a beautiful dress.', 'adjectives', 'elementary'),
	('adj_lekker', 'Dat is ___ (lekker) brood.', 'lekker', array['lekkere', 'lekkeren', 'lekkers'], 'That is tasty bread.', 'adjectives', 'advanced'),

	-- Plurals
	('plural_boek', 'Ik heb twee ___ (boek).', 'boeken', array['boeks', 'boekes', 'boek'], 'I have two books.', 'plurals', 'beginner'),
	('plural_stoel', 'Er staan drie ___ (stoel) in de kamer.', 'stoelen', array['stoels', 'stoel', 'stoelens'], 'There are three chairs in the room.', 'plurals', 'beginner'),
	('plural_kind', 'Mijn ___ (kind) gaan naar school.', 'kinderen', array['kinds', 'kinden', 'kindens'], 'My children go to school.', 'plurals', 'elementary'),
	('plural_aardbei', 'In de zomer eten we veel ___ (aardbei).', 'aardbeien', array['aardbeis', 'aardbeiens', 'aardbeies'], 'In summer we eat a lot of strawberries.', 'plurals', 'elementary'),
	('plural_auto', 'Hoeveel ___ (auto) heb je?', 'auto''s', array['autos', 'auto', 'autoën'], 'How many cars do you have?', 'plurals', 'intermediate'),

	-- Past tense
	('past_ben_gegaan', 'Gisteren ___ ik naar de markt gegaan.', 'ben', array['heb', 'is', 'bent'], 'Yesterday I went to the market.', 'past_tense', 'elementary'),
	('past_gekeken', 'Wij hebben een film ___ (kijken).', 'gekeken', array['gekijkt', 'kijken', 'keek'], 'We watched a film.', 'past_tense', 'elementary'),
	('past_gemaakt', 'Heb jij je huiswerk al ___ (maken)?', 'gemaakt', array['gemaakd', 'maken', 'gemaken'], 'Have you already done your homework?', 'past_tense', 'elementary'),
	('past_werkte', 'Mijn moeder ___ (werken) vorig jaar in Rotterdam.', 'werkte', array['werkten', 'werkde', 'gewerkt'], 'My mother worked in Rotterdam last year.', 'past_tense', 'intermediate'),
	('past_had', 'Ik ___ (hebben) gisteren hoofdpijn.', 'had', array['heb', 'hadden', 'hebte'], 'I had a headache yesterday.', 'past_tense', 'intermediate'),
	('past_geslapen', 'Hebben jullie goed ___ (slapen)?', 'geslapen', array['geslaapt', 'slapen', 'sliep'], 'Did you (all) sleep well?', 'past_tense', 'elementary'),

	-- Word order and separable verbs
	('order_opstaan', 'Hoe laat sta jij morgen ___ (opstaan)?', 'op', array['aan', 'uit', 'af'], 'What time are you getting up tomorrow?', 'word_order', 'intermediate'),
	('order_aandoen', 'Doe je jas ___ (aandoen), het is koud.', 'aan', array['op', 'uit', 'af'], 'Put your coat on, it is cold.', 'word_order', 'intermediate'),
	('order_of_komt', 'Ik weet niet of hij morgen ___ (komen).', 'komt', array['kom', 'komen', 'gekomen'], 'I don''t know if he is coming tomorrow.', 'word_order', 'advanced'),
	('order_omdat_neem', 'Omdat het regent, ___ (nemen) ik de bus.', 'neem', array['neemt', 'nemen', 'genomen'], 'Because it is raining, I take the bus.', 'word_order', 'advanced'),
	('order_dat_heeft', 'Hij zegt dat hij geen tijd ___ (hebben).', 'heeft', array['hebt', 'heb', 'hebben'], 'He says that he has no time.', 'word_order', 'advanced')
on conflict (slug) do nothing;
