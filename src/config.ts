import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { SecondBrainOptions } from "./types.js";

const configSchema = z.object({
  root: z.string().min(1).optional(),
  rejectedRetentionDays: z.number().int().min(0).optional()
});

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("SECOND_BRAIN_REJECTED_RETENTION_DAYS must be a non-negative integer");
  }

  return parsed;
}

export function loadSecondBrainOptions(env = process.env, cwd = process.cwd()): SecondBrainOptions {
  const configPath = resolve(cwd, ".second-brain", "config.json");
  const fileConfig = existsSync(configPath)
    ? configSchema.parse(JSON.parse(readFileSync(configPath, "utf8")))
    : {};

  const root = env.SECOND_BRAIN_ROOT ?? fileConfig.root;
  if (!root) {
    throw new Error("SECOND_BRAIN_ROOT is required when .second-brain/config.json does not define root");
  }

  return {
    root: resolve(root),
    rejectedRetentionDays: numberFromEnv(
      env.SECOND_BRAIN_REJECTED_RETENTION_DAYS,
      fileConfig.rejectedRetentionDays ?? 30
    )
  };
}
