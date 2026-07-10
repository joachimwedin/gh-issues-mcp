import { z } from "zod";
import { listIssues } from "../github.js";
import { defineTool } from "./define-tool.js";
import { tagRepo } from "./tag-repo.js";

export interface ListIssuesInput {
  repo?: string;
  state?: string;
  labels?: string[];
  includeComments?: boolean;
}

export const listIssuesInputSchema = {
  repo: z.string().optional(),
  state: z.enum(["open", "closed", "all"]).optional(),
  labels: z.array(z.string()).optional(),
  includeComments: z.boolean().optional(),
};

export const listIssuesTool = defineTool<ListIssuesInput>({
  name: "list_issues",
  description:
    "List issues in a repository, optionally filtered by state and labels. Set includeComments to also fetch each issue's full comment history in the same call. Defaults to the configured default repo when `repo` is omitted.",
  inputSchema: listIssuesInputSchema,
  async call(context, input) {
    const issues = await listIssues(context.github, input);
    return issues.map((issue) => tagRepo(issue, context.repo));
  },
});
