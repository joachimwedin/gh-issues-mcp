import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { editLabels } from "../github.js";
import { runWithAuditLog } from "./run-with-audit-log.js";
import type { McpToolContext } from "./context.js";

export interface EditLabelsInput {
  number: number;
  add?: string[];
  remove?: string[];
}

export const editLabelsInputSchema = {
  number: z.number().int(),
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
};

function invalidLabels(labels: string[] | undefined, vocabulary: string[]): string[] {
  return (labels ?? []).filter((label) => !vocabulary.includes(label));
}

export async function editLabelsHandler(
  context: McpToolContext,
  input: EditLabelsInput,
): Promise<CallToolResult> {
  const invalid = [
    ...invalidLabels(input.add, context.labelVocabulary),
    ...invalidLabels(input.remove, context.labelVocabulary),
  ];

  if (invalid.length > 0) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Label(s) not in the configured vocabulary: ${invalid.join(", ")}. Allowed labels: ${context.labelVocabulary.join(", ")}.`,
        },
      ],
    };
  }

  return runWithAuditLog(context, "edit_labels", input, () =>
    editLabels(context.github, input.number, input.add ?? [], input.remove ?? []),
  );
}

export function registerEditLabelsTool(server: McpServer, context: McpToolContext): void {
  server.registerTool(
    "edit_labels",
    {
      description: "Add and/or remove labels on the given issue, restricted to the configured label vocabulary.",
      inputSchema: editLabelsInputSchema,
    },
    async (input) => editLabelsHandler(context, input),
  );
}
