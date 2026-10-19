# Rondje — Product & Technical Specification

**Document purpose:** Define the product requirements, game rules,
technical architecture, database structure, user experience, and
acceptance criteria for Rondje.

**Status:** Implementation specification  
**Priority:** This document is the primary reference for implementation.
Where the existing codebase conflicts with this specification, follow
this specification and rebuild the conflicting functionality.

---

# 1. Product Overview

## 1.1 What is Rondje?

Rondje is a browser-based, multiplayer Dutch-language learning game
designed for people who want to practise Dutch vocabulary in a fun,
social environment.

A host creates a game session, configures the game, and invites
participants through a QR code or join link. Players join using a
nickname and an emoji avatar, enter the lobby, and participate in a
shared memory game.

The game helps players learn Dutch vocabulary through visual
associations, word recognition, articles, and opposites.

The application should work well on mobile phones, tablets, and desktop
browsers.

## 1.2 Core Product Principles

1.  **Simplicity:** Users should understand how to join and play without
    extensive instructions.
2.  **Multiplayer consistency:** Every participant must see the same
    shared game state, while private card information remains private.
3.  **Fair gameplay:** Every player gets an identical board (same
    cards, same positions).
4.  **Dutch-language learning:** All vocabulary content should support
    learning Dutch.
5.  **Responsive design:** The player experience must prioritise mobile
    screens.
6.  **Reliable sessions:** Refreshing a page or temporarily losing
    connectivity should not unnecessarily remove a player from an active
    game.
7.  **Clear host controls:** Session management and game controls must
    be easy to find.
8.  **Maintainability:** Business logic, database access, validation,
    and UI components must be separated appropriately.
9.  **Security:** The server must validate every operation that changes
    the game state.
10. **Focused scope:** Implement the specified game experience without
    introducing unrelated features.

---

# 2. Scope

## 2.1 Features Included

-   Public landing page.
-   Host authentication.
-   Host dashboard.
-   Game-session creation and management.
-   Unique session join codes.
-   QR-code generation.
-   Shareable invitation links.
-   Player onboarding.
-   Nickname and avatar selection.
-   Player proficiency-level selection.
-   Lobby with participant status.
-   One game per session.
-   One shared game table per session.
-   Four Matchen game variants.
-   Server-controlled board generation.
-   Multiplayer game-state synchronisation.
-   Turn management.
-   Match detection.
-   Score calculation.
-   Game completion and results.
-   Host controls to start and end a game.
-   Player removal by the host.
-   Reconnection and session recovery.
-   Responsive layouts.
-   Database security and access control.
-   Automated tests for critical game mechanics and user journeys.

## 2.2 Features Explicitly Excluded

Do not implement:

-   Multiple games within one session.
-   Playlists or game sequences.
-   Multiple tables within one session.
-   Team-based gameplay.
-   Speech recognition.
-   Voice recording or audio submissions.
-   Voting or sentence-construction workflows.
-   Organiser account management beyond the specified host
    authentication.
-   Custom card-deck creation.
-   Email-based vocabulary lists.
-   Payment processing.
-   Subscription management.
-   Organiser analytics.
-   A dedicated shared-screen presentation mode.
-   Other games unrelated to Matchen.

Do not introduce these features merely because they might be useful in
the future.

---

# 3. Technology Stack

| Area | Technology |
|---|---|
| Application framework | SvelteKit |
| UI framework | Svelte 5 |
| Programming language | TypeScript with strict checking |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| Database access | `@supabase/supabase-js` |
| Server-side authentication and sessions | `@supabase/ssr` |
| Realtime communication | Supabase Realtime |
| Private game communication | Private Broadcast channels and Presence |
| Styling | Tailwind CSS v4 |
| Validation | Zod |
| QR codes | `qrcode` |
| Typography | `@fontsource-variable/nunito` |
| Unit testing | Vitest |
| Browser testing | Playwright |
| Deployment adapter | `@sveltejs/adapter-vercel` |

## 3.1 Architectural Requirements

-   Use SvelteKit server routes and server-side functions for trusted
    operations.
-   Use Svelte 5 runes for reactive state.
-   Keep TypeScript strict mode enabled.
-   Use Supabase PostgreSQL as the persistent source of truth.
-   Use Supabase Realtime for game-state notifications and participant
    presence.
-   Do not introduce Socket.IO, Redis, or a custom Node.js game server.
-   Do not introduce React or another frontend framework.
-   Do not duplicate business rules between unrelated components.
-   Keep game rules independent of the UI so they can be tested
    separately.
-   Generate or maintain TypeScript types corresponding to the database
    schema.
-   Validate all incoming data on the server.
-   Keep privileged Supabase credentials exclusively on the server.

Realtime messages are notifications, not a substitute for authoritative
database state.

---

# 4. User Roles

## 4.1 Host

The host is responsible for creating and managing a game session.

The host can:

-   Sign in.
-   View their sessions.
-   Create a session.
-   Configure its game variant and number of pairs.
-   View the session join code and QR code.
-   Copy the invitation link.
-   View participants in the lobby.
-   Remove participants.
-   Start the game.
-   End an active game.
-   View the final results.

A host must not be able to manipulate scores directly through
client-side requests.

The host is a facilitator, not a player. The host does not receive a
board, does not take turns, and does not count towards the minimum number
of players. The host signs in with email and password through Supabase
Auth (no magic links or OAuth in this version, so the end-to-end test
can sign in without an inbox).

## 4.2 Player

A player participates in a session using a nickname and avatar.

Players can:

