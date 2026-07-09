import { z } from "zod";
import { createSubIssue } from "../github.js";
import { defineTool } from "./define-tool.js";

export interface CreateSubIssueInput {
  repo?: string;
  parent_number: number;
  title: string;
  body: string;
}

export const createSubIssueInputSchema = {
  repo: z.string().optional(),
  parent_number: z.number().int(),
  title: z.string(),
  body: z.string(),
};

export const createSubIssueTool = defineTool<CreateSubIssueInput>({
  name: "create_sub_issue",
  description:
    "Create a new issue and link it as a sub-issue of the given parent issue. Both the parent and the new sub-issue are in the same repo. Defaults to the configured default repo when `repo` is omitted.",
  inputSchema: createSubIssueInputSchema,
  async call(context, input) {
    const issue = await createSubIssue(context.github, {
      parentNumber: input.parent_number,
      title: input.title,
      body: input.body,
    });
    return { ...issue, repo: context.repo };
  },
});
