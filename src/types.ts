export type BrainFolder = "raw" | "wiki" | "outputs";

export type BrainStatus = "approved" | "pending_audit" | "rejected" | "archived";

export type AuditDecision = "approve" | "reject";

export interface BrainItem {
  id: string;
  title: string;
  folder: BrainFolder;
  status: BrainStatus;
  path: string;
  tags: string[];
  sourceIds: string[];
  createdAt: string;
  updatedAt: string;
  auditedAt?: string;
  auditComment?: string;
}

export interface Manifest {
  version: 1;
  items: BrainItem[];
}

export interface SecondBrainOptions {
  root: string;
  rejectedRetentionDays: number;
}

export interface InputDocument {
  title: string;
  content: string;
  tags?: string[];
  sourceIds?: string[];
}

export interface SearchQuery {
  query?: string;
  status?: BrainStatus;
  limit?: number;
}

export interface AuditListQuery {
  status?: BrainStatus;
}

export interface AuditUpdateInput {
  id: string;
  decision: AuditDecision;
  comment?: string;
}
