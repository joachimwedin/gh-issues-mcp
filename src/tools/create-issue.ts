import { z } from "zod";
import { createIssue } from "../github.js";
import { defineTool } from "./define-tool.js";
import type { McpToolContext } from "./context.js";

export interface CreateIssueInput {
  title: string;
  body: string;
  labels?: string[];
}

export const createIssueInputSchema = {
  title: z.string(),
  body: z.string(),
  labels: z.array(z.string()).optional(),
};

export const createIssueTool = defineTool<CreateIssueInput>({
  name: "create_issue",
  description: "Create a new top-level issue in the configured repo.",
  inputSchema: createIssueInputSchema,
  validate(input, context: McpToolContext) {
    const invalid = (input.labels ?? []).filter((label) => !context.labelVocabulary.includes(label));

    if (invalid.length === 0) return undefined;

    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Label(s) not in the configured vocabulary: ${invalid.join(", ")}. Allowed labels: ${context.labelVocabulary.join(", ")}.`,
        },
      ],
    };
  },
  call: (context, input) => createIssue(context.github, input.title, input.body, input.labels),
});
