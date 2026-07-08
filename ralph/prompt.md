# ISSUES

Issues are fetched from GitHub using:
`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters. 
Parse them to understand the open issues.

You will work on the ready-for-agent issues only.

You've also been passed a list containing the last few commits. Review these to understand what work has been done.

If all ready-for-agent tasks are complete, output <promise>NO MORE TASKS</promise>.

# TASK SELECTION

Pick the next task. Prioritize tasks in this order:

1. Critical bugfixes
2. Development infrastructure

Getting development infrastructure like tests and types and dev scripts ready is an important precursor to building features.

3. Tracer bullets for new features

Tracer bullets are small slices of functionality that go through all layers of the system, allowing you to test and validate your approach early. This helps in identifying potential issues and ensures that the overall architecture is sound before investing significant time in development.

TL;DR - build a tiny, end-to-end slice of the feature first, then expand it out.

4. Polish and quick wins
5. Refactors

# EXPLORATION

Explore the repo.

# IMPLEMENTATION

Use /tdd to complete the task.

# FEEDBACK LOOPS

Before committing, run the feedback loops:

- `npm run build` to verify it builds
- `npm run test` to verify that the tests pass

# COMMIT

Make a git commit. The commit message must:

1. Start with the issue number, e.g #42
2. Include key decisions made
3. Include files changed
4. Blockers or notes for next iteration

# THE ISSUE

If the task is complete, close the issue with `gh issue close <number> --comment "..."`

If the task is not complete, add a comment to the issue with what was done using `gh issue comment <number> --body "..."`.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