-   Join using a session code or invitation link.
-   Choose a nickname.
-   Choose an emoji avatar.
-   Select a proficiency level.
-   View the lobby.
-   View their own cards.
-   Select cards when it is their turn.
-   See the shared game table.
-   View the current player and scores.
-   View game results.
-   Rejoin their session after refreshing or temporarily disconnecting.

Players do not need to provide an email address or create a traditional
password-based account.

Use Supabase anonymous authentication where supported and enabled.
Player identity must be associated with the authenticated identity and
the relevant session.

Do not rely on a nickname, URL parameter, or client-supplied player ID
as proof of identity.

---

# 5. Session Management

## 5.1 Session Structure

A session contains exactly one Matchen game and one shared game table.

Each session must contain, at minimum:

-   A unique database identifier.
-   A human-readable session name.
-   A unique six-character join code.
-   The host's authenticated user ID.
-   An optional scheduled date and time.
-   The selected Matchen variant.
-   The configured number of pairs.
-   The current session status.
-   The creation timestamp.
-   The game-start timestamp, where applicable.
-   The game-end timestamp, where applicable.

The six-character join code should use an unambiguous character set
where practical. Join codes must be unique and validated on the server.

## 5.2 Session States

A session follows this lifecycle:

1.  **Lobby:** The session exists, and players can join.
2.  **In progress:** The host has started the game.
3.  **Completed:** The game has ended.

The database must enforce valid transitions through trusted server-side
operations.

A completed session must not accept new players into the active game.

A player attempting to join a nonexistent or completed session must
receive a clear error message. Sessions do not expire by time in this
version; the optional scheduled date and time is informational only.

New players may join only while the session is in the lobby. A session
that is in progress does not accept new players, but existing players
may reconnect.

## 5.3 Creating a Session

The host must be able to configure:

-   Session name.
-   Optional date and time.
-   Matchen variant.
-   Number of pairs: 6, 8, or 12.

The host should be able to review the configuration before starting the
session.

The session creation process must validate the requested configuration
and generate a unique join code.

## 5.4 Invitation

Each session must provide:

-   A join code.
-   A QR code.
-   A shareable invitation link.
-   A copy-link action.
-   A clear indication of the session status.

The invitation link must use the configured application URL rather than
a hard-coded production domain.

---

# 6. Player Onboarding and Lobby

## 6.1 Joining a Session

A player can join by entering the session code on the landing page,
opening a valid invitation link, or scanning the session QR code.

The application must validate the session before displaying the
onboarding form.

## 6.2 Player Information

### Nickname

-   Required.
-   Between 1 and 20 characters after trimming whitespace.
-   Must not duplicate another active player's nickname within the same
    session, using a consistent case-insensitive comparison.
-   Must be validated on the server.

### Avatar

An emoji selected from a predefined collection. No external image upload
is required.

### Dutch proficiency level

Provide these options:

-   Beginner.
-   Elementary.
-   Intermediate.
-   Advanced.

These selections support the learning experience and should not affect
game mechanics unless a future specification explicitly requires it.

## 6.3 Lobby

The lobby must display:

-   Session name.
-   Selected game variant.
-   Number of pairs.
-   Number of participants.
-   Participant avatars.
-   Participant nicknames.
-   Participant online/offline status.
-   Host identity or a clear host indicator.
-   A waiting message before the game starts.

The host must be able to remove a participant before or during a
session, subject to the game's lifecycle and security rules. Removed
participants must no longer be able to perform game actions or receive
protected game-state updates.

## 6.4 Starting the Game

An **eligible player** is a player record in the session that has not
been removed by the host. Online/offline presence does not affect
eligibility to start.

The host can start the game when at least two eligible players are
present.

Before starting, the server must verify:

-   The host is authorised to start the session.
-   The session is still in the lobby.
-   At least two eligible players are present.
-   The selected variant is valid.
-   Enough valid vocabulary pairs exist for the selected configuration.
-   The board layout can be generated successfully.

The server must initialise the game state and all boards before marking
the game as in progress. The game must not start with an invalid or
partially generated layout.

---

# 7. Matchen Game

## 7.1 General Gameplay

Matchen is a turn-based multiplayer memory-matching game.

**Every player has their own board.** A board is a grid of face-down
cards made up of complete pairs: both cards of every pair are on the
same player's board. With 8 pairs, each player's board has 16 cards.

**Every board is identical.** All players' boards contain the same
cards in the same positions. The server generates one shuffled layout
per game and gives every player a copy of it, so no player gets an
easier or harder board.

**Turns.** Players take turns in a fixed order. On their turn, the
active player flips two face-down cards on their own board, one at a
time. Every participant sees each flip as it happens.

-   **Match:** both cards stay face up on that player's board as
    matched, the player earns one point, and they flip again
    immediately.
-   **No match:** both cards stay visible briefly, then turn face down
    again, and the turn passes to the next player.

Example with Player A and Player B: A flips two cards and finds a
match, so A scores and flips two more. A flips two cards that do not
match, so they turn back over and it is B's turn on B's board. B
continues the same way until B misses.

**Shared memory.** Because the boards are identical and every flip is
visible to everyone, a card revealed on Player A's board tells Player B
what is in the same position on B's board (unless B has already matched
it). Remembering other players' flips is part of the game.

**Winning.** The game ends as soon as one player has matched every pair
on their board. That player wins. All players' scores (pairs matched on
their own board) are shown in the results. The host can also end the
game early, in which case the highest score wins and ties are possible.
(If the game continued until every board was cleared, every player would
finish with the same score, so the game ends at the first cleared
board.)

**The server determines whether cards match. The browser must never be
trusted to report a successful match or calculate an authoritative
score.**

## 7.2 Game Variants

Support exactly four variants in this version.

