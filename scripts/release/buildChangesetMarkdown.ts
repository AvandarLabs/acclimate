import type { BumpLevel } from "./bumpLevel";

/** Renders the contents of a `.changeset/*.md` file for one release note. */
export function buildChangesetMarkdown(params: {
  packageName: string;
  bump: BumpLevel;
  text: string;
}): string {
  const { packageName, bump, text } = params;
  if (bump === "none") {
    throw new Error("A changeset needs a patch, minor, or major bump.");
  }
  return `---\n"${packageName}": ${bump}\n---\n\n${text.trim()}\n`;
}
