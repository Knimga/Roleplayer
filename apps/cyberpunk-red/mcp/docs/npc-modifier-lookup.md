# ================================
# NPC COMBAT MODIFIER LOOKUP (ATTACK & DEFENSE)
# ================================
# STATs are for player characters only.
# Each NPC uses one COMBAT NUMBER for both attacking and defending.
# Attack:  Combat Number + 1d10  vs  the target's defense roll (or a set DV).
# Defense: Combat Number + 1d10  when a player attacks them (dodge/parry).
# Higher total wins; on a tie the DEFENDER wins.
# Hand the tier's Combat Number to the dice API as the modifier; the API rolls the d10.
# Pick a tier by how skilled/dangerous the enemy is, not by how tough — toughness is
# handled separately by the bruised/injured/critical/dead status ladder.

# THE FIVE TIERS
- Tier 1 — Untrained (Combat Number +5)
  Who: panicked civilian, desperate scav, kid with a pistol. Barely fights.
- Tier 2 — Mook (Combat Number +9)
  Who: typical ganger, street thug, rent-a-cop, conscript. A Crew should beat these roughly one-for-one.
- Tier 3 — Professional (Combat Number +12)
  Who: bodyguard, beat cop, trained soldier, seasoned ganger. Roughly a match for an average player character.
- Tier 4 — Elite (Combat Number +15)
  Who: veteran Solo, corporate black-ops, SWAT, lawman, hardened merc. Outclasses most players individually.
- Tier 5 — Boss (Combat Number +18)
  Who: named nemesis, cyberpsycho, gang warlord, mini-boss. Substantially deadlier than the players; built to be a real threat.

# QUICK USE
- Default: use the same Combat Number for the enemy's attacks and their defense.
- Attack roll for the enemy: Combat Number + 1d10.
- Defense roll for the enemy (when a player attacks): Combat Number + 1d10. The player's attack total must beat it.
- If an enemy is caught flat-footed, ambushed, restrained, or simply not dodging, skip their defense roll and let the hit land (or compare against a flat DV of 10 + their tier bonus).


# ================================
# NPC SKILL MODIFIER LOOKUP
# ================================

Typical Skill Base by competence:
- Untrained / weak: 4-8
- Ordinary ganger or mook: 9-11
- Trained professional (Solo, Lawman, bodyguard): 12-14
- Elite / boss: 15-17+


# ================================
# ARCHETYPE TWEAKS (optional, +/-2)
# ================================
Shift a single number when an enemy is lopsided rather than well-rounded:
- Sniper / marksman: attack +2, defense as normal (deadly aim, ordinary dodge).
- Heavy / juggernaut in bulky armor: attack as normal, defense -2 (hits hard, slow to dodge).
- Martial artist / dodger: defense +2 (hard to pin down).
- Berserker / cyberpsycho: attack +2, defense -2 (all offense, little care for cover).
