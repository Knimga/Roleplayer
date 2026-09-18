# Random Encounters

Purpose: consulted when the players move through, or spend real time in, ground that isn't safe — a Combat Zone block, gang turf, the Hot Zone, the open road. Says how likely trouble is, how to roll for it, and what's actually there when the roll says so. The roll decides *whether*; this doc decides *what*; the players decide *how to meet it*.

## When to check

Check **once** per:
- transit into or through a rated area (walking three blocks of gang turf is one check; three separate districts are three)
- stretch of lingering — a stakeout, a night crashing somewhere, hours waiting on a contact

Do **not** check:
- in an area rated Executive or Corporate by day (see Danger Ratings) — trouble there is planned, not random
- when the Situation already has a move for this moment — run that instead; a random encounter never displaces the antagonist's move
- for a scene that's already established and in motion
- more than once in a single response

## How to roll

1. Rate the ground with the table below (start from the map's Threat Rating for the zone, then adjust).
2. `roll_dice` — 1d10, modifier 0. An encounter happens on the listed roll or higher.
3. On an encounter, `roll_dice` 1d6 for its **kind**, then pick from that ground's table — or write one that fits the fiction better, at the same weight.

| Danger | Ground | Encounter on |
|---|---|---|
| 1 | Executive zone; Corporate zone by day | no check |
| 2 | Corporate zone by night; Moderate zone by day | 10 |
| 3 | Moderate zone by night; Overpacked Suburbs by day; the Reclaimed Perimeter on a Nomad-held road | 8+ |
| 4 | Combat Zone by day; gang turf; Overpacked Suburbs by night; the Open Road | 7+ |
| 5 | Combat Zone by night; the Hot Zone; gang turf during a gang war | 5+ |

Adjust one step up for: the players are conspicuous (visible chrome, a corp logo, carrying something valuable in the open); they're somewhere they've already made enemies. One step down for: a Fixer-arranged escort, a route the players have scouted, a Nomad convoy.

**Kind** (1d6): 1–2 a **sign** (no contact — evidence of what lives here); 3–4 a **contact** (someone or something that isn't hostile yet, or can be handled without a fight); 5–6 **hostiles** (they've already decided). At danger 5, 4–6 is hostiles.

## Running it

- It's real. A sign leads to something if followed; a contact wants something specific; hostiles have a reason and a plan. No vague menace ("you feel watched") — see the core tenets.
- Two players. Size hostiles for them: a couple of boosters, not a whole gang; a lone cyberpsycho is a *big* encounter, not a routine one.
- Contacts and even hostiles can be talked, bought, bluffed, or outrun — the players' choice and their rolls. When violence actually begins, hand off with `start_combat` as usual.
- Stat NPCs with `npc_check` (archetype + tier) when they roll; enemies get their block at the handoff.
- Don't repeat an encounter in the same chapter. Prefer ones that rhyme with the Situation — the gang whose turf this is, the corp that's hunting them — without spending the antagonist's move.

## Tables

### Moderate zone streets
Ordinary Night City, where Combat Zone trouble leaks in but NCPD still shows up eventually.
- **Sign**: fresh gang tags over the old ones — a turf line moved last night; an NCPD drone circling one block, ignoring the rest; a Trauma Team AV lifting off from a rooftop, someone's card just got used; a Scavver cart of stripped cyberware parked outside a ripperdoc.
- **Contact**: a Piranha street party spilling across the sidewalk, friendly until someone declines a drink; an NCPD foot patrol asking for ID from anyone chromed; a kid running a corner for someone, offering "anything you need"; a Media with a camera drone hunting a story, and the players look like one.
- **Hostiles**: two boosters shaking down whoever passes the alley mouth; a Bozo "prank" that starts with a squirting flower and ends with a knife; a jealous ex of someone the players talked to earlier, with a friend.

### Combat Zone and gang turf
Nobody cleans up. Every block belongs to someone.
- **Sign**: a body in the gutter nobody's touched, cyberware already gone; a burned-out car still smoking; a gang's colors painted across the street as a border — crossing it is a statement; distant full-auto, three bursts, then nothing.
- **Contact**: a turf gang's sentries wanting to know who sent the players and what they're carrying (a toll, a name, or a fight); a Scavver crew mid-strip who'll trade salvage for a look the other way; a 6th Street patrol "protecting the neighborhood" — from the players, unless they can explain themselves; a Reckoner preacher and two disciples soliciting "donations".
- **Hostiles**: a Maelstrom pair looking to test new chrome on someone; Tyger Claws on bikes, the players are in Japantown without permission; Inquisitors who've spotted visible cyberware and mean to remove it; a Red Chrome Legion squad who've decided the players aren't "right".

### The Hot Zone
Blasted ground. Wrecked towers, entombed bodies, radiation that hasn't finished with the place.
- **Sign**: a Scavver dig collapsed, a hand still reaching out of it; Zhirafa drones patrolling a corp reclamation grid, warning klaxons on approach; a fresh camp — someone else is here for the same salvage.
- **Contact**: a Scavver family who've been here for years and know which floors hold and which don't — for a price; a corp survey team with corpsec, polite until the players get close to their site.
- **Hostiles**: a Maelstrom war party using the ruins as a range; a cyberpsycho who's made a nest here and hears the players coming; a corpsec drone that reads the players as looters.

### The Open Road and the Outskirts
Only people in transit, and the ones who prey on them.
- **Sign**: a wreck on the shoulder, tires and fuel gone, cargo scattered; a Nomad Family's markers on a stretch of road — under their protection, for now; a raffen convoy's dust on the horizon, moving parallel.
- **Contact**: a Nomad convoy that'll trade, escort, or warn — depending on how the players present; a stranded corp courier with something worth more than the ride they're asking for; a roadside kibble stand that's also a lookout post.
- **Hostiles**: a boostergang running the highway for sport, faster than the players' vehicle; raffen shiv setting up a roadblock; a Nomad Family that thinks the players are the ones who hit their convoy last week.

### Corporate zone, after dark
Well-funded dangers.
- **Sign**: a corpsec checkpoint going up where there wasn't one; a Danger Gal operative tailing someone into a hotel; a silent Trauma Team pickup — no sirens, no witnesses.
- **Contact**: corpsec asking the players' business, with the authority to detain; an exec's bodyguard who recognizes one of the players from somewhere; a bar where the wrong conversation gets overheard by the right person.
- **Hostiles**: a corp extraction team that has the players' faces from a job they did; a rival's hired solo who's been told they're a loose end.
