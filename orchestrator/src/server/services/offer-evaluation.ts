export type OfferEvaluationRecommendation =
  | "accept"
  | "negotiate"
  | "reject"
  | "hold";

export interface OfferEvaluationInput {
  jobTitle: string;
  employer: string;
  offeredSalary?: string | number | null;
  salaryTarget?: string | number | null;
  benefits?: string | null;
  deadline?: string | null;
  competingOffers?: string | null;
  dealBreakers?: readonly string[] | null;
}

export interface OfferEvaluationResult {
  score: number;
  recommendation: OfferEvaluationRecommendation;
  risks: string[];
  tradeoffs: string[];
  negotiationAngle: string;
}

export interface OfferEvaluationNote {
  title: string;
  content: string;
}

const DEFAULT_HOLD_RISK =
  "Not enough salary data is available to make a confident decision.";
const DEFAULT_HOLD_TRADEOFF =
  "Collect the offer details, salary target, and any hard constraints before deciding.";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function parseSalaryValue(
  value: string | number | null | undefined,
): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const text = String(value).trim().toLowerCase();
  if (!text) return null;

  const compact = text.replace(/\s+/g, " ").replace(/,/g, "");
  const rangeMatch = compact.match(
    /(\d+(?:\.\d+)?)\s*(k|m)?\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(k|m)?/,
  );
  if (rangeMatch) {
    return clampParsedAmount(
      (parseSalaryToken(rangeMatch[1], rangeMatch[2]) +
        parseSalaryToken(rangeMatch[3], rangeMatch[4])) /
        2,
    );
  }

  const singleMatch = compact.match(/(\d+(?:\.\d+)?)\s*(k|m)?/);
  if (!singleMatch) return null;

  return clampParsedAmount(parseSalaryToken(singleMatch[1], singleMatch[2]));
}

function parseSalaryToken(amount: string, suffix?: string): number {
  const numeric = Number.parseFloat(amount);
  if (!Number.isFinite(numeric)) return 0;
  if (suffix === "m") return numeric * 1_000_000;
  if (suffix === "k") return numeric * 1_000;
  return numeric;
}

function clampParsedAmount(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function formatSalaryValue(value: string | number | null | undefined): string {
  const parsed = parseSalaryValue(value);
  if (parsed == null) {
    const text = normalizeText(typeof value === "string" ? value : null);
    return text || "Not provided";
  }

  return parsed >= 1000
    ? `$${Math.round(parsed).toLocaleString("en-US")}`
    : String(Math.round(parsed));
}

function formatSalaryGap(value: number): string {
  const absolute = Math.abs(value);
  const formatted =
    absolute >= 1000
      ? `$${Math.round(absolute).toLocaleString("en-US")}`
      : String(Math.round(absolute));
  return value >= 0 ? `${formatted} above` : `${formatted} below`;
}

function cleanList(values: readonly string[] | null | undefined): string[] {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => normalizeText(value))
        .filter((value) => value.length > 0),
    ),
  );
}

function chooseRecommendation(score: number): OfferEvaluationRecommendation {
  if (score >= 85) return "accept";
  if (score >= 55) return "negotiate";
  if (score >= 35) return "hold";
  return "reject";
}

