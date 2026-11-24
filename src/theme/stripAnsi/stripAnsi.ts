const ANSI_CSI_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`,
  "g",
);

/**
 * Strips ANSI CSI color and cursor-control escape sequences from `text` while
 * preserving plain characters, newlines, and emoji.
 *
 * Use wherever plain-mode output must guarantee escape-free text, such as
 * sanitizing pre-rendered usage text on redirected streams or `NO_COLOR`.
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_CSI_PATTERN, "");
}
