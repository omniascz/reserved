// DTOs re-exportované z @reserved/rules-engine s NestJS-friendly aliasy.
// Pro Zod validaci v controlleru.

import { RuleInputSchema, type RuleInput } from '@reserved/rules-engine';

export const CreateRuleSchema = RuleInputSchema;
export type CreateRuleDto = RuleInput;

export const UpdateRuleSchema = RuleInputSchema.partial();
export type UpdateRuleDto = Partial<RuleInput>;
