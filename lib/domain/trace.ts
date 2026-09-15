export interface TraceStep {
  ruleId: string;
  inputs: Record<string, number | string | boolean>;
  output: Record<string, number | string | boolean>;
  claimIds: string[];
  explanationKey: string;
}
export interface InputError {
  field: string;
  code: string;
}
export type Evaluation<T> = { ok: true; state: T; trace: TraceStep[] } | { ok: false; errors: InputError[] };