### Variant 1: Image Pairs

Two cards match when they represent the same image or emoji.

Example: 🍎 matches 🍎.

### Variant 2: Word–Image

One card contains an image or emoji, and the other contains the
corresponding Dutch word.

Example: 🐱 matches "Kat".

### Variant 3: De Het

One card contains an image or emoji representing a noun, and the other
contains the Dutch noun with its correct article.

Example: 🏠 matches "Het huis".

The pair is valid only when the article and noun are correct.

### Variant 4: Opposites

Two cards match when their Dutch words represent opposites.

Examples:

-   Groot / Klein.
-   Warm / Koud.
-   Open / Dicht.
-   Hoog / Laag.

Opposite relationships must be explicitly defined in the vocabulary
data. Do not infer matches from arbitrary words in the client.

## 7.3 Vocabulary Themes

The initial vocabulary collection should cover:

1.  Transport.
2.  Eten en drinken.
3.  Huis.
4.  Lichaam en dokter.
5.  Werk.
6.  Boodschappen.
7.  Weer.
8.  Familie.

The vocabulary data should contain enough valid pairs to support the
available game configurations where content exists.

Do not generate placeholder vocabulary that incorrectly claims to be a
valid match.

Use emoji as the initial visual representation when suitable. Do not use
fabricated image URLs, audio URLs, or unavailable external assets.

Vocabulary records should be structured so that real images can be
introduced later without changing the core game engine.

The host does not choose a theme in this version. At game start the
server selects the required number of pairs at random from all active
pairs for the chosen variant, across all themes. Themes are metadata for
organising content.

Seed at least 12 valid, distinct pairs for every variant so that all
three pair counts work for all four variants. Opposites are not tied to
the eight themes; seed them as a general set. Within a single game, no
two pairs may use the same emoji or the same Dutch word, so that every
match is unambiguous.

## 7.4 Number of Pairs

The host can select 6, 8, or 12 pairs. The server must confirm that the
selected variant has enough valid pairs before starting.

Each player's board contains twice the selected number of cards. For
example, with eight pairs, each board has sixteen cards.

---

# 8. Board Generation and Hidden Information

## 8.1 Generating the Layout

At game initialisation, in one atomic operation:

1.  Select the required number of valid pairs for the chosen variant.
2.  Generate the two cards belonging to each pair.
3.  Shuffle the cards into board positions using server-side logic.
4.  Store this single layout for the game.
5.  Create a board for every eligible player, referencing the same
    layout, with every position unmatched.
6.  Establish the turn order (random, server-side).
7.  Ensure every generated card corresponds to a valid pair and every
    pair appears exactly twice in the layout.
8.  Persist all of this before marking the game as in progress.

Do not copy card content into each player's board. Store the layout
once and keep per-player state (matched positions) separately.

## 8.2 Hidden and Visible Information

Face-down card content is secret from everyone, including the board's
owner and the host. The server must never send the content of a
face-down position to any client.

Every participant (players and host) may see:

-   Every player's board as a grid of positions, with each position's
    state: face down, currently flipped, or matched.
-   The content of a position only while it is flipped in the current
    attempt or after it has been matched on that player's board.
-   The outcome of each attempt.

Because all boards share one layout, content revealed at a position on
one board is the same at that position on every board. This is intended
(section 7.1) and is the only way information about hidden cards
becomes known.

Players must not be able to retrieve hidden card content by inspecting
browser requests, reading database tables directly, subscribing to a
Realtime channel, manipulating client-side state, or changing an ID in a
request. Card identifiers sent to clients are board positions (or
opaque IDs) and must not encode the pair, the vocabulary item, or the
content.

## 8.3 Flip Validation

When a player flips a card, the server must verify that:

-   The game is in progress.
-   The player belongs to the session and has not been removed.
-   It is that player's turn.
-   The position is on the player's own board.
-   The position is not already matched on that board.
-   The position is not already flipped in the current attempt.
-   No mismatch reveal is currently pending.

An invalid action must not alter the score, turn, board state, or game
status.

---

# 9. Turn Management

## 9.1 Turn Order

The server sets the turn order randomly when the game starts. It stays
fixed for the whole game; removed players are skipped.

Only the active player may flip cards.

## 9.2 Flipping Cards

An attempt consists of two flips, each a separate request containing
the board position, a unique action ID, and the state revision the
client last saw:

1.  **First flip:** the server reveals the card's content to all
    participants and records it as the pending first card.
2.  **Second flip:** the server reveals the second card, compares the
    two, and resolves the attempt atomically.

Flipping one card at a time matters: the player sees the first card
before choosing the second, as in a normal memory game.

The server must reject:

-   Flipping a position on another player's board.
-   Flipping the same position twice in one attempt.
-   Flipping a matched position.
-   Flipping a third card while a mismatch reveal is pending.
-   Flipping when it is not the player's turn.
-   Flipping after the game has ended.
-   Replaying an already processed action ID.

A player cannot bypass these rules by manipulating browser state or
issuing requests directly.

## 9.3 Successful Match

When the two flipped cards form a valid pair:

1.  The server verifies the pair.
2.  Both positions are marked as matched on that player's board only.
3.  The player receives one point.
4.  The matched cards stay face up on that player's board.
5.  If that player has now matched every pair, the game ends
    (section 9.6).
6.  Otherwise the turn stays with the same player, who flips again, and
    their turn deadline is reset.
7.  The new state is synchronised with all participants.

A successful match must be scored exactly once. Duplicate requests and
repeated Realtime messages must never award additional points.

## 9.4 Unsuccessful Match

When the two flipped cards do not match:

