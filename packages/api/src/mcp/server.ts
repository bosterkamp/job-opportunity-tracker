import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// The tracker's MCP server. A new one is made for each request: the transport keeps no
// sessions, so nothing carries over between requests (research.md §3). User stories 2 and 3
// register the tools.

export const SERVER_INFO = { name: 'job-opportunity-tracker', version: '1.0.0' } as const;

export type ToolRegistrar = (server: McpServer) => void;

export function createMcpServer(registrars: ToolRegistrar[] = []): McpServer {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "Tools for the owner's personal job opportunity tracker. Use the stage names and ids the " +
      'tools return. Deleting opportunities is only possible in the web app.',
  });
  for (const register of registrars) {
    register(server);
  }
  return server;
}
