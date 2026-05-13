/**
 * Confidence Scorer
 *
 * Calculates a confidence score (0 – 1) for an AI-drafted reply and
 * determines the appropriate action (auto_send / agent_review / escalate).
 *
 * ───────────────────────────────────────────────────────────────────
 * SCORING LOGIC (explained in README as well)
 * ───────────────────────────────────────────────────────────────────
 *
 * The score starts at a base value and is adjusted by several heuristics:
 *
 * 1. QUERY TYPE BASE SCORE  (0.60 – 0.95)
 *    Some query types have well-defined answers (e.g. check-in info,
 *    pricing) and deserve a higher base.  Complaints always start low
 *    because they need human empathy and authority to resolve.
 *
 * 2. PROPERTY CONTEXT BONUS  (+0.05)
 *    If we have the property on file we can trust the reply more.
 *
 * 3. BOOKING REFERENCE BONUS  (+0.03)
 *    A known booking ref means we're not guessing about the guest.
 *
 * 4. REPLY LENGTH PENALTY  (−0.05)
 *    Very short replies (<50 chars) are suspicious — the model may
 *    have refused or given a non-answer.
 *
 * 5. UNCERTAINTY LANGUAGE PENALTY  (−0.10)
 *    If the drafted reply contains hedging language ("I'm not sure",
 *    "you may want to check"), we reduce confidence.
 *
 * 6. COMPLAINT CEILING  (max 0.55)
 *    Complaints are always capped below the escalation threshold so
 *    they are never auto-sent — a human must review them.
 *
 * Final score is clamped to [0, 1].
 */

const QUERY_TYPE_BASE_SCORES = {
  post_sales_checkin: 0.92,     // Answers are factual and templated
  pre_sales_pricing: 0.88,      // Rate info is concrete
  pre_sales_availability: 0.87, // Availability is a yes/no with details
  general_enquiry: 0.80,        // Broad but usually answerable
  special_request: 0.72,        // Often needs human coordination
  complaint: 0.40,              // Must be handled by a person
};

const UNCERTAINTY_PHRASES = [
  "i'm not sure",
  "i am not sure",
  "you may want to check",
  "please verify",
  "i don't have that information",
  "i cannot confirm",
  "unfortunately, i don't know",
  "it might be",
  "i think",
  "not certain",
  "i'd recommend contacting",
  "please contact",
];

/**
 * @param {Object}  params
 * @param {string}  params.queryType    – Classified query type
 * @param {string}  params.draftedReply – The Claude-generated reply
 * @param {string}  params.propertyId   – Property ID (may be null)
 * @param {string}  params.bookingRef   – Booking reference (may be null)
 * @param {boolean} params.propertyKnown – Do we have context for this property?
 *
 * @returns {{ confidence_score: number, action: string, scoring_breakdown: Object }}
 */
function calculateConfidence({
  queryType,
  draftedReply,
  propertyId,
  bookingRef,
  propertyKnown,
}) {
  const breakdown = {};

  // 1. Base score from query type
  let score = QUERY_TYPE_BASE_SCORES[queryType] ?? 0.75;
  breakdown.base = score;

  // 2. Property context bonus
  if (propertyKnown && propertyId) {
    score += 0.05;
    breakdown.property_context_bonus = 0.05;
  }

  // 3. Booking reference bonus
  if (bookingRef) {
    score += 0.03;
    breakdown.booking_ref_bonus = 0.03;
  }

  // 4. Reply length penalty
  if (draftedReply && draftedReply.length < 50) {
    score -= 0.05;
    breakdown.short_reply_penalty = -0.05;
  }

  // 5. Uncertainty language penalty
  const replyLower = (draftedReply || "").toLowerCase();
  const hasUncertainty = UNCERTAINTY_PHRASES.some((phrase) =>
    replyLower.includes(phrase)
  );
  if (hasUncertainty) {
    score -= 0.10;
    breakdown.uncertainty_penalty = -0.10;
  }

  // 6. Complaint ceiling
  if (queryType === "complaint") {
    score = Math.min(score, 0.55);
    breakdown.complaint_ceiling_applied = true;
  }

  // Clamp to [0, 1]
  score = Math.max(0, Math.min(1, score));
  score = parseFloat(score.toFixed(2));

  // Determine action
  let action;
  if (queryType === "complaint" || score < 0.60) {
    action = "escalate";
  } else if (score < 0.85) {
    action = "agent_review";
  } else {
    action = "auto_send";
  }

  return { confidence_score: score, action, scoring_breakdown: breakdown };
}

module.exports = { calculateConfidence };