export function evaluateOffer(
  input: OfferEvaluationInput,
): OfferEvaluationResult {
  const salaryTarget = parseSalaryValue(input.salaryTarget);
  const offeredSalary = parseSalaryValue(input.offeredSalary);
  const dealBreakers = cleanList(input.dealBreakers);
  const benefits = normalizeText(input.benefits);
  const deadline = normalizeText(input.deadline);
  const competingOffers = normalizeText(input.competingOffers);

  if (salaryTarget == null || offeredSalary == null) {
    return {
      score: 45,
      recommendation: "hold",
      risks: [DEFAULT_HOLD_RISK],
      tradeoffs: [DEFAULT_HOLD_TRADEOFF],
      negotiationAngle:
        "Clarify the compensation target and the actual offer before deciding.",
    };
  }

  const gap = offeredSalary - salaryTarget;
  const gapRatio = salaryTarget === 0 ? 0 : gap / salaryTarget;

  let score: number;
  let recommendation: OfferEvaluationRecommendation;

  if (gapRatio >= 0.05) {
    score = 92;
    recommendation = "accept";
  } else if (gapRatio >= 0) {
    score = 86;
    recommendation = "accept";
  } else if (gapRatio >= -0.1) {
    score = 74;
    recommendation = "negotiate";
  } else if (gapRatio >= -0.2) {
    score = 60;
    recommendation = "negotiate";
  } else {
    score = 38;
    recommendation = "reject";
  }

  const risks: string[] = [];
  const tradeoffs: string[] = [];

  if (gap >= 0) {
    risks.push(
      `Compensation is ${formatSalaryGap(gap)} the target of ${formatSalaryValue(
        salaryTarget,
      )}.`,
    );
    tradeoffs.push(
      "Accepting now leaves little room to negotiate further upside.",
    );
  } else {
    risks.push(
      `Compensation is ${formatSalaryGap(gap)} the target of ${formatSalaryValue(
        salaryTarget,
      )}.`,
    );
    tradeoffs.push(
      "A counteroffer can improve cash, but it may extend the decision timeline.",
    );
  }

  if (dealBreakers.length > 0) {
    risks.push(`Deal-breakers to verify: ${dealBreakers.join(", ")}.`);
    tradeoffs.push(
      "If any deal-breaker is non-negotiable, the package may not be worth pursuing.",
    );
    score -= Math.min(12, dealBreakers.length * 4);
  }

  if (benefits) {
    tradeoffs.push(`Benefits mentioned: ${benefits}.`);
  }

  if (competingOffers) {
    risks.push(`Competing offer leverage is present: ${competingOffers}.`);
    tradeoffs.push(
      "Use competing offers carefully; they improve leverage but can slow the process.",
    );
    score += 2;
  }

  if (deadline) {
    risks.push(`Decision deadline: ${deadline}.`);
    score -= 1;
  }

  score = clampScore(score);
  recommendation = chooseRecommendation(score);

  const negotiationAngle = buildNegotiationAngle({
    recommendation,
    salaryTarget,
    offeredSalary,
    dealBreakers,
    competingOffers,
    benefits,
  });

  if (risks.length === 0) {
    risks.push("No major financial or timing risks were identified.");
  }

  if (tradeoffs.length === 0) {
    tradeoffs.push(
      "The main tradeoff is how much upside you need versus how quickly you want to decide.",
    );
  }

  return {
    score,
    recommendation,
    risks,
    tradeoffs,
    negotiationAngle,
  };
}

export function buildOfferEvaluationNote(
  input: OfferEvaluationInput,
  result: OfferEvaluationResult,
  options?: { title?: string; summary?: string },
): OfferEvaluationNote {
  const title = options?.title ?? `Offer evaluation — ${input.employer}`;
  const summary = options?.summary?.trim();

  const lines = [
    "# Offer evaluation",
    "",
    `**Role:** ${input.jobTitle} at ${input.employer}`,
    `**Score:** ${result.score}/100`,
    `**Recommendation:** ${result.recommendation}`,
    `**Offer salary:** ${formatSalaryValue(input.offeredSalary)}`,
    `**Target salary:** ${formatSalaryValue(input.salaryTarget)}`,
  ];

  if (normalizeText(input.benefits)) {
    lines.push(`**Benefits:** ${normalizeText(input.benefits)}`);
  }
  if (normalizeText(input.deadline)) {
    lines.push(`**Deadline:** ${normalizeText(input.deadline)}`);
  }
  if (normalizeText(input.competingOffers)) {
    lines.push(`**Competing offers:** ${normalizeText(input.competingOffers)}`);
  }
  if (summary) {
    lines.push(`**Summary:** ${summary}`);
  }

  lines.push(
    "",
    "## Risks",
    ...result.risks.map((risk) => `- ${risk}`),
    "",
    "## Tradeoffs",
    ...result.tradeoffs.map((tradeoff) => `- ${tradeoff}`),
    "",
    "## Negotiation angle",
    result.negotiationAngle,
  );

  return {
    title,
    content: lines.join("\n"),
  };
}

function buildNegotiationAngle(input: {
  recommendation: OfferEvaluationRecommendation;
  salaryTarget: number;
  offeredSalary: number;
  dealBreakers: readonly string[];
  competingOffers: string;
  benefits: string;
}): string {
  const target = formatSalaryValue(input.salaryTarget);
  const offer = formatSalaryValue(input.offeredSalary);

  if (input.recommendation === "accept") {
    return `The offer is at or above target (${offer} vs ${target}), so accept unless a deal-breaker still needs clarification.`;
  }

  if (input.recommendation === "negotiate") {
    const leverage = input.competingOffers
      ? `Use the competing offer (${input.competingOffers}) as leverage.`
      : "Anchor the ask around your target compensation.";
    const breakerNote =
      input.dealBreakers.length > 0
        ? ` Keep the deal-breakers (${input.dealBreakers.join(", ")}) explicit in the conversation.`
        : "";
    const benefitsNote = input.benefits
      ? ` Call out benefits (${input.benefits}) when framing total compensation.`
      : "";
    return `Negotiate from the current offer: ${leverage}${benefitsNote}${breakerNote}`;
  }

  if (input.recommendation === "reject") {
    return `The package is far below target (${offer} vs ${target}), so decline unless they can materially improve the cash offer or remove key deal-breakers.`;
  }

  return "Clarify the missing compensation details before deciding, then revisit once the offer is fully documented.";
}
