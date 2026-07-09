import { z } from "zod";
import { commentIssue } from "../github.js";
import { defineTool } from "./define-tool.js";
import { tagRepo } from "./tag-repo.js";

export interface CommentIssueInput {
  repo?: string;
  number: number;
  body: string;
}

export const commentIssueInputSchema = {
  repo: z.string().optional(),
  number: z.number().int(),
  body: z.string(),
};

export const commentIssueTool = defineTool<CommentIssueInput>({
  name: "comment_issue",
  description:
    "Post a comment to the given issue. Defaults to the configured default repo when `repo` is omitted.",
  inputSchema: commentIssueInputSchema,
  async call(context, input) {
    const comment = await commentIssue(context.github, input);
    return tagRepo(comment, context.repo);
  },
});