1.  The server records the attempt.
2.  Both cards stay visible to all participants for the reveal
    interval.
3.  The cards then turn face down again.
4.  The turn passes to the next player in the turn order who has not
    been removed.

The client must not be able to decide that the reveal has finished
simply by sending a request.

**Implementation requirement (serverless-safe timing):** the app is
deployed on Vercel, where a server function cannot reliably keep a
timer running after it has responded. Do not use `setTimeout` on the
server to flip cards back. Instead:

1.  When a mismatch occurs, persist it with a `reveal_until` timestamp
    set by the database clock (`now()` plus the reveal interval).
2.  Any server read of the game state, and any game action, first calls
    a database function that resolves overdue transitions under a row
    lock: if `now() >= reveal_until`, turn the cards face down, advance
    the turn, and increment the revision. This function is idempotent.
3.  Clients schedule a state refetch at `reveal_until`; the server
    decides whether the reveal has actually finished.

## 9.5 Timing Constants

Define these once as shared constants (in TypeScript and in SQL):

-   Mismatch reveal interval: 2.5 seconds.
-   Turn time limit: 60 seconds.

## 9.6 Disconnected and Removed Players

-   A disconnected player keeps their place in the turn order and their
    board; they are not skipped merely for being offline, because they
    may reconnect.
-   Each turn has a deadline (`turn_until`, set by the database clock).
    If the active player has not completed an attempt before the
    deadline, any pending first flip is turned back face down and the
    turn passes to the next player. This uses the same lazy, idempotent
    resolution as the mismatch reveal, so an absent player cannot stall
    the game.
-   When the host removes a player during a game, in one atomic
    operation: mark them removed, cancel their pending attempt if they
    were active and advance the turn, keep their score in the results
    (marked as removed), and increment the revision. Their board is no
    longer playable.
-   If fewer than two non-removed players remain, the game ends.

## 9.7 End of Game

The game ends when:

-   a player matches every pair on their board (that player wins), or
-   the host ends the game, or
-   fewer than two non-removed players remain.

The server determines when the game is complete. Once completed:

-   No further cards may be flipped.
-   No additional scores may be awarded.
-   Pending actions must not modify the final result.
-   The final scores and the reason the game ended must be persisted.
-   All participants must receive the completed state.

---

# 10. Scoring and Results

## 10.1 Scoring

Each successfully matched pair awards exactly one point to the player
who matched it. Incorrect attempts do not award points.

Scores must be calculated and persisted by trusted server-side logic. Do
not accept score values supplied by the browser.

## 10.2 Live Scoreboard

During gameplay, display:

-   Player avatar.
-   Player nickname.
-   Current score.
-   Active-player indicator.
-   Pairs matched and pairs remaining on each player's board.

The scoreboard must update consistently for all participants.

## 10.3 Results Screen

When the game finishes, display:

-   Session name.
-   Game variant.
-   Final scores.
-   Player avatars and nicknames.
-   Final rankings.
-   Winner or winners.
-   A clear indication of a tie where applicable (only possible when the
    host ends the game early).
-   How the game ended (board cleared, ended by host, or not enough
    players).
-   Pairs matched by each player.

The result must be derived from persisted authoritative game state. A
completed session must retain its results when the host or a player
refreshes the page.

---

# 11. Multiplayer Synchronisation

## 11.1 General Requirement

All participants must see a consistent shared game state.

Supabase Realtime should be used for participant presence and authorised
game-state notifications. The database and trusted server-side game
logic remain authoritative.

## 11.2 State Changes

A typical valid game action should follow this sequence:

1.  The client submits an action.
2.  The server authenticates the caller.
3.  The server validates the session and player.
4.  The server validates the requested action against the current game
    state.
5.  The server performs the state transition atomically.
6.  The updated state is persisted.
7.  An authorised notification is published.
8.  Clients refresh or reconcile their authorised view of the state.

The application must not rely solely on an event payload to determine
the current authoritative game state.

## 11.3 Private Channels

Use private Realtime channels with appropriate authorisation.

Do not make sensitive game channels publicly accessible.

The application must ensure that a player cannot subscribe to another
session's protected game information.

Keep notification payloads minimal: a game-state notification contains
only the session ID and the new state revision, never card content.
Clients respond by fetching their own authorised view from the server.
This keeps hidden card content out of Realtime entirely.

Private Broadcast and Presence channels are authorised through RLS
policies on `realtime.messages`. Include these policies in
`supabase/schema.sql` and document in the README that "Allow public
access" must be disabled in the project's Realtime settings.

## 11.4 Duplicate and Out-of-Order Events

The application must handle duplicate events, delayed events,
out-of-order events, network interruptions, browser tab suspension,
reconnection after temporary disconnection, multiple tabs opened by the
same player, and a client receiving an older response after a newer
state has already been applied.

Use a suitable state revision, version number, or equivalent mechanism
to identify stale updates.

Clients must not overwrite newer state with older state.

## 11.5 Reconnection

When a player reconnects:

1.  Re-establish the authenticated session where possible.
2.  Verify that the player remains authorised to participate.
3.  Fetch the current authorised state from the server.
4.  Re-establish Realtime subscriptions.
5.  Reconcile the client view with the latest state.

The application must not assume that the browser has retained the latest
game state.

---

# 12. Host Dashboard

## 12.1 Navigation

On desktop, use a clear side navigation containing the relevant host
sections.

On mobile, use a compact navigation pattern suitable for narrow screens,
such as a bottom navigation bar or a compact menu.

Avoid deeply nested dropdowns and unnecessarily complicated navigation.

## 12.2 Dashboard Content

The dashboard should provide:

