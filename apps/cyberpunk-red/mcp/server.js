import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import { rollSkillCheck, rollGeneric, formatModifier, formatDiceBreakdown } from "./dice.js";
import {
  ARCHETYPES,
  ARCHETYPE_DESCRIPTION,
  STATS,
  STAT_HINTS,
  TIER_STAT_BASE,
  statTotal,
} from "../server/combat/enemy-stats.js";

const DOCS_DIR = fileURLToPath(new URL("./docs", import.meta.url));
const VALID_SIDES = [6, 10];
const ARCHETYPE_NAMES = Object.keys(ARCHETYPES);
const TIER_NUMBERS = Object.keys(TIER_STAT_BASE).map(Number);

export function createGameMcpServer() {
  const server = new McpServer({ name: "cyberpunk-red-tools", version: "1.0.0" });

  server.registerTool(
    "list_lore_files",
    {
      description: "List the available Cyberpunk Red lore/rules topic files.",
    },
    async () => {
      const files = readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md"));
      return { content: [{ type: "text", text: JSON.stringify(files) }] };
    },
  );

  server.registerTool(
    "read_lore_file",
    {
      description: "Read the full contents of one lore/rules topic file by name.",
      inputSchema: {
        filename: z.string().describe('Filename from list_lore_files, e.g. "skills.md"'),
      },
    },
    async ({ filename }) => {
      // `filename` is ultimately model-generated input, not a hardcoded
      // value — resolve it defensively so it can't escape mcp/docs/.
      const safeName = path.basename(filename);
      const filePath = path.join(DOCS_DIR, safeName);
      if (!filePath.startsWith(DOCS_DIR) || !safeName.endsWith(".md")) {
        return { content: [{ type: "text", text: "Invalid filename" }], isError: true };
      }
      try {
        const text = readFileSync(filePath, "utf-8");
        return { content: [{ type: "text", text }] };
      } catch {
        return { content: [{ type: "text", text: `File not found: ${safeName}` }], isError: true };
      }
    },
  );

  server.registerTool(
    "roll_dice",
    {
      description:
        "Roll dice for an NPC/enemy action (opposed checks, damage, etc). Never use this for player rolls — players roll their own and report the result.",
      inputSchema: {
        numDice: z.number().int().positive().describe("Number of dice to roll"),
        sides: z.union([z.literal(6), z.literal(10)]).describe("Sides per die: 6 or 10"),
        modifier: z.number().int().describe("Single combined modifier to add to the roll total"),
      },
    },
    async ({ numDice, sides, modifier }) => {
      if (!VALID_SIDES.includes(sides)) {
        return { content: [{ type: "text", text: "sides must be 6 or 10" }], isError: true };
      }
      if (numDice < 1) {
        return { content: [{ type: "text", text: "numDice must be at least 1" }], isError: true };
      }

      const isSkillCheck = numDice === 1 && sides === 10;
      const { rolls, diceTotal, critResult } = isSkillCheck ? rollSkillCheck() : rollGeneric(numDice, sides);
      const total = diceTotal + modifier;
      const critPrefix =
        critResult === "success" ? "Critical Success! " : critResult === "failure" ? "Critical Failure! " : "";
      const summary = `${critPrefix}Rolled ${total}! (${formatDiceBreakdown(rolls, sides, critResult)}${formatModifier(modifier)})`;

      return { content: [{ type: "text", text: JSON.stringify({ total, summary, critResult }) }] };
    },
  );

  // A one-call STAT check for an NPC that has no stat block - the narrative
  // DM's guard, bartender, or rival fixer, or a bystander who wanders into a
  // fight. Looks the STAT total up from the same table combat enemies are
  // statted from (server/combat/enemy-stats.js) and rolls the 1d10 in the
  // same call, so there's no number to look up and then invent. Enemies
  // already in a combat's handoff carry all seven STATs in their block and
  // should use roll_dice with that value instead.
  server.registerTool(
    "npc_check",
    {
      description: `Roll a STAT check for an NPC that has no stat block, in one call: you name the kind of NPC and which STAT the action falls under, this looks up the NPC's total and rolls 1d10 on it. Pass the DV when there is one (not for a check opposed by a player's roll) - the result then says whether the roll beat it. Never use this for player rolls. Decide the STAT yourself rather than consulting a skill list - ${STATS.map((s) => `${s}: ${STAT_HINTS[s]}`).join("; ")}. Archetypes: ${ARCHETYPE_DESCRIPTION} Tier is skill/danger, 1 untrained to 5 boss.`,
      inputSchema: {
        archetype: z.enum(ARCHETYPE_NAMES).describe("What kind of NPC this is, judged from the fiction."),
        tier: z.number().int().min(1).max(5).describe("1 untrained, 2 mook, 3 professional, 4 elite, 5 boss."),
        stat: z.enum(STATS).describe("The STAT the action falls under."),
        dv: z.number().int().optional().describe("The DV to beat, when the check is against one. Decide it before you call; the result reports success. Omit for a check opposed by a player's roll."),
        purpose: z.string().optional().describe("What the check is for, e.g. 'notice Vidik on the catwalk' - echoed back so the result reads clearly."),
      },
    },
    async ({ archetype, tier, stat, dv, purpose }) => {
      if (!TIER_NUMBERS.includes(tier)) {
        return { content: [{ type: "text", text: `tier must be one of ${TIER_NUMBERS.join(", ")}` }], isError: true };
      }
      const modifier = statTotal({ tier, archetype }, stat);
      const { rolls, diceTotal, critResult } = rollSkillCheck();
      const total = diceTotal + modifier;
      const critPrefix =
        critResult === "success" ? "Critical Success! " : critResult === "failure" ? "Critical Failure! " : "";
      const label = purpose ? `${purpose} - ` : "";
      // Every compared roll in this game must beat its target; a tie fails.
      const success = Number.isInteger(dv) ? total > dv : null;
      const dvNote = success === null ? "" : ` vs DV ${dv} - ${success ? "success" : "failure"}`;
      const summary = `${label}${critPrefix}Rolled ${total}! (${stat} ${modifier} + ${formatDiceBreakdown(rolls, 10, critResult)})${dvNote}`;

      return { content: [{ type: "text", text: JSON.stringify({ statTotal: modifier, total, success, summary, critResult }) }] };
    },
  );

  return server;
}
