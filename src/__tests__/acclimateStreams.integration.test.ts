import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { Acclimate } from "@/Acclimate/Acclimate";
import type { TerminalSession } from "@/terminalSession/terminalSession.types";

function _createStream(isTty: boolean) {
  const chunks: string[] = [];
  return {
    isTTY: isTty,
    write: (chunk: string) => {
      chunks.push(chunk);
      return true;
    },
    getOutput: () => {
      return chunks.join("");
    },
  };
}

describe("Acclimate stream separation", () => {
  it("writes Acclimate.log diagnostics to stderr instead of stdout and strips ANSI when redirected or NO_COLOR is set", () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => {
        return true;
      });
    const redirectedStderr = _createStream(false);
    const ttyStderr = _createStream(true);

    Acclimate.log(
      "|bright_cyan|Analyzing $target$...|reset|",
      { target: "src/" },
      { stream: redirectedStderr },
    );
    expect(redirectedStderr.getOutput()).toBe("Analyzing src/...\n");
    expect(redirectedStderr.getOutput()).not.toContain("\x1b[");

    Acclimate.log(
      "|bright_green|Done $count$|reset|",
      { count: 3 },
      { stream: ttyStderr, env: {} },
    );
    expect(ttyStderr.getOutput()).toBe("\x1b[92mDone 3\x1b[0m\n");

    const noColorStderr = _createStream(true);
    Acclimate.log(
      "|yellow|Warning|reset|",
      {},
      { stream: noColorStderr, env: { NO_COLOR: "1" } },
    );
    expect(noColorStderr.getOutput()).toBe("Warning\n");
    expect(stdoutSpy).not.toHaveBeenCalled();

    stdoutSpy.mockRestore();
  });

  it("writes clean data and JSON exclusively to stdout via writeData and writeJson", () => {
    const stdout = _createStream(false);
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => {
        return true;
      });

    Acclimate.writeData("path/to/file.ts", { stream: stdout });
    expect(stdout.getOutput()).toBe("path/to/file.ts\n");

    const jsonStdout = _createStream(false);
    Acclimate.writeJson({ ok: true, count: 2 }, { stream: jsonStdout });
    expect(JSON.parse(jsonStdout.getOutput())).toEqual({ ok: true, count: 2 });

    const prettyStdout = _createStream(false);
    Acclimate.writeJson({ ok: true }, { stream: prettyStdout, pretty: true });
    expect(prettyStdout.getOutput()).toBe('{\n  "ok": true\n}\n');
    expect(stderrSpy).not.toHaveBeenCalled();

    stderrSpy.mockRestore();
  });

  it("returns the selected item when Acclimate.requestChoice runs over an injected TerminalSession", async () => {
    const input = Object.assign(new PassThrough(), {
      isTTY: true,
      isRaw: false,
      setRawMode: (mode: boolean) => {
        input.isRaw = mode;
      },
    });
    const output = _createStream(true);
    const session: TerminalSession = {
      input,
      output,
      isColorEnabled: true,
      isRawModeSupported: true,
      close: async () => {},
    };

    const choicePromise = Acclimate.requestChoice({
      message: "Select mode",
      choices: [
        { value: "fast", label: "Fast" },
        { value: "strict", label: "Strict" },
      ],
      terminal: session,
    });

    input.write("j\r");
    await expect(choicePromise).resolves.toBe("strict");
  });
});