-   A clear page heading.
-   A primary action to create a session.
-   A list of the host's sessions.
-   Session names and statuses.
-   Game variant and pair count.
-   Participant counts where relevant.
-   Actions to open and manage a session.
-   Clear empty states when no sessions exist.

## 12.3 Session Management Screen

Make the following immediately accessible:

-   Session name.
-   Session status.
-   Join code.
-   QR code.
-   Invitation link.
-   Participants.
-   Game configuration.
-   Start or end controls, depending on the current state.
-   Results when the game is completed.

The primary action should be visually obvious. Do not hide essential
controls behind unclear icons or unrelated navigation sections.

---

# 13. Visual Design

## 13.1 Design Direction

Rondje should feel warm, friendly, social, and modern.

The interface should resemble a polished language-learning or social
game product rather than a generic administrative dashboard.

The design must be visually engaging without excessive gradients,
shadows, animation, or decorative elements.

Prioritise clarity, readability, and gameplay.

## 13.2 Colour Palette

| Purpose | Colour | Hex |
|---|---|---|
| Primary teal | Teal | `#249D8F` |
| Secondary accent | Saffron | `#E9C46A` |
| Accent | Coral | `#E76F51` |
| Background | Warm cream | `#FDF0D5` |
| Primary text | Dark ink | `#123F3A` |
| Dark teal | Deep teal | `#1B7A6F` |
| Surface | White | `#FFFFFF` |

Colours should be assigned consistently to primary actions, secondary
actions, feedback states, and backgrounds. Maintain adequate text
contrast.

## 13.3 Typography

Use Nunito through the local `@fontsource-variable/nunito` package.

Typography should be friendly, readable, consistent, appropriately
scaled for mobile and desktop, and easy to scan during gameplay.

## 13.4 Player Experience

The player-facing experience is the highest UI priority.

Players should immediately identify whose turn it is, which board is
being played, which cards are currently flipped, whether the attempt
matched, the current scores, and how many pairs remain on each board.

The main area shows the active player's board, because that is where
the flips are happening; when it is your turn, that is your own board.
Each player can always switch to see their own board and its matched
cards. Other boards can be shown as compact progress indicators.

Avoid excessive information on the game screen. Do not allow the
scoreboard or other controls to obscure the cards.

## 13.5 Responsive Behaviour

Support:

-   360 × 640.
-   390 × 844.
-   412 × 915.
-   Tablet-sized viewports.
-   Desktop-sized viewports.

Avoid horizontal overflow. Ensure game cards, buttons, scoreboards, and
navigation remain usable on small screens. Use appropriate mobile
safe-area handling where needed.

## 13.6 Interaction Design

-   Use clear hover, focus, pressed, loading, success, and error states.
-   Use subtle transitions for card interactions.
-   Avoid excessive animation.
-   Do not make essential functionality dependent on hover.
-   Use loading indicators for operations that take noticeable time.
-   Disable actions that cannot currently be performed, while still
    validating every action on the server.
-   Prevent repeated submissions while a request is pending where
    appropriate.

## 13.7 Accessibility

-   Use semantic HTML.
-   Provide accessible names for interactive controls.
-   Ensure keyboard navigation works.
-   Make focus states visible.
-   Use sufficient colour contrast.
-   Do not rely on colour alone to communicate match results.
-   Respect reduced-motion preferences.
-   Ensure touch targets are approximately 48 × 48 pixels where
    practical.
-   Use mobile form-field font sizes that avoid unwanted browser zoom.
-   Provide understandable error messages.

---

# 14. Database Design

Design the database schema around this specification.

Create the implementation schema in `supabase/schema.sql` and initial
vocabulary data in `supabase/seed.sql`.

Do not blindly reuse an incompatible legacy schema. Do not drop or
overwrite an existing production database.

The schema must support the following logical entities. Table names may
follow a consistent project-wide naming convention.

## 14.1 Hosts

Stores or references authenticated host identities. Use Supabase Auth as
the source of truth for host authentication. Avoid duplicating
authentication credentials in application tables.

## 14.2 Game Sessions

Stores session configuration, ownership, join code, lifecycle status,
and timestamps. A session must have one host and one Matchen game.

## 14.3 Players

Stores the player's identity within a session, including authenticated
identity reference where applicable, session reference, nickname, emoji
avatar, proficiency level, participation status, join timestamp, and
relevant lifecycle information.

A player must belong to the appropriate session.

## 14.4 Vocabulary

Stores vocabulary items and the data required to represent them in the
four game variants.

Where appropriate, include Dutch word, article, emoji or image
reference, vocabulary theme, proficiency level or difficulty metadata if
needed, and active/inactive status.

Do not create unnecessary duplicate vocabulary records merely to support
different UI components.

## 14.5 Vocabulary Pairs

Represents the valid matching relationship between two cards. Support
identical-image pairs, word–image pairs, article–noun pairs, and
opposite-word pairs.

The relationship must be explicit and validated according to the
selected game variant.

## 14.6 Game State

Stores authoritative state for an active or completed game, including
game status, active player, turn order or equivalent ordering
information, current state revision, number of pairs, the pending
first flip and pending mismatch if applicable, the end reason, the
`reveal_until` and
`turn_until` deadlines, processed action IDs (for idempotency), and
start/end timestamps.

Use a structure that supports safe concurrent actions.

## 14.7 Board Layout and Player Boards

Store the layout once per game: for each board position, the game, the
underlying valid pair, and the card's representation (which side of the
pair it is). Store per-player board state separately: for each player
and position, whether it is matched on that player's board.

Never grant clients direct read access to the layout table. Clients
receive positions and only the content they are entitled to see
(section 8.2) through server code or security-definer functions.

