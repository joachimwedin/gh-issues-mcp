import { z } from "zod";
import { editIssue } from "../github.js";
import { defineTool } from "./define-tool.js";
import { tagRepo } from "./tag-repo.js";

export interface EditIssueInput {
  repo?: string;
  number: number;
  title?: string;
  body?: string;
}

export const editIssueInputSchema = {
  repo: z.string().optional(),
  number: z.number().int(),
  title: z.string().optional(),
  body: z.string().optional(),
};

export const editIssueTool = defineTool<EditIssueInput>({
  name: "edit_issue",
  description:
    "Update an issue's title and/or body. At least one of title or body must be given. Defaults to the configured default repo when `repo` is omitted.",
  inputSchema: editIssueInputSchema,
  validate(input) {
    if (input.title !== undefined || input.body !== undefined) return undefined;

    return {
      isError: true,
      content: [{ type: "text", text: "At least one of title or body must be given." }],
    };
  },
  async call(context, input) {
    const issue = await editIssue(context.github, input);
    return tagRepo(issue, context.repo);
  },
});
