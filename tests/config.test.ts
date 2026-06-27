import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSecondBrainOptions } from "../src/config.js";

describe("configuration", () => {
  it("loads the root and rejected retention from environment variables", () => {
    const options = loadSecondBrainOptions(
      {
        SECOND_BRAIN_ROOT: "brain",
        SECOND_BRAIN_REJECTED_RETENTION_DAYS: "12"
      },
      tmpdir()
    );

    expect(options).toEqual({
      root: resolve("brain"),
      rejectedRetentionDays: 12
    });
  });

  it("falls back to .second-brain/config.json when env root is absent", async () => {
    const cwd = join(tmpdir(), `second-brain-config-${Date.now()}`);
    await mkdir(join(cwd, ".second-brain"), { recursive: true });
    await writeFile(
      join(cwd, ".second-brain", "config.json"),
      JSON.stringify({ root: join(cwd, "vault"), rejectedRetentionDays: 5 }),
      "utf8"
    );

    expect(loadSecondBrainOptions({}, cwd)).toEqual({
      root: join(cwd, "vault"),
      rejectedRetentionDays: 5
    });
  });

  it("requires a root and validates retention days", () => {
    expect(() => loadSecondBrainOptions({}, tmpdir())).toThrow("SECOND_BRAIN_ROOT");
    expect(() =>
      loadSecondBrainOptions(
        {
          SECOND_BRAIN_ROOT: "brain",
          SECOND_BRAIN_REJECTED_RETENTION_DAYS: "-1"
        },
        tmpdir()
      )
    ).toThrow("non-negative integer");
  });
});
