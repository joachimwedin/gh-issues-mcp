import { z } from "zod";
import { closeIssue } from "../github.js";
import { defineTool } from "./define-tool.js";

export interface CloseIssueInput {
  repo?: string;
  number: number;
  comment: string;
}

/**
 * `comment` has no `.optional()`, so a close_issue call with no comment is
 * rejected by the MCP SDK's own schema validation before the handler ever
 * runs — closing without an explanation is structurally impossible.
 */
export const closeIssueInputSchema = {
  repo: z.string().optional(),
  number: z.number().int(),
  comment: z.string(),
};

export const closeIssueTool = defineTool<CloseIssueInput>({
  name: "close_issue",
  description:
    "Post a comment and close the given issue. A comment is required, so an issue can never be closed without an explanation. Defaults to the configured default repo when `repo` is omitted.",
  inputSchema: closeIssueInputSchema,
  async call(context, input) {
    const issue = await closeIssue(context.github, input);
    return { ...issue, repo: context.repo };
  },
});
