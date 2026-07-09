import { z } from "zod";
import { listIssues } from "../github.js";
import { defineTool } from "./define-tool.js";

export interface ListIssuesInput {
  state?: string;
  labels?: string[];
}

export const listIssuesInputSchema = {
  state: z.enum(["open", "closed", "all"]).optional(),
  labels: z.array(z.string()).optional(),
};

export const listIssuesTool = defineTool<ListIssuesInput>({
  name: "list_issues",
  description: "List issues in the configured repository, optionally filtered by state and labels.",
  inputSchema: listIssuesInputSchema,
  call: (context, input) => listIssues(context.github, input),
});
