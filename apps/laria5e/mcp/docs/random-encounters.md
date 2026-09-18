# Random Encounters

Purpose: consulted when the players move through, or spend real time in, ground that isn't safe — a road through contested country, a forest, a mountain pass, the war's edge. Says how likely trouble is, how to roll for it, and what's actually there when the roll says so. The roll decides *whether*; this doc decides *what*; the players decide *how to meet it*.

## When to check

Check **once** per:
- transit into or through a rated stretch (a day on a road is one check; a road and then a forest are two)
- stretch of lingering — a night's camp, a day waiting at a crossing, hours searching a ruin

Do **not** check:
- inside a settlement by day, on a garrisoned road, or under a caravan or clan escort (see Danger Ratings)
- when the Situation already has a move for this moment — run that instead; a random encounter never displaces the antagonist's move
- for a scene that's already established and in motion
- more than once in a single response

## How to roll

1. Rate the ground with the table below (`regions.md` for the region's current state — independent, at war, under siege).
2. `roll_dice` — 1d20, no modifier. An encounter happens on the listed roll or higher.
3. On an encounter, `roll_dice` 1d6 for its **kind**, then pick from that ground's table — or write one that fits the fiction better, at the same weight.

| Danger | Ground | Encounter on |
|---|---|---|
| 1 | inside a city or town by day; a road within a day of Kirinar, Esterlin, or Korsa | no check |
| 2 | a settled road by night; farmland; a town's edge after dark | 19+ |
| 3 | an open road between regions; the edges of the Westwood or Tieryf Vale; foothills | 16+ |
| 4 | deep forest; the Nahlia Mountains, Eastern Rim, or Zuriel Peaks; the Clanwoods; the Midlands anywhere off a road | 13+ |
| 5 | the Frigid Tundra; the war's edge — the Midlands road Kirinar's army marched, the country around Unukai; the Bitter Heights | 10+ |

Adjust one step up for: night; bad weather; a visibly Warborn or openly dark-magic-practicing party in the south, or a Keeper-looking one in the north; carrying something people would kill for. One step down for: a halfling caravan or clan escort; a route the players have scouted; a druid's or elder's blessing on the road.

**Kind** (1d6): 1–2 a **sign** (no contact — evidence of what lives here); 3–4 a **contact** (someone or something that isn't hostile yet, or can be handled without a fight); 5–6 **hostiles** (they've already decided). At danger 5, 4–6 is hostiles.

## Running it

- It's real. A sign leads to something if followed; a contact wants something specific; hostiles have a reason and a plan. No vague menace ("the forest feels wrong") — see the core tenets.
- Two players. Size hostiles for them: three goblins, not a war-band; a single ogre is a *big* encounter, not a routine one.
- Contacts and even hostiles can be talked, paid, tricked, or outrun — the players' choice and their rolls. When violence actually begins, hand off with `start_combat` as usual.
- Stat NPCs with `npc_check` (class + power level) when they roll; enemies get their block at the handoff. Creatures take the closest class (a wolf is a low fighter, a goblin a rogue).
- Where people stand (the war, dark magic) colors every contact — a patrol asks whose side you're on before it asks your name. See `factions.md`, `peoples.md`.
- Don't repeat an encounter in the same chapter. Prefer ones that rhyme with the Situation without spending the antagonist's move.

## Tables

### Roads
Between settlements, in country someone claims.
- **Sign**: a burned cart, the ox butchered, the goods left — not thieves, then; fresh graves by the roadside with Keeper markings; refugees' castoffs along the verge for a mile; a milestone defaced with clan runes.
- **Contact**: a halfling caravan that will trade news and passage for company on the road; a column of refugees heading away from wherever the players are heading, with reasons; a Keeper patrol (south) or clan riders (north) demanding to know the players' business and allegiance; a toll at a bridge that wasn't there last season, run by whoever's army is nearest.
- **Hostiles**: bandits — deserters, most of them — who'd rather rob than fight but will fight; a press gang from the nearest lord, filling ranks for the war; wolves that have learned the road feeds them.

### Forests
The Westwood, the Clanwoods, the edges of Tieryf Vale, and every nameless wood between.
- **Sign**: goblin snares along a game trail, freshly set; a druid's warding stones across the path — this way is closed; a hunting camp abandoned mid-meal; a tree split by something that wasn't lightning.
- **Contact**: a goblin scouting party more curious than hostile, until the players show what they're carrying; a Westwood druid who wants to know why the players are here and won't accept "passing through"; an elven watcher (Tieryf edge) who steps out only to say the players are being watched, and by whom; a Kitsune traveler who passes for anyone else, and is very interested in the players' business.
- **Hostiles**: a goblin ambush, three or four with bows from cover; a pack of wolves at dusk, circling; a Clanwoods witch's bound dead set to guard a grove, mindless and tireless.

### Mountains
The Nahlia, the Eastern Rim, the Zuriel Peaks, and the foothills of the Bitter Heights.
- **Sign**: an ogre's larder in a cave mouth — bones of things bigger than deer; dwarven prospector marks on the rock, recent; an orc clan's totem to Bregga at a pass, offerings still fresh; a rockfall that was not an accident.
- **Contact**: dwarven prospectors from Kaggrim (or, rarely, Taigaal) who'll share a fire and a warning; an orc clan's hunting band, wary, willing to trade meat for iron; a kobold scout (near the Bitter Heights) who vanishes if approached and reports if not.
- **Hostiles**: an ogre, one, hungry, and enough; orc raiders who've decided the players are trespassing on clan ground; a Bitter Heights patrol — big northmen in Ulduroki iron — sweeping the passes for southern spies.

### The Tundra and the war's edge
The Frigid Tundra, the road Kirinar's army marched, the country around Unukai.
- **Sign**: a battlefield nobody's buried; a village emptied — by conscription, or by Keepers; the tracks of a large mounted force, a day old; a northman warrior frozen where he sat down to rest.
- **Contact**: southern army foragers who'll take what the players have "for the war effort" unless given a reason not to; Northern Clan guerrillas who'll test whether the players are Keepers before deciding anything; a clan shaman with a Wyrdkin escort, traveling on business she won't name; a Keeper inquisitor with soldiers, hunting a dark mage, asking the players what they've seen.
- **Hostiles**: deserters from the siege, cold, starving, and past caring; a clan war-band that takes the players for southern scouts; a Shadowcult cell moving something under cover of night, who can't afford witnesses.

### Cities and towns, after dark
Kirinar's lower wards, Esterlin's docks, any town with a wall and a gate that closes.
- **Sign**: a Keeper seal on a door, the family gone; a body in a canal with its purse still on it — not a robbery; a tavern gone quiet as the players pass.
- **Contact**: the city watch, wanting names and business after curfew; a fixer's runner who's been told to find people who look like the players; a cleric of the ward chapel offering shelter, and asking questions.
- **Hostiles**: cutpurses who work in threes; a gang that runs the docks and has decided the players are competition; a Keeper agent who's marked one of the players as worth bringing in.
