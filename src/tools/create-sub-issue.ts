import { z } from "zod";
import { createSubIssue } from "../github.js";
import { defineTool } from "./define-tool.js";

export interface CreateSubIssueInput {
  parent_number: number;
  title: string;
  body: string;
}

export const createSubIssueInputSchema = {
  parent_number: z.number().int(),
  title: z.string(),
  body: z.string(),
};

export const createSubIssueTool = defineTool<CreateSubIssueInput>({
  name: "create_sub_issue",
  description: "Create a new issue and link it as a sub-issue of the given parent issue.",
  inputSchema: createSubIssueInputSchema,
  call: (context, input) => createSubIssue(context.github, input.parent_number, input.title, input.body),
});