## 14.8 Scores

Scores may be stored directly in authoritative player/game state or in a
separate score table.

Whichever approach is selected, guarantee one point per successful pair,
no duplicate scoring, consistent results after refresh, correct final
rankings, and no client-side score manipulation.

## 14.9 Database Constraints and Indexes

Add appropriate primary keys, foreign keys, unique constraints, check
constraints, indexes, timestamps, and status constraints.

At a minimum, enforce session-code uniqueness and appropriate
session/player relationships.

Use indexes for frequently accessed sessions, players, game cards, and
vocabulary relationships.

## 14.10 Atomic Operations

Critical game actions must be atomic.

Use appropriate PostgreSQL functions, transactions, row-level locking,
or equivalent database-backed mechanisms to prevent race conditions.

Examples include starting a game, selecting a card, resolving a match,
awarding a point, advancing the turn, ending a game, and removing a
participant when that affects game state.

Two concurrent requests must not both successfully process the same
logical game action.

---

# 15. Authentication and Security

## 15.1 Host Authentication

Use Supabase Auth for hosts. Use secure server-side authentication
handling with `@supabase/ssr`. Protect host dashboard and
session-management operations. Verify session ownership before allowing
host-only operations.

## 15.2 Player Authentication

Players should use Supabase anonymous authentication where enabled.
Maintain a reliable association between the authenticated player
identity and the relevant session.

Do not authorise players solely through an arbitrary player ID sent by
the browser.

## 15.3 Row-Level Security

Enable appropriate Row-Level Security policies for application tables.

Policies must ensure that:

-   Hosts can access and manage only their authorised sessions.
-   Players can access only information permitted for their session and
    role.
-   No one can read hidden (face-down) card content.
-   Players cannot write arbitrary scores.
-   Players cannot modify the active turn.
-   Players cannot mark cards as matched directly.
-   Players cannot start or end games without host authorisation.
-   Removed participants cannot continue participating.
-   Anonymous users cannot retrieve unrestricted session or vocabulary
    data.

Use narrowly scoped policies rather than broadly granting anonymous
access.

## 15.4 Server-Side Validation

Use Zod or an equivalent centralised validation approach.

Validate session creation, join codes, nicknames, avatar values,
proficiency levels, game configuration, card-selection actions, host
actions, player removal, and session status transitions.

Return useful error messages without exposing internal implementation
details.

## 15.5 Privileged Credentials

The Supabase secret/service-role credential must never be exposed to
browser code.

Use it only in trusted server-side code when required. Do not prefix
privileged credentials with public environment-variable prefixes. Never
commit real secrets to source control.

## 15.6 Abuse Prevention

Reject malformed or unauthorised requests. Apply reasonable request
validation and rate limiting where appropriate.

Ensure repeated requests cannot duplicate a match, award additional
points, skip the turn, reveal unauthorised cards, join a completed
session, or modify another player's information.

---

# 16. Environment Configuration

Provide an `.env.example` file containing:

``` dotenv
PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR-SUPABASE-PUBLISHABLE-OR-ANON-KEY
SUPABASE_SECRET_KEY=YOUR-SUPABASE-SECRET-OR-SERVICE-ROLE-KEY
SUPABASE_PROJECT_REF=YOUR-PROJECT-REF
PUBLIC_APP_URL=http://localhost:5173
```

Distinguish public configuration from server-only credentials. Use the
project's configured environment-variable conventions consistently. Do
not hard-code deployment URLs, API keys, or secrets.

If Supabase credentials are not available, continue implementing the
application, schema, tests, and documentation.

The README must list the Supabase dashboard settings that cannot be set
from SQL, including enabling anonymous sign-ins, enabling email/password
sign-in for hosts, and disabling public Realtime access.

Do not claim that live authentication, database operations, or
multiplayer synchronisation have been verified unless they have actually
been tested against a configured Supabase project.

---

# 17. Recommended Project Structure

``` text
src/
├── lib/
│   ├── components/
│   │   ├── layout/
│   │   ├── session/
│   │   ├── lobby/
│   │   ├── game/
│   │   └── shared/
│   ├── game/
│   │   ├── types.ts
│   │   ├── board-generation.ts
│   │   ├── matching.ts
│   │   ├── turn-management.ts
│   │   ├── scoring.ts
│   │   └── game-state.ts
│   ├── server/
│   │   ├── auth/
│   │   ├── sessions/
│   │   ├── players/
│   │   ├── games/
│   │   └── database/
│   ├── types/
│   └── utils/
├── routes/
│   ├── +page.svelte
│   ├── auth/
│   ├── dashboard/
│   ├── join/
│   ├── session/
│   └── api/
└── app.html

supabase/
├── schema.sql
└── seed.sql

tests/
├── unit/
└── e2e/
```

This structure is a guide, not a requirement to create empty directories
or unnecessary abstractions. Adapt filenames where appropriate while
preserving separation of responsibilities.

---

# 18. Error Handling

Handle these conditions gracefully:

-   Invalid session code.
-   Nonexistent session.
-   Completed session.
-   Duplicate nickname.
-   Invalid nickname.
-   Insufficient players.
-   Insufficient vocabulary pairs.
-   Unauthorised host operation.
-   Unauthorised player operation.
-   Attempt to select another player's card.
-   Attempt to select the same card twice.
-   Attempt to select a matched card.
-   Attempt to play out of turn.
-   Attempt to play after the game ends.
-   Duplicate or concurrent requests.
-   Realtime connection failure.
-   Temporary database failure.
-   Authentication expiration.
-   Removed participant attempting to reconnect.

