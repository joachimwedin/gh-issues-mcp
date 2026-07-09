import { z } from "zod";
import { viewIssue } from "../github.js";
import { defineTool } from "./define-tool.js";

export interface ViewIssueInput {
  repo?: string;
  number: number;
}

export const viewIssueInputSchema = {
  repo: z.string().optional(),
  number: z.number().int(),
};

export const viewIssueTool = defineTool<ViewIssueInput>({
  name: "view_issue",
  description:
    "View a single issue's body, labels, and full comment history. Defaults to the configured default repo when `repo` is omitted.",
  inputSchema: viewIssueInputSchema,
  async call(context, input) {
    const issue = await viewIssue(context.github, input);
    return { ...issue, repo: context.repo };
  },
});
