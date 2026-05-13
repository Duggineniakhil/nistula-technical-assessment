/**
 * Query Classifier
 *
 * Uses keyword / pattern matching to assign each guest message to one of
 * six predefined query types.  This classification runs *before* the
 * Claude call so we can:
 *   1. Include the category in the AI prompt (better replies).
 *   2. Store it in the database without waiting for AI.
 *   3. Apply category-specific business rules (e.g. escalate complaints).
 *
 * Design decision — why not use Claude for classification?
 * Using Claude would add latency and cost for every message. Keyword-based
 * classification is instant, deterministic, and covers the six required
 * categories well enough.  Claude still sees the category and can refine
 * it in its response if needed.
 */

/**
 * Each rule has a list of patterns (tested case-insensitively) and the
 * query type it maps to.  Rules are evaluated in priority order — the
 * first match wins.  Complaint is checked first because an angry message
 * about pricing should still be treated as a complaint.
 */
const CLASSIFICATION_RULES = [
  {
    type: "complaint",
    patterns: [
      /\b(not (working|happy|satisfied|acceptable)|complain|unacceptable|terrible|awful|horrible|worst|refund|disgusting|disappointed|broken|damaged|dirty|filthy|ruined|problem|issue with|angry|furious)\b/i,
    ],
  },
  {
    type: "special_request",
    patterns: [
      /\b(early check.?in|late check.?out|airport (transfer|pickup|drop)|extra bed|baby cot|crib|birthday|anniversary|decoration|surprise|special (request|arrangement|occasion)|cake|flowers|candles|arrange|organize)\b/i,
    ],
  },
  {
    type: "post_sales_checkin",
    patterns: [
      /\b(check.?in (time|process|procedure)|check.?out (time|process)|wifi|wi-fi|password|key (collection|pickup)|directions|how (to|do) (reach|get|find)|address|location map|caretaker|towels?|amenities|house rules|parking spot)\b/i,
    ],
  },
  {
    type: "pre_sales_pricing",
    patterns: [
      /\b(rate|price|pricing|cost|charge|how much|tariff|per night|total.*(stay|cost|amount)|budget|discount|offer|deal|package|quote|cheapest|expensive)\b/i,
    ],
  },
  {
    type: "pre_sales_availability",
    patterns: [
      /\b(available|availability|vacant|free (on|from|for|dates?)|open (on|from|dates?)|book(ing)?|reserve|reservation|dates?.*available|can (we|i) (stay|come|visit|book))\b/i,
    ],
  },
  {
    type: "general_enquiry",
    patterns: [
      /\b(pet|pets|dog|cat|animal|parking|pool|gym|breakfast|food|restaurant|nearby|around|market|beach|distance|how far|facilities|amenities|children|kids|infant|age limit|wheelchair|accessible|smoking|allowed|permit|policy)\b/i,
    ],
  },
];

/**
 * Classifies a guest message into a query type.
 *
 * @param {string} message – The raw guest message text.
 * @returns {string} One of the six defined query types.
 */
function classifyQuery(message) {
  if (!message || typeof message !== "string") return "general_enquiry";

  for (const rule of CLASSIFICATION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(message)) {
        return rule.type;
      }
    }
  }

  // Default: if nothing matched, treat it as a general enquiry.
  return "general_enquiry";
}

module.exports = { classifyQuery, CLASSIFICATION_RULES };
