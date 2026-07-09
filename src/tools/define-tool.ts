import type { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { runWithAuditLog } from "./run-with-audit-log.js";
import type { McpToolContext } from "./context.js";

export interface ToolDefinition<TInput> {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  /** Runs before the audit-logged GitHub call. Returning a result short-circuits `call` and the audit log entirely. */
  validate?: (input: TInput, context: McpToolContext) => CallToolResult | undefined;
  call: (context: McpToolContext, input: TInput) => Promise<unknown>;
}

/** The subset of `DefinedTool` that doesn't depend on the tool's input type, so a mixed array of tools can be typed. */
export interface RegisterableTool {
  name: string;
  register: (server: McpServer, context: McpToolContext) => void;
}

export interface DefinedTool<TInput> extends RegisterableTool {
  handler: (context: McpToolContext, input: TInput) => Promise<CallToolResult>;
}

/**
 * Collapses the register*Tool -> *Handler -> runWithAuditLog layers every
 * tool used to hand-copy into one deep module: a tool file supplies only its
 * schema, optional pre-call validation, and its GitHub-calling logic.
 */
export function defineTool<TInput>(def: ToolDefinition<TInput>): DefinedTool<TInput> {
  async function handler(context: McpToolContext, input: TInput): Promise<CallToolResult> {
    const validationError = def.validate?.(input, context);
    if (validationError) return validationError;

    return runWithAuditLog(context, def.name, input, () => def.call(context, input));
  }

  function register(server: McpServer, context: McpToolContext): void {
    server.registerTool(
      def.name,
      { description: def.description, inputSchema: def.inputSchema },
      async (input) => handler(context, input as TInput),
    );
  }

  return { name: def.name, handler, register };
}
