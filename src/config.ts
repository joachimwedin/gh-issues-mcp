import { readFileSync } from "node:fs";

export interface ServerConfig {
  owner: string;
  repo: string;
  port: number;
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

  const { owner, repo, port } = parsed as Record<string, unknown>;

  if (typeof owner !== "string" || owner.length === 0) {
    throw new Error(`Config file at "${path}" is missing a valid "owner" string.`);
  }
  if (typeof repo !== "string" || repo.length === 0) {
    throw new Error(`Config file at "${path}" is missing a valid "repo" string.`);
  }
  if (typeof port !== "number" || !Number.isInteger(port)) {
    throw new Error(`Config file at "${path}" is missing a valid integer "port".`);
  }

  return { owner, repo, port };
}
