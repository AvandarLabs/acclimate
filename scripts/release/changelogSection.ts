/**
 * Returns the body of the `## <version>` section of a Changesets
 * `CHANGELOG.md` (without the heading), or undefined when there is none.
 */
export function extractChangelogSection(params: {
  changelog: string;
  version: string;
}): string | undefined {
  const { changelog, version } = params;
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => {
    return line.trim() === `## ${version}`;
  });
  if (start === -1) {
    return undefined;
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => {
    return line.startsWith("## ");
  });
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  return body === "" ? undefined : body;
}
