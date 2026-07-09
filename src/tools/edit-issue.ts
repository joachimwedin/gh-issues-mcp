import { z } from "zod";
import { editIssue } from "../github.js";
import { defineTool } from "./define-tool.js";

export interface EditIssueInput {
  number: number;
  title?: string;
  body?: string;
}

export const editIssueInputSchema = {
  number: z.number().int(),
  title: z.string().optional(),
  body: z.string().optional(),
};

export const editIssueTool = defineTool<EditIssueInput>({
  name: "edit_issue",
  description: "Update an issue's title and/or body. At least one of title or body must be given.",
  inputSchema: editIssueInputSchema,
  validate(input) {
    if (input.title !== undefined || input.body !== undefined) return undefined;

    return {
      isError: true,
      content: [{ type: "text", text: "At least one of title or body must be given." }],
    };
  },
  call: (context, input) => editIssue(context.github, input.number, input.title, input.body),
});
