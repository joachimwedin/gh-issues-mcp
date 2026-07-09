import { DEFAULT_LABEL_VOCABULARY } from "../config.js";
import { defineTool } from "./define-tool.js";

export type ListReposInput = Record<string, never>;

export const listReposInputSchema = {};

export const listReposTool = defineTool<ListReposInput>({
  name: "list_repos",
  description: "List the configured repo allowlist and each repo's effective label vocabulary.",
  inputSchema: listReposInputSchema,
  async call(context) {
    return context.repos.map((entry) => ({
      repo: entry.repo,
      labelVocabulary: entry.labelVocabulary ?? DEFAULT_LABEL_VOCABULARY,
    }));
  },
});
