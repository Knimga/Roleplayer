// Laria's enemy stat tables and generateCoreStats. See the Cyberpunk module
// and the engine's README for the contract.
//
// NOT YET AUTHORED. Laria has no combat rules doc yet
// (specs/combat-encounters.md §9), so there are no tables to encode:
// generateCoreStats returns an empty block, and the combat DM works from
// Claude's general 5e knowledge for the creature type and threat tier the
// handoff names (buildCombatContext still renders those as "Type: ..."),
// exactly as the spec says it should until the tables exist.
//
// When the tables land, the D&D case is the one the ad hoc lookup contract
// was designed for - ~18 skills per enemy is waste to precompute and
// trivial to derive once. See lookups/README.md.

export function generateCoreStats() {
  return {};
}
