import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { generateTerminalMessage } from "@/generateTerminalMessage";

const COLOR_TOKEN_REGEX = /\|[a-zA-Z_]+\|/g;

/**
 * Prompt the user for terminal input, optionally enforcing a non-empty value.
 */
export async function requestTerminalInput(options: {
  message: string;
  params: Record<string, string>;
  promptOptions: {
    required: boolean;
    type?: "string" | "number" | "boolean";

    /** The default value to use if the user provides an empty response */
    defaultValue?: string | number | boolean;
  };
}): Promise<string | undefined> {
  const {
    message,
    params,
    promptOptions: { required, type, defaultValue },
  } = options;
  const notice =
    defaultValue !== undefined ? " |gray|(press Enter to use default)|reset|"
    : required ? ""
    : " |gray|(press Enter to leave empty)|reset|";
  const defaultNotice =
    defaultValue !== undefined ? ` [default: ${defaultValue}]` : "";
  const booleanNotice = type === "boolean" ? " |reset|(y/n)" : "";
  const promptMessage = `${message}${defaultNotice}${booleanNotice}${notice} `;
  const prompt = generateTerminalMessage(promptMessage, params);

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const answer = await rl.question(prompt);
      const trimmed = answer.trim();
      if (trimmed.length === 0) {
        if (defaultValue !== undefined) {
          // use the default value, parsed to a string
          return (
            typeof defaultValue === "string" ? defaultValue
            : typeof defaultValue === "number" ? String(defaultValue)
            : defaultValue ? "true"
            : "false"
          );
        }

        if (required) {
          stdout.write(
            generateTerminalMessage(
              "|red|This value is required.|reset| Please enter a value.\n",
            ),
          );
          continue;
        }
        return undefined;
      }
      if (type === "boolean") {
        const normalized = trimmed.toLowerCase();
        if (normalized === "y" || normalized === "yes") {
          return "true";
        }
        if (normalized === "n" || normalized === "no") {
          return "false";
        }
        stdout.write(
          generateTerminalMessage(
            "|red|That was not a valid response.|reset| Please enter y or n.\n",
          ),
        );
        continue;
      }
      return answer;
    }
  } finally {
    rl.close();
  }
}
