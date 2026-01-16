import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateTerminalMessage } from "@/generateTerminalMessage";
import { requestTerminalInput } from "./requestTerminalInput";

type ReadlineMocks = {
  question: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  createInterface: ReturnType<typeof vi.fn>;
};

const readlineMocks: ReadlineMocks = vi.hoisted(() => {
  const question = vi.fn<() => Promise<string>>();
  const close = vi.fn();
  const createInterface = vi.fn(() => {
    return { question, close };
  });

  return { question, close, createInterface };
});

vi.mock("node:readline/promises", () => {
  return {
    createInterface: readlineMocks.createInterface,
  };
});

beforeEach(() => {
  readlineMocks.question.mockReset();
  readlineMocks.close.mockReset();
  readlineMocks.createInterface.mockReset();
  readlineMocks.createInterface.mockReturnValue({
    question: readlineMocks.question,
    close: readlineMocks.close,
  });
});

describe("requestTerminalInput", () => {
  it("adds the optional notice and interpolates params", async () => {
    readlineMocks.question.mockResolvedValueOnce("alpha");

    const result = await requestTerminalInput({
      message: "|bright_cyan|Target for $env$|reset|",
      params: { env: "dev" },
      options: { required: false },
    });

    expect(readlineMocks.question).toHaveBeenCalledWith(
      generateTerminalMessage(
        "|bright_cyan|Target for $env$|reset| |gray|(press Enter to leave empty)|reset|: ",
        { env: "dev" },
      ),
    );
    expect(result).toBe("alpha");
  });

  it("returns undefined when optional input is empty", async () => {
    readlineMocks.question.mockResolvedValueOnce("");

    const result = await requestTerminalInput({
      message: "Provide a note",
      params: {},
      options: { required: false },
    });

    expect(result).toBeUndefined();
  });

  it("adds a boolean hint to the prompt", async () => {
    readlineMocks.question.mockResolvedValueOnce("y");

    await requestTerminalInput({
      message: "Enable feature",
      params: {},
      options: { required: false, type: "boolean" },
    });

    expect(readlineMocks.question).toHaveBeenCalledWith(
      generateTerminalMessage(
        "Enable feature |reset|(y/n) |gray|(press Enter to leave empty)|reset|: ",
        {},
      ),
    );
  });

  it("re-prompts when a boolean response is invalid", async () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => {
        return true;
      });

    readlineMocks.question
      .mockResolvedValueOnce("maybe")
      .mockResolvedValueOnce("n");

    const result = await requestTerminalInput({
      message: "Enable feature?",
      params: {},
      options: { required: false, type: "boolean" },
    });

    expect(readlineMocks.question).toHaveBeenCalledTimes(2);
    expect(stdoutSpy).toHaveBeenCalledWith(
      generateTerminalMessage(
        "|red|That was not a valid response.|reset| Please enter y or n.\n",
      ),
    );
    expect(result).toBe("false");

    stdoutSpy.mockRestore();
  });

  it("re-prompts until required input is provided", async () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => {
        return true;
      });

    readlineMocks.question
      .mockResolvedValueOnce("")
      .mockResolvedValueOnce("value");

    const result = await requestTerminalInput({
      message: "Enter value",
      params: {},
      options: { required: true },
    });

    expect(readlineMocks.question).toHaveBeenCalledTimes(2);
    expect(stdoutSpy).toHaveBeenCalledWith(
      generateTerminalMessage(
        "|red|This value is required.|reset| Please enter a value.\n",
      ),
    );
    expect(result).toBe("value");

    stdoutSpy.mockRestore();
  });
});
