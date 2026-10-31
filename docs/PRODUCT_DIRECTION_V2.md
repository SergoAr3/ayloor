# AYLOOR — Product Direction v2

Status: current product direction; EXPLORE is not yet implemented.

## Vision and promise

**AYLOOR — A city guide you play.**

AYLOOR turns a self-guided city walk into a sequence of observations, small puzzles
and stories. The first market is Yerevan, Armenia. The primary mode is **EXPLORE**.

Product promise: explore at your own pace, notice details you would otherwise miss,
and understand something about the city through solving and revealing a story.

> The user should look at the city more than at the phone.

Target journey:

**Discover city → choose walk → start anytime → walk → notice → solve → reveal → continue → finish**

## Audience and job to be done

Primary audience: an English-speaking tourist aged 20–40, visiting for a few days,
walking solo, as a couple or in a small group, and looking for independent discovery
without joining a conventional tour group.

JTBD: When I have a free hour in an unfamiliar city, help me explore a worthwhile
walk independently, notice its details and learn their meaning, so I feel I have
discovered the place rather than just checked off landmarks.

The guide must work for one person. Friends can share the experience without team
creation, invites or a multiplayer activation requirement.

## Core loop

**WALK → NOTICE → SOLVE → REVEAL → CONTINUE**

1. **Walk:** reach the next safe public stop with short, useful directions.
2. **Notice:** look for a specific detail in the physical city.
3. **Solve:** answer a clue using what is there; request an optional hint if needed.
4. **Reveal:** connect the observed detail to a concise, researched story.
5. **Continue:** put the phone away and move on at a comfortable pace.

Pausing is normal. There is no hard timer, speed reward or competitive pressure.
Finishing should feel like completing a small journey, not winning a ranking.

## Content principles

- The city supplies the clue. Avoid trivia solvable without looking around,
  arbitrary operator codes and long phone-only puzzles.
- Keep walking instructions, clue, optional hint and Reveal distinct and brief.
  A Reveal explains why the detail matters rather than merely stating the answer.
- Verify stories against reliable sources; record editorial sources and field
  observations. Mark uncertainty instead of inventing local history.
- Check visibility, answer ambiguity, route duration and safe standing areas on site.
  Never invent a checkpoint or assume a landmark detail is still present.
- Use accessible English, helpful answer feedback and hints without XP penalties.
  Do not require specialist knowledge, strangers, photographs or purchases.
- Use public pedestrian paths and lawful crossings. No trespass, rushing, dangerous
  stranger interaction or unnecessary photographing of strangers.
- Check closures and obstacles before publishing; tell walkers about known access
  limitations. Do not claim step-free accessibility without verifying the route.

## First product: Yerevan: Look Closer

Initial validation scope: one English-first walk with **4–5 stops**, taking roughly
**60–75 minutes**, available to start anytime without a scheduled group. Each stop
has a physical-city clue, answer, optional hint and Reveal/story, followed by Continue.

It is solo-friendly, supports pause/resume, requires neither Telegram nor a team,
and asks for no account before start. Location is requested only when useful and
through explicit user action; no background or continuous tracking.

The precise route, stops and stories still need field research and validation.
FIELD TEST ZERO locations and test codes are not automatically the guide's content.
See [MVP v0.2](MVP_V02.md) for the concrete experience and acceptance criteria.

## EXPLORE, PLAY and the current implementation

| Area | Meaning | Status |
| --- | --- | --- |
| EXPLORE | Playable city guides; independent discovery and stories | Current product priority; target behavior, not implemented |
| PLAY | Competitive city games / seasons | Possible future mode; not current scope |
| Existing codebase | Telegram Mini App, teams, GPS quests, XP/ScoreEvent, leaderboard and FIELD TEST ZERO | Current implementation; retained until explicit migration |

[MVP v0.1](MVP_V01.md), [Decisions v0.1](DECISIONS_V01.md), completed plans and
[FIELD TEST ZERO](FIELD_TEST_ZERO.md) remain historical/current implementation
context. Their team rules, timer and scoring describe that implementation, not
EXPLORE requirements. Do not rewrite them as though the original direction never existed.

This direction does not remove FastAPI, PostgreSQL, ScoreEvent, Telegram auth or
server GPS checks, and does not move answer validation to the client. Existing
security, database and concurrency guarantees remain binding. Future migration
work must explicitly define and test any changes to those contracts.

## Validation strategy and initial success metrics

Validate the promise before expanding the platform:

1. Research and walk a draft route; verify every clue, story and safe stopping area.
2. Test content with a lightweight prototype or facilitated walk, clearly identified
   as a prototype. Do not present the current team game as a finished EXPLORE guide.
3. Run a small pilot with target visitors, including solo walkers and couples/small
   groups. Observe confusion and phone use without leading participants to answers.
4. Revise content and flow before commissioning broader platform or mode work.

Proposed first pilot: **8–12 independent walk sessions**. These are learning targets,
not established performance claims or statistically conclusive launch criteria.
Record counts alongside rates and separate solo from accompanied sessions.

| Signal | Initial target / interpretation |
| --- | --- |
| Completion | At least 80% of started pilot sessions finish without facilitator rescue |
| Independence | No recurring stop where multiple sessions need human explanation; log hint use and abandonment by stop |
| Duration | Most unpaused sessions take about 60–75 minutes at a normal walking pace; never enforce it as a deadline |
| Discovery value | At least 80% of feedback respondents say they noticed something they would otherwise have missed; report response count |
| Phone attention | Observe repeated city-looking behavior; investigate long phone interactions and comments about excessive screen time |
| Reliability and safety | Progress survives tested pause/resume; any unsafe route instruction blocks release until corrected |

Collect only minimal session progress, optional feedback and consented pilot notes.
No continuous location traces or route recording are needed. Analytics tooling,
identity and retention details require a separate implementation decision. Learning
why a walker stops matters more than maximizing XP, rank or return-to-season metrics.

## What not to build yet

Do not build a city catalogue, guide marketplace, CMS platform, route generator,
AI content pipeline, AR, payments, subscriptions, achievements, badges, inventory,
social feed, clans, global league or live tracking. Do not expand competitive
seasons, daily/flash quests or PLAY mechanics. Do not remove legacy systems or
start a platform rewrite solely to match this positioning.

## Near-term roadmap

1. **Content validation:** choose and field-check 4–5 stops; write English clues,
   optional hints, sourced Reveals and safe directions; run prototype sessions.
2. **Architecture spike:** compare the target iOS / Android / Web experience with
   the current frontend. Reuse that investment where practical. Capacitor is a
   candidate to evaluate, not a project invariant or selected architecture.
3. **Scoped implementation:** separately plan no-account entry, guide progress,
   pause/resume, clue/answer/hint/Reveal flow and finish/feedback. Decide auth,
   persistence and validation contracts explicitly before migrating behavior.
4. **Pilot and iterate:** test the complete guide with target visitors, revise weak
   stops and assess the signals above before adding more guides or modes.

This document authorizes a product direction, not an implementation or migration.
