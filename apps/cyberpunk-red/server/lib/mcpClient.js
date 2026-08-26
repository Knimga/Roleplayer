import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createGameMcpServer } from "../../mcp/server.js";

// Lazily created once, not per-request: the MCP server + client are linked
// in-process via InMemoryTransport (no subprocess, no network hop).
let clientPromise;

function getMcpClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const server = createGameMcpServer();
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "cyberpunk-red-backend", version: "1.0.0" });
      await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
      return client;
    })();
  }
  return clientPromise;
}

export async function getMcpTools() {
  const client = await getMcpClient();
  const { tools } = await client.listTools();
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}

export async function callMcpTool(name, args) {
  const client = await getMcpClient();
  return client.callTool({ name, arguments: args ?? {} });
}
