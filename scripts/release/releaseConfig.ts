/** Anthropic model that writes the release notes. Swap here to change it. */
export const RELEASE_NOTES_MODEL = "claude-sonnet-5-5";

/** Anthropic Messages API endpoint. */
export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

/** Required `anthropic-version` header for the Messages API. */
export const ANTHROPIC_API_VERSION = "2023-06-01";

/** Upper bound on the model reply, in tokens. */
export const RELEASE_NOTES_MAX_TOKENS = 4096;

/**
 * Characters of diff sent per commit, so one huge merge cannot blow up the
 * prompt. Chosen to cover a typical feature branch's source changes.
 */
export const DIFF_CHAR_BUDGET = 12_000;

/** Registry used to tell whether a version is already published. */
export const NPM_REGISTRY_URL = "https://registry.npmjs.org";
