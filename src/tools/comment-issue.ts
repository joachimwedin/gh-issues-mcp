import { z } from "zod";
import { commentIssue } from "../github.js";
import { defineTool } from "./define-tool.js";

export interface CommentIssueInput {
  number: number;
  body: string;
}

export const commentIssueInputSchema = {
  number: z.number().int(),
  body: z.string(),
};

export const commentIssueTool = defineTool<CommentIssueInput>({
  name: "comment_issue",
  description: "Post a comment to the given issue.",
  inputSchema: commentIssueInputSchema,
  call: (context, input) => commentIssue(context.github, input.number, input.body),
});
