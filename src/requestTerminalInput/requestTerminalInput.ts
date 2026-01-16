import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { generateTerminalMessage } from "@/generateTerminalMessage";

const COLOR_TOKEN_REGEX = /\|[a-zA-Z_]+\|/g;

type RequestTerminalInputOptions = {
  message: string;
  params: Record<string, string>;
  options: {
    required: boolean;
    type?: "string" | "number" | "boolean";
  };
};

function messageHasPunctuation(message: string): boolean {
  const stripped = message.replace(COLOR_TOKEN_REGEX, "").trimEnd();
  return stripped.endsWith(":") || stripped.endsWith("?");
}

/**
 * Prompt the user for terminal input, optionally enforcing a non-empty value.
 */
export async function requestTerminalInput(
  options: RequestTerminalInputOptions,
): Promise<string | undefined> {
  const { message, params, options: promptOptions } = options;
  const notice =
    promptOptions.required ? "" : " |gray|(press Enter to leave empty)|reset|";
  const booleanNotice = promptOptions.type === "boolean" ? " |reset|(y/n)" : "";
  const promptMessage = `${message}${booleanNotice}${notice}`;
  const promptText =
    messageHasPunctuation(message) ? `${promptMessage} ` : `${promptMessage}: `;
  const prompt = generateTerminalMessage(promptText, params);

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const answer = await rl.question(prompt);
      const trimmed = answer.trim();
      if (trimmed.length === 0) {
        if (promptOptions.required) {
          stdout.write(
            generateTerminalMessage(
              "|red|This value is required.|reset| Please enter a value.\n",
            ),
          );
          continue;
        }
        return undefined;
      }
      if (promptOptions.type === "boolean") {
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
