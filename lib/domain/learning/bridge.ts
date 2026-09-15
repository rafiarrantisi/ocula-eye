export interface BridgeReview {
  status: string;
  scope: string;
}

export interface BridgeRule {
  id: string;
  version: string;
  triggerConceptIds: string[];
  caseFindingIds: string[];
  mechanismIds: string[];
  structureIds: string[];
  scenarioId: string;
  approvedExplanationKey: string;
  followupPoolIds: string[];
  review: BridgeReview;
}

export interface BridgeMatchInput {
  conceptIds: string[];
  caseFindingIds: string[];
}

export function matchBridgeRule(rules: BridgeRule[], input: BridgeMatchInput): BridgeRule[] {
  if (input.conceptIds.length === 0 || input.caseFindingIds.length === 0) {
    return [];
  }
  const concepts = new Set(input.conceptIds);
  const findings = new Set(input.caseFindingIds);
  return rules.filter((rule) => {
    if (rule.triggerConceptIds.length === 0 || rule.caseFindingIds.length === 0) {
      return false;
    }
    const conceptHit = rule.triggerConceptIds.some((id) => concepts.has(id));
    if (!conceptHit) {
      return false;
    }
    return rule.caseFindingIds.some((id) => findings.has(id));
  });
}