Errors must be understandable to ordinary users. Do not display raw
database errors, stack traces, privileged information, or internal
security details in the interface. Where recovery is possible, provide a
clear next step.

---

# 19. Testing Requirements

## 19.1 Unit Tests

### Board Generation

Test that the layout contains exactly the requested number of pairs;
every pair appears exactly twice; every position maps to a valid pair;
every eligible player gets a board with the same layout and every
position unmatched; shuffling does not break pair relationships; the
turn order contains every eligible player once; and invalid or
insufficient vocabulary data is rejected.

### Matching

Test that Image Pairs matches identical image identities; Word–Image
matches the correct word and image; De Het matches the correct article
and noun; Opposites matches only explicitly configured opposite pairs;
and invalid combinations are rejected.

### Turn Management

Test that the first player in the turn order receives the first turn;
only the active player can flip; flips are limited to the active
player's own board; a successful match retains the turn; a failed match
advances the turn; matching on one player's board does not change any
other board; invalid actions do not change the turn; and the game cannot
continue after completion.

### Scoring and Completion

Test that a successful pair awards exactly one point, a failed attempt
awards no points, a duplicate action cannot award additional points,
the game ends as soon as one player clears their board, that player
wins, final rankings are calculated correctly, and ties after the host
ends the game early are represented correctly.

### Lifecycle Edge Cases

Test that an overdue mismatch reveal is resolved exactly once even when
several requests arrive together; an expired turn deadline turns back a
pending first flip and advances the turn; removing the active player
advances the turn; and removal that leaves fewer than two players ends
the game.

## 19.2 Security Tests

Test that a player cannot play out of turn, flip a card on another
player's board, read hidden card content (directly from tables, through
Realtime, or through API responses), modify their score directly,
start or end a game, or continue performing game actions after removal.
Test that a host cannot manage another host's session and a completed
game rejects additional scoring actions.

## 19.3 End-to-End Test

Use Playwright to test a complete multiplayer journey:

1.  A host signs in.
2.  The host creates a session.
3.  The session receives a unique join code.
4.  Three players join using separate browser contexts.
5.  Each player chooses a nickname and avatar.
6.  The host starts the game.
7.  The server generates identical boards for all players.
8.  Players take turns.
9.  A successful match awards one point and the same player flips
    again.
10. An unsuccessful match advances the turn.
11. The scoreboard synchronises across browsers.
12. One player clears their board and the game completes.
13. All participants see the same final results.
14. Refreshing a page does not erase persisted results.

Use independent browser contexts to simulate separate players. Do not
simulate multiplayer behaviour by reusing a single client identity.

Because cards are face down, the test needs to know the layout in order
to play deliberately. Test-only helpers may read the layout table using
the secret key from the Node test process to choose matching or
non-matching positions, and then click those positions in the UI. These helpers must live under `tests/` and must never be
reachable from the application. The test host account may also be
created through the Supabase admin API from the test setup.

## 19.4 Build and Quality Checks

Run the available checks, including TypeScript/Svelte checks, production
build, unit tests, and end-to-end tests where the required environment
is available.

Document tests that could not run because of missing external
configuration. Never report a test as passed when it was not executed
successfully.

---

# 20. Acceptance Criteria

## Session Management

-   [ ] A host can authenticate.
-   [ ] A host can create a session.
-   [ ] A session has a unique six-character join code.
-   [ ] A session contains exactly one Matchen game.
-   [ ] A QR code and invitation link are available.
-   [ ] Session status is persisted.
-   [ ] A host cannot manage another host's session.

## Player Onboarding

-   [ ] A player can join using a code or link.
-   [ ] A player can choose a nickname, emoji avatar, and proficiency
    level.
-   [ ] Duplicate active nicknames are rejected.
-   [ ] Players appear in the lobby.
-   [ ] Online/offline presence is displayed.
-   [ ] A player can recover their session after a refresh where their
    identity remains valid.

## Game Configuration

-   [ ] All four variants are supported.
-   [ ] The host can select 6, 8, or 12 pairs.
-   [ ] Insufficient vocabulary prevents game initialisation.
-   [ ] The host can start a valid game with at least two eligible
    players.

## Gameplay

-   [ ] Every player gets a board with the same cards in the same
    positions.
-   [ ] Both cards of every pair are on each player's board.
-   [ ] Only the active player can flip cards, and only on their own
    board.
-   [ ] Cards are flipped one at a time, two per attempt.
-   [ ] A disconnected active player cannot stall the game (turn
    deadline).
-   [ ] A successful match awards one point.
-   [ ] A successful match retains the turn.
-   [ ] A failed match advances the turn.
-   [ ] Invalid actions do not mutate game state.
-   [ ] Duplicate requests cannot produce duplicate scores.
-   [ ] The game ends when one player clears their board or the host
    ends it.

## Multiplayer

-   [ ] All participants see consistent shared game state.
-   [ ] Only authorised participants receive protected game information.
-   [ ] Hidden card content is never sent to any client.
-   [ ] Scores remain consistent across clients.
-   [ ] Reconnection restores the latest authorised state.
-   [ ] Stale events do not overwrite newer game state.

## Results

-   [ ] Final scores are persisted.
-   [ ] Rankings are calculated correctly.
-   [ ] Ties are handled.
-   [ ] Results remain available after refresh.
-   [ ] Completed games reject additional actions.

## Design and Quality

-   [ ] The interface uses the defined visual palette.
-   [ ] The player experience is prioritised.
-   [ ] Desktop navigation is clear.
-   [ ] Mobile navigation is usable.
-   [ ] The specified viewport sizes are supported.
-   [ ] No horizontal overflow is present at target sizes.
-   [ ] Accessibility basics are implemented.
-   [ ] Database security policies are in place.
-   [ ] Automated tests cover the critical game mechanics.
-   [ ] Production build and applicable checks pass.

