import { z } from "zod";
import { createIssue } from "../github.js";
import { defineTool } from "./define-tool.js";

export interface CreateIssueInput {
  repo?: string;
  title: string;
  body: string;
  labels?: string[];
}

export const createIssueInputSchema = {
  repo: z.string().optional(),
  title: z.string(),
  body: z.string(),
  labels: z.array(z.string()).optional(),
};

export const createIssueTool = defineTool<CreateIssueInput>({
  name: "create_issue",
  description:
    "Create a new top-level issue in a repository. Defaults to the configured default repo when `repo` is omitted.",
  inputSchema: createIssueInputSchema,
  validate(input, context) {
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
  async call(context, input) {
    const issue = await createIssue(context.github, input);
    return { ...issue, repo: context.repo };
  },
});
