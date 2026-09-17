import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import { rollD20Check, rollDamage, formatModifier } from "./dice.js";
import {
  ABILITIES,
  CLASSES,
  CLASS_DESCRIPTION,
  SAVES,
  SKILLS,
  abilityBonus,
  saveBonus,
  skillBonus,
} from "../server/combat/enemy-stats.js";

const DOCS_DIR = fileURLToPath(new URL("./docs", import.meta.url));
const VALID_SIDES = [4, 6, 8, 10, 12, 20];
const CLASS_NAMES = Object.keys(CLASSES);

export function createGameMcpServer() {
  const server = new McpServer({ name: "laria-5e-tools", version: "1.0.0" });

  server.registerTool(
    "list_docs",
    {
      description: "List the available docs/rules topic files.",
    },
    async () => {
      const files = readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md"));
      return { content: [{ type: "text", text: JSON.stringify(files) }] };
    },
  );

  server.registerTool(
    "read_doc",
    {
      description: "Read the full contents of one docs/rules topic file by name.",
      inputSchema: {
        filename: z.string().describe('Filename from list_docs, e.g. "regions.md"'),
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
        sides: z.union(VALID_SIDES.map((n) => z.literal(n))).describe("Sides per die: 4, 6, 8, 10, 12, or 20"),
        modifier: z.number().int().describe("Single combined modifier to add to the roll total"),
      },
    },
    async ({ numDice, sides, modifier }) => {
      if (!VALID_SIDES.includes(sides)) {
        return { content: [{ type: "text", text: `sides must be one of ${VALID_SIDES.join(", ")}` }], isError: true };
      }
      if (numDice < 1) {
        return { content: [{ type: "text", text: "numDice must be at least 1" }], isError: true };
      }

      // A single d20 is a check (attack roll, opposed check, etc.) and gets
      // crit/fumble treatment on a natural 20/1; anything else (damage, or
      // multiple/non-d20 dice) is a plain sum with no crit concept.
      if (numDice === 1 && sides === 20) {
        const { kept, isCrit, isFumble } = rollD20Check("flat");
        const total = kept + modifier;
        const critPrefix = isCrit ? "Critical Success! " : isFumble ? "Critical Failure! " : "";
        const summary = `${critPrefix}Rolled ${total}! (d20 [${kept}]${formatModifier(modifier)})`;
        const critResult = isCrit ? "success" : isFumble ? "failure" : null;
        return { content: [{ type: "text", text: JSON.stringify({ total, summary, critResult }) }] };
      }

      const { rolls, sum } = rollDamage(numDice, sides);
      const total = sum + modifier;
      const summary = `Rolled ${total}! (${numDice}d${sides} [${rolls.join(", ")}]${formatModifier(modifier)})`;

      return { content: [{ type: "text", text: JSON.stringify({ total, summary, critResult: null }) }] };
    },
  );

  // A skill check, ability check, or save for an NPC, resolved from the
  // same class + power level tables the combat engine stats enemies with
  // (server/combat/enemy-stats.js), in one call. Shared by both DMs: the
  // narrative DM judges class and power level from the fiction for a guard
  // noticing the party or a merchant seeing through a lie; the combat DM
  // passes them from an enemy's stat block, since skills - the long tail -
  // aren't precomputed into it.
  server.registerTool(
    "npc_check",
    {
      description: `Roll a skill check, ability check, or saving throw (fortitude, reflex, or will) for an NPC or enemy, in one call: name the kind of NPC (class and power level - from its stat block if it has one, judged from the fiction if not) and what's being rolled, and this looks up the bonus and rolls 1d20 on it. Pass the DC when there is one (not for a contest against a player's roll) - the result then says whether the roll beat it. Never use this for player rolls. Classes: ${CLASS_DESCRIPTION} Power level is skill/danger, 1 untrained to 5 boss. Keep the same class and power level for an NPC every time they roll.`,
      inputSchema: {
        class: z.enum(CLASS_NAMES).describe("The closest class for how this NPC would fight and what they're good at."),
        powerLevel: z.number().int().min(1).max(5).describe("1 untrained, 2 adept, 3 professional, 4 elite, 5 boss."),
        skill: z.enum(SKILLS).optional().describe("For a skill check."),
        ability: z.enum(ABILITIES).optional().describe("For a raw ability check."),
        save: z.enum(SAVES).optional().describe("For a saving throw: fortitude (Constitution), reflex (Dexterity), or will (Wisdom). Map an effect's named ability onto the nearest of the three."),
        advantage: z.enum(["adv", "dis"]).optional().describe("Roll 2d20 and keep the higher (adv) or lower (dis). Omit for a flat roll."),
        dc: z.number().int().optional().describe("The DC to beat, when the roll is against one. Decide it before you call; the result reports success. Omit for a contest against a player's roll."),
        purpose: z.string().optional().describe("What the roll is for, e.g. 'notice Kael on the wall' - echoed back so the result reads clearly."),
      },
    },
    async ({ class: cls, powerLevel, skill, ability, save, advantage, dc, purpose }) => {
      if ([skill, ability, save].filter(Boolean).length !== 1) {
        return { content: [{ type: "text", text: "Give exactly one of `skill`, `ability`, or `save`" }], isError: true };
      }
      const npc = { class: cls, powerLevel };
      const modifier = skill ? skillBonus(npc, skill) : save ? saveBonus(npc, save) : abilityBonus(npc, ability);
      const what = skill ?? (save ? `${save} save` : `${ability} check`);
      const adv = advantage ?? "flat";
      const { kept, isCrit, isFumble } = rollD20Check(adv);
      const total = kept + modifier;
      const critPrefix = isCrit ? "Critical Success! " : isFumble ? "Critical Failure! " : "";
      const advSuffix = adv === "adv" ? " (Advantage)" : adv === "dis" ? " (Disadvantage)" : "";
      const label = purpose ? `${purpose} - ` : "";
      // Every compared roll in this game must beat its target; a tie fails.
      const success = Number.isInteger(dc) ? total > dc : null;
      const dcNote = success === null ? "" : ` vs DC ${dc} - ${success ? "success" : "failure"}`;
      const summary = `${label}${critPrefix}Rolled ${total}!${advSuffix} (${what} ${formatModifier(modifier).trim() || "+ 0"}, d20 [${kept}])${dcNote}`;
      const critResult = isCrit ? "success" : isFumble ? "failure" : null;
      return { content: [{ type: "text", text: JSON.stringify({ bonus: modifier, total, success, summary, critResult }) }] };
    },
  );

  return server;
}
