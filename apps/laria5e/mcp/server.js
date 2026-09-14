import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import { rollD20Check, rollDamage, formatModifier } from "./dice.js";

const DOCS_DIR = fileURLToPath(new URL("./docs", import.meta.url));
const VALID_SIDES = [4, 6, 8, 10, 12, 20];

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

  return server;
}
