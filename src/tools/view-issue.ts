import { z } from "zod";
import { viewIssue } from "../github.js";
import { defineTool } from "./define-tool.js";

export interface ViewIssueInput {
  number: number;
}

export const viewIssueInputSchema = {
  number: z.number().int(),
};

export const viewIssueTool = defineTool<ViewIssueInput>({
  name: "view_issue",
  description: "View a single issue's body, labels, and full comment history.",
  inputSchema: viewIssueInputSchema,
  call: (context, input) => viewIssue(context.github, input.number),
});
