import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import { rollSkillCheck, rollGeneric, formatModifier, formatDiceBreakdown } from "./dice.js";

const DOCS_DIR = fileURLToPath(new URL("./docs", import.meta.url));
const VALID_SIDES = [6, 10];

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

  return server;
}
