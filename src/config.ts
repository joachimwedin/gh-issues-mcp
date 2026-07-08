import { readFileSync } from "node:fs";

export const DEFAULT_LABEL_VOCABULARY = [
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "wontfix",
];

export interface ServerConfig {
  owner: string;
  repo: string;
  port: number;
  labelVocabulary: string[];
}

/**
 * Loads the server's target owner/repo and listen port from a local JSON
 * config file. One server instance is scoped to exactly one repo, so this
 * is read once at startup rather than accepted per-call.
 */
export function loadConfig(path: string): ServerConfig {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Config file not found at "${path}".`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Config file at "${path}" contains invalid JSON.`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Config file at "${path}" must contain a JSON object.`);
  }

  const { owner, repo, port, labelVocabulary } = parsed as Record<string, unknown>;

  if (typeof owner !== "string" || owner.length === 0) {
    throw new Error(`Config file at "${path}" is missing a valid "owner" string.`);
  }
  if (typeof repo !== "string" || repo.length === 0) {
    throw new Error(`Config file at "${path}" is missing a valid "repo" string.`);
  }
  if (typeof port !== "number" || !Number.isInteger(port)) {
    throw new Error(`Config file at "${path}" is missing a valid integer "port".`);
  }

  let vocabulary = DEFAULT_LABEL_VOCABULARY;
  if (labelVocabulary !== undefined) {
    if (
      !Array.isArray(labelVocabulary) ||
      !labelVocabulary.every((label) => typeof label === "string" && label.length > 0)
    ) {
      throw new Error(
        `Config file at "${path}" has an invalid "labelVocabulary"; expected an array of non-empty strings.`,
      );
    }
    vocabulary = labelVocabulary as string[];
  }

  return { owner, repo, port, labelVocabulary: vocabulary };
}
