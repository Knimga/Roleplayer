# Skills

Skill Reference for Calling Checks

## How Checks Work

A Skill Check is always rolled by the player, compared against either:

- a Difficulty Value (DV) the DM sets for the task, or
- an opposed roll (the target's STAT + Skill + 1d10). On a tie, the defender wins.

## Critical Successes & Critical Failures

Your dice roller API will return a critResult attribute to indicate whether the result was a critical success, critical failure, or neither (null). Player dice rolls also indicate this via text. Critical successes are ultra-effective, while critical failures are counter-productive and create new complications. Weave the results naturally into the narrative.

## Compound Actions

When a player does something that might need two skill checks, ask for them. Ex. weaving a vehicle through obstacles while under fire: Drive Land Vehicle check and Concentration check. Weave EACH result into the narrative.

## Difficulty Values (core DV guidance)

The DV is the number a player must meet or beat, in order to be successful at a skill task. Set a task's DV by how hard it is:

| Difficulty | DV | Description |
|---|---|---|
| Simple | 9 | Almost anyone can do it, but a small child might struggle. |
| Everyday | 13 | Most people manage without special training. |
| Difficult | 15 | Hard without training or natural talent. |
| Professional | 17 | Requires real, trained, professional skill. |
| Heroic | 21 | Only the best of the best; sports-star level. |
| Incredible | 24 | Elite even among professionals; Olympian. |
| Legendary | 29 | The stuff of stories. |

## DVs to Repair / Fabricate / Invent Items (by item price category)

| Price Category | DV | Time |
|---|---|---|
| Cheap/Everyday | 9 | 1 hour |
| Costly | 13 | 6 hours |
| Premium | 17 | 1 day |
| Expensive | 21 | 1 week |
| Very Expensive | 24 | 2 weeks |
| Luxury | 29 | 1 month |

Damaged-item repair scales similarly: Minor DV9, Major DV13, Destroyed DV17.

## The Skills

Format: Skill (linked STAT) — when to call for it.

### Awareness

| Skill | Stat | When to call for it |
|---|---|---|
| Concentration | WILL | Staying focused under fire, resisting distraction, recalling details, keeping cool. |
| Conceal/Reveal Object | INT | Hiding an item (or a weapon under clothing), or spotting one someone else has hidden. |
| Lip Reading | INT | Reading speech from a distance or through glass with no audio. |
| Perception | INT | Noticing hidden things: clues, traps, ambushers, or someone using Stealth. (Not for objects hidden with Conceal/Reveal.) |
| Tracking | INT | Following a trail of tracks, marks, and clues left by people or animals. |

### Body

| Skill | Stat | When to call for it |
|---|---|---|
| Athletics | DEX | Climbing, jumping, swimming, lifting, and throwing (including thrown weapons). |
| Contortionist | DEX | Escaping bonds, slipping through tight gaps, dislocating joints. |
| Dance | DEX | Dancing, from social to performance. |
| Endurance | WILL | Pushing on without food, sleep, or water, or after prolonged exertion. |
| Resist Torture/Drugs | WILL | Withstanding interrogation, torture, drugs, and poisons. |
| Stealth | DEX | Moving silently, hiding, or acting unseen. Opposed by Perception. |

### Control

| Skill | Stat | When to call for it |
|---|---|---|
| Drive Land Vehicle | REF | Driving or maneuvering ground vehicles, especially under pressure. |
| Pilot Air Vehicle | REF | Flying and maneuvering aircraft and AVs. |
| Pilot Sea Vehicle | REF | Piloting boats and ships. |
| Riding | REF | Riding and controlling a mount. |

### Education

| Skill | Stat | When to call for it |
|---|---|---|
| Accounting | INT | Bookkeeping, tracing money, spotting financial fraud. |
| Animal Handling | INT | Training, calming, or controlling animals. |
| Bureaucracy | INT | Navigating government or corporate red tape to get results. |
| Business | INT | Markets, deals, and running an operation. |
| Composition | INT | Writing songs, articles, or stories to professional standard. |
| Criminology | INT | Forensics: fingerprints, ballistics, evidence, and police records. |
| Cryptography | INT | Encrypting or breaking codes and ciphers. |
| Deduction | INT | Leaping from scattered clues to a non-obvious conclusion; medical diagnosis. |
| Education | INT | General schooling: reading, writing, math, basic history and facts. |
| Gamble | INT | Odds, card play, and games of chance. |
| Library Search | INT | Digging facts out of databases, the Data Pool, and archives. |
| Local Expert | INT | Deep knowledge of one specific area and its political and criminal factions. |
| Science | INT | Applying a specific chosen scientific field. |
| Tactics | INT | Reading a combat situation, positioning, and anticipating enemy moves. |
| Wilderness Survival | INT | Living off the land: shelter, fire, foraging, weather. |

### Fighting

| Skill | Stat | When to call for it |
|---|---|---|
| Brawling | DEX | Unarmed strikes and grappling by brute force. |
| Martial Arts | DEX | Fighting with a trained martial form; special moves like disarms and throws. |

### Performance

| Skill | Stat | When to call for it |
|---|---|---|
| Acting | COOL | Playing a role, impersonating, or feigning emotion convincingly. |
| Play Instrument | TECH | Performing on a chosen musical instrument. |

### Social

| Skill | Stat | When to call for it |
|---|---|---|
| Bribery | COOL | Offering the right inducement to the right person. |
| Conversation | EMP | Drawing information out of someone through casual talk. |
| Human Perception | EMP | Reading people: sincerity, mood, and lies. |
| Interrogation | COOL | Extracting information through pressure and questioning. |
| Personal Grooming | COOL | Styling hair, makeup, and appearance. |
| Persuasion | COOL | Convincing, negotiating, or swaying an audience. |
| Streetwise | COOL | Knowing the underworld: rules, contacts, and where to score. |
| Trading | COOL | Haggling and buying or selling at the best price. |
| Wardrobe & Style | COOL | Dressing for effect and reading fashion. |

### Technique

| Skill | Stat | When to call for it |
|---|---|---|
| Air Vehicle Tech | TECH | Repairing and maintaining aircraft. |
| Basic Tech | TECH | Fixing simple electronics and anything not covered by another Tech skill. |
| Cybertech | TECH | Repairing and maintaining cyberware. |
| Demolitions | TECH | Setting, defusing, and understanding explosives. |
| Electronics/Security Tech | TECH | Electronics, alarms, cameras, and electronic locks. |
| First Aid | TECH | Stabilizing the wounded and basic emergency care. |
| Forgery | TECH | Making or detecting fake documents and IDs. |
| Land Vehicle Tech | TECH | Repairing and maintaining ground vehicles. |
| Paint/Draw/Sculpt | TECH | Producing visual art. |
| Paramedic | TECH | Advanced field medicine beyond First Aid. |
| Photography/Film | TECH | Shooting quality photos and film. |
| Pick Lock | TECH | Defeating mechanical locks. |
| Pick Pocket | TECH | Lifting items from a person, or planting them, unnoticed. |
| Sea Vehicle Tech | TECH | Repairing and maintaining watercraft. |
| Weaponstech | TECH | Repairing, maintaining, and modifying weapons. |

### Medtech-Only (via the Medicine Role Ability)

| Skill | Stat | When to call for it |
|---|---|---|
| Surgery | TECH | Major surgery, cyberware installation and removal, and the worst critical injuries. |
| Medical Tech | TECH | Operating and repairing medical machinery; synthesizing pharmaceuticals. |

## Opposing Checks

Format: Skill (linked STAT) — when to call for it. An opposed check is roll vs roll (each side rolls their combined modifier + 1d10); on a tie, the defender/resister wins. Use these when a player's skill acts directly against an NPC (or vice versa). If no person resists, use a flat DV instead. Fighting skills (Brawling, Martial Arts, Melee Weapon, Evasion) are not listed here — they resolve as attack rolls, not skill contests.

### Always Opposed (a resisting person is inherent to the skill)

| Skill | Opposed by |
|---|---|
| Interrogation | The subject's Resist Torture/Drugs. |
| Resist Torture/Drugs | Opposed whenever a person interrogates, tortures, or drugs the character (this is the resisting side). |
| Trading | The other party's Trading when haggling a price. |
| Pick Pocket | The mark's Perception. |
| Stealth | The Perception of anyone who could notice. (No observer present = no check.) |

### Opposed in Specific Scenarios

| Skill | Opposed when |
|---|---|
| Perception | Someone is actively hiding via Stealth or Conceal/Reveal Object. (Spotting passive/inanimate things is a flat DV.) |
| Conceal/Reveal Object | Another person searches for the hidden item (their Conceal/Reveal Object or Perception). |
| Human Perception | The person being read is actively lying or acting (their Acting). (A general read of mood is a flat DV.) |
| Acting | An observer might see through the performance (their Human Perception). (Pure stage performance is a flat DV.) |
| Persuasion | Swaying a specific unwilling person (their Persuasion, COOL, or WILL). (A receptive audience is a flat DV.) |
| Conversation | The target is deliberately guarding the information being fished for (their WILL or Conversation). |
| Bribery | The target resists or weighs refusing (their WILL/COOL). (A willing taker needs no check.) |
| Streetwise | Someone is deliberately concealing underworld info, or two parties compete for the same contact. |
| Wardrobe & Style / Personal Grooming | Using appearance to disguise or pass as someone (observers' Perception or Human Perception). |
| Tracking | The quarry actively covers their trail (their Wilderness Survival or Stealth). |
| Cryptography | Breaking a cipher a person created (opposed by the author's Cryptography, and vice versa). |
| Forgery | A forgery is inspected (examiner vs. forger, either direction). |
| Contortionist | Escaping a grapple or bindings applied by a person. (Fixed/mechanical restraints are a flat DV.) |
| Gamble | An opponent when playing a game of chance head-to-head. |

### Direct Contests (opposed only when done against another person)

| Skill | Opposed when |
|---|---|
| Athletics | A direct physical contest: a footrace, or a shove/struggle over a shared object. |
| Drive Land Vehicle / Pilot Air Vehicle / Pilot Sea Vehicle / Riding | A chase, race, or maneuver duel against another driver or rider. |
| Dance / Play Instrument / Composition / Acting | A head-to-head performance face-off (e.g., a Rockerboy showdown). |
