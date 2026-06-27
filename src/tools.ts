import { z } from "zod";
import type { createSecondBrain } from "./secondBrain.js";
import type { AuditDecision, BrainStatus } from "./types.js";

type SecondBrain = ReturnType<typeof createSecondBrain>;

const inputSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string().min(1)).optional(),
  sourceIds: z.array(z.string().min(1)).optional()
});

const searchSchema = z.object({
  query: z.string().optional(),
  status: z.enum(["approved", "pending_audit", "rejected", "archived"]).optional(),
  limit: z.number().int().positive().max(100).optional()
});

const auditListSchema = z.object({
  status: z.enum(["approved", "pending_audit", "rejected", "archived"]).optional()
});

const auditUpdateSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  comment: z.string().optional()
});

const purgeSchema = z.object({
  retentionDays: z.number().int().min(0).optional()
});

export const toolSchemas = {
  inputSchema,
  searchSchema,
  auditListSchema,
  auditUpdateSchema,
  purgeSchema
};

export function createToolHandlers(brain: SecondBrain) {
  return {
    raw_input: async (args: z.infer<typeof inputSchema>) => ({ item: await brain.rawInput(inputSchema.parse(args)) }),
    raw_search: async (args: z.infer<typeof searchSchema>) => ({ items: await brain.rawSearch(searchSchema.parse(args)) }),
    wiki_input: async (args: z.infer<typeof inputSchema>) => ({ item: await brain.wikiInput(inputSchema.parse(args)) }),
    wiki_search: async (args: z.infer<typeof searchSchema>) => ({ items: await brain.wikiSearch(searchSchema.parse(args)) }),
    outputs_input: async (args: z.infer<typeof inputSchema>) => ({ item: await brain.outputsInput(inputSchema.parse(args)) }),
    outputs_search: async (args: z.infer<typeof searchSchema>) => ({ items: await brain.outputsSearch(searchSchema.parse(args)) }),
    audit_list: async (args: z.infer<typeof auditListSchema>) => ({
      items: await brain.auditList(auditListSchema.parse(args) as { status?: BrainStatus })
    }),
    audit_update: async (args: z.infer<typeof auditUpdateSchema>) => {
      const parsed = auditUpdateSchema.parse(args);
      return {
        item: await brain.auditUpdate({
          ...parsed,
          decision: parsed.decision as AuditDecision
        })
      };
    },
    purge_rejected: async (args: z.infer<typeof purgeSchema>) => {
      const parsed = purgeSchema.parse(args);
      return { purgedIds: await brain.purgeRejected({ retentionDays: parsed.retentionDays }) };
    }
  };
}

export type ToolHandlers = ReturnType<typeof createToolHandlers>;
