/** Tags a GitHub API result with the resolved repo it came from, the shape every issue-shaped tool returns. */
export function tagRepo<T extends object>(value: T, repo: string): T & { repo: string } {
  return { ...value, repo };
}