---

# 21. Implementation Guidance

Use this specification to implement the product directly.

Do not treat it as a request to produce another plan or design proposal.
Make reasonable implementation decisions independently where this
document leaves minor details open.

Prioritise correctness, security, maintainability, and a polished player
experience.

When the existing application conflicts with this specification, rebuild
the conflicting functionality rather than preserving an incorrect
implementation.

Do not introduce features outside the defined scope.

Do not pause for routine implementation decisions or ask the user to
approve individual development stages.

If external credentials or services are unavailable, complete all work
that can be performed locally and clearly document the remaining
configuration required.

The final implementation must provide a working, testable foundation for
Rondje rather than a collection of disconnected UI mockups.

---

# 22. Implementation Notes (added during the rebuild)

These notes record how the implementation resolved details this
specification leaves open. They clarify; they do not change any rule above.

1.  **Removed players and winning.** Removed players keep their score in
    the results (marked as removed) but are not ranked and cannot win.
    When the host ends the game or too few players remain, the winners are
    the non-removed players with the highest score (ties possible).
2.  **Deadline after a lazy resolution.** Each resolution performs at most
    one transition (reveal end *or* turn timeout). The next player's
    `turn_until` is set to the database time of the resolution plus the
    turn limit, so a late resolution gives the next player a full turn
    instead of chaining several timeouts.
3.  **Stale revisions.** A flip must carry the current revision (after any
    lazy resolution). Otherwise it is rejected as `stale_state` without
    changing state, and the response includes the current view.
4.  **Replayed action IDs** are rejected as `duplicate_action` with the
    current view. They never change state.
5.  **Own-board check.** A flip request also names the board owner, so the
    server can explicitly reject flips on another player's board.
6.  **Single revision counter.** `game_sessions.revision` covers lobby and
    game changes, so clients have one monotonic version to compare.
7.  **Host as player.** A host cannot join their own session as a player.
    Joining another host's session with a non-anonymous account is allowed.
8.  **Removal in the lobby** is permanent for that identity; the same
    identity cannot rejoin the session.
9.  **Ending.** "End game" is available only while a game is in progress;
    lobby sessions are not cancelled (no cancel feature in scope).
10. **Score equals pairs matched.** Each match awards exactly one point, so
    a player's score equals the pairs matched on their board.
11. **Realtime publishing.** Notifications (`{session_id, revision}`) are
    sent from inside the same database transaction with `realtime.send()`
    on the private topic `session:<id>`. Clients may track presence on that
    topic but may not broadcast.
12. **Secret key.** The application never needs the Supabase secret key.
    It is used only by test tooling under `tests/`.

---

# 23. Changes requested after the rebuild (2026-10-19)

These changes were requested by the product owner after the rebuild. Where
they conflict with earlier sections (notably 2.2 "Team-based gameplay" and
"Other games unrelated to Matchen", 7.1 "every player has their own board",
9.5 and 9.6 "turn time limit"), this section wins.

## 23.1 No turn timer

The 60-second turn limit is removed: there is no `turn_until` deadline and no
countdown. A player keeps their turn however long they take. Because an
absent player could otherwise stall the game, the host has a **Skip turn**
control (`skip_turn`): in Matchen the active player's pending first flip turns
back and the next player's turn begins (refused while a mismatch reveal is
pending); in Fill in the Blanks it closes the current round. The short
reveals (2.5 s mismatch, 4 s answer) remain; they are pauses, not timers.

## 23.2 Matchen: one shared board

All players play on **one shared board** per game (replacing per-player
boards in 7.1, 8.1 step 5 and 14.7). A matched pair stays face up for
everyone for the rest of the game and is credited to the player who found it
(shown with their avatar on the card); nobody can flip it again. The game ends
when every pair has been found (`board_cleared`); the highest score wins, or
the best group (23.3). This also fixes matched cards appearing to flip back
when the view followed the next player's board.

## 23.3 Groups

The host chooses no groups, or 2–4 groups, when creating a session. At game
start the shuffled players are dealt round-robin into groups (sizes differ by
at most one), so the Matchen turn order alternates between groups. At least
as many players as groups are needed to start. Every point a player scores
counts for their group, including players removed later. Each group has its
own scorecard (members and total) during the game and in the results.
Groups are ranked by points per member, which equals ranking by total when
groups are equally large and stays fair when they are not; a group with no
active members cannot win. The winners are the active members of the winning
group(s); equal results are a tie.

## 23.4 Fill in the Blanks

A second game mode next to Matchen. The host picks it instead of a Matchen
variant and chooses 6, 8 or 12 sentences.

- Each round shows one Dutch grammar sentence with one blank and its English
  meaning. Where a specific word form is needed the base form is given in
  brackets, so a typed answer has exactly one correct form.
- **Everyone answers at the same time**, once per round; answers are final.
- Difficulty follows each player's level: **Beginner and Elementary** pick
  from four options (the answer plus three wrong options, shuffled once per
  round); **Intermediate and Advanced** type the answer. Typed answers ignore
  case, extra spaces, typographic apostrophes and final punctuation.
- A correct answer scores one point. When every active player has answered
  (or the host closes the round) the answer and who got it right are shown
  for 4 seconds, then the next round starts; after the last round the game
  ends (`all_rounds_played`).
- The correct answer and other players' answers are never sent to clients
  before the round closes; typing players never receive the options.
- Content lives in `grammar_questions` (topics: verbs, articles,
  prepositions, pronouns, adjectives, plurals, past tense, word order).
