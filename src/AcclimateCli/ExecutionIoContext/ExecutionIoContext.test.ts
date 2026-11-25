import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createTheme } from "@/theme/createTheme/createTheme";
import { ExecutionIoContext } from "./ExecutionIoContext";

describe("ExecutionIoContext", () => {
  it("isolates injected IO stores across concurrent async executions and returns undefined outside a run", async () => {
    expect(ExecutionIoContext.get()).toBeUndefined();

    const makeStore = (tag: string) => {
      return {
        stdin: new PassThrough(),
        stdout: {
          write: () => {
            return true;
          },
        },
        stderr: {
          write: () => {
            return true;
          },
        },
        env: { RUN_TAG: tag },
        stdoutTheme: createTheme({ color: false }),
        stderrTheme: createTheme({ color: false }),
      };
    };

    const [firstTag, secondTag] = await Promise.all([
      ExecutionIoContext.run(makeStore("first"), async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 15);
        });
        return ExecutionIoContext.get()?.env.RUN_TAG;
      }),
      ExecutionIoContext.run(makeStore("second"), async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 5);
        });
        return ExecutionIoContext.get()?.env.RUN_TAG;
      }),
    ]);

    expect(firstTag).toBe("first");
    expect(secondTag).toBe("second");
    expect(ExecutionIoContext.get()).toBeUndefined();
  });
});
