/**
 * Negotiation Scripts (from Career Ops)
 * Generates salary negotiation scripts and counter-offer strategies.
 */

import { createConfiguredLlmService, resolveLlmModel } from "./modelSelection";
import type { JsonSchemaDefinition } from "./llm/types";


const NEGOTIATION_SCHEMA: JsonSchemaDefinition = {
  name: "negotiation_scripts",
  schema: {
    type: "object",
    properties: {
      openingScript: { type: "string" },
      counterOfferScript: { type: "string" },
      geographicDiscountPushback: { type: "string" },
      benefitsNegotiation: { type: "string" },
      competingOfferLeverage: { type: "string" },
      timeline: { type: "string" },
    },
    required: ["openingScript", "counterOfferScript", "timeline"],
    additionalProperties: false,
  },
};

export interface NegotiationInput {
  jobTitle: string;
  employer: string;
  currentSalary?: string;
  offerSalary?: string;
  location: string;
  benefits?: string;
  competingOffers?: string;
  tone?: "assertive" | "collaborative" | "cautious";
}

export interface NegotiationResult {
  openingScript: string;
  counterOfferScript: string;
  geographicDiscountPushback?: string;
  benefitsNegotiation?: string;
  competingOfferLeverage?: string;
  timeline: string;
}

export async function generateNegotiationScripts(
  input: NegotiationInput,
): Promise<NegotiationResult> {
  const model = await resolveLlmModel("default");
  const prompt = buildNegotiationPrompt(input);
  const llm = await createConfiguredLlmService("default");

  const result = await llm.callJson<{
    openingScript: string;
    counterOfferScript: string;
    geographicDiscountPushback?: string;
    benefitsNegotiation?: string;
    competingOfferLeverage?: string;
    timeline: string;
  }>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: NEGOTIATION_SCHEMA,
    maxRetries: 1,
  });

  if (!result.success) {
    throw new Error(`Negotiation script generation failed: ${result.error}`);
  }

  return {
    openingScript: result.data.openingScript,
    counterOfferScript: result.data.counterOfferScript,
    geographicDiscountPushback: result.data.geographicDiscountPushback,
    benefitsNegotiation: result.data.benefitsNegotiation,
    competingOfferLeverage: result.data.competingOfferLeverage,
    timeline: result.data.timeline,
  };
}

function buildNegotiationPrompt(input: NegotiationInput): string {
  return `Generate salary negotiation scripts for this offer.

**ROLE**: ${input.jobTitle} at ${input.employer}
**LOCATION**: ${input.location}
${input.currentSalary ? `**CURRENT SALARY**: ${input.currentSalary}` : ""}
${input.offerSalary ? `**OFFERED SALARY**: ${input.offerSalary}` : ""}
${input.benefits ? `**BENEFITS**: ${input.benefits}` : ""}
${input.competingOffers ? `**COMPETING OFFERS**: ${input.competingOffers}` : ""}
**TONE**: ${input.tone || "collaborative"}

Generate:
1. **openingScript** — How to open the negotiation conversation (email or call)
2. **counterOfferScript** — Specific counter-offer language with justification
3. **geographicDiscountPushback** — If they're using location to justify lower pay
4. **benefitsNegotiation** — How to negotiate equity, remote, PTO, etc.
5. **competingOfferLeverage** — How to mention competing offers without burning bridges
6. **timeline** — Suggested timeline for the negotiation process

Return as JSON.`;
}
