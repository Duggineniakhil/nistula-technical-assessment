/**
 * Claude AI Service
 *
 * Sends the normalised guest message + property context to the Anthropic
 * Claude API and returns a drafted reply.
 */

const Anthropic = require("@anthropic-ai/sdk");
const { getPropertyContext } = require("../config/propertyContext");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * System prompt that instructs Claude on how to behave as a Nistula
 * hospitality assistant.  Key design choices:
 *
 * - We include the query type so Claude can tailor the tone.
 * - We tell it to be warm but concise — guests on WhatsApp don't want
 *   long paragraphs.
 * - We forbid inventing information not present in the context.
 * - We ask it to address the guest by first name for a personal touch.
 */
const SYSTEM_PROMPT = `You are Nistula's AI guest messaging assistant. You help guests of premium holiday villas in Goa, India.

RULES:
1. Be warm, professional, and concise. Keep replies under 100 words.
2. Address the guest by their first name.
3. ONLY use information from the PROPERTY CONTEXT provided. Never invent rates, amenities, or policies.
4. If you lack sufficient information, admit it and note a team member will follow up.
5. For complaints, acknowledge with empathy, apologise, and assure the team has been notified. Do NOT promise refunds.
6. Format prices in INR with commas (e.g., INR 18,000).
7. Do NOT use markdown formatting — replies go straight to WhatsApp.
8. Use short paragraphs and bullet points (starting with •) for lists.
9. End with a helpful closing line, e.g., "Let me know if you need anything else!"`;

/**
 * Builds the user prompt with all the context Claude needs.
 */
function buildUserPrompt(normalizedMessage) {
  const propertyContext = getPropertyContext(
    normalizedMessage.property_id || "unknown"
  );

  return `
${propertyContext}

────────────────────────────────
INBOUND MESSAGE
────────────────────────────────
Source       : ${normalizedMessage.source}
Guest        : ${normalizedMessage.guest_name}
Booking ref  : ${normalizedMessage.booking_ref || "N/A"}
Query type   : ${normalizedMessage.query_type}
Timestamp    : ${normalizedMessage.timestamp}

Message:
"${normalizedMessage.message_text}"

Draft a reply to this guest message following your rules.`.trim();
}

/**
 * Calls the Claude API to draft a reply.
 *
 * @param {Object} normalizedMessage – The unified schema message object.
 * @returns {Promise<string>} The drafted reply text.
 */
async function draftReply(normalizedMessage) {
  const userPrompt = buildUserPrompt(normalizedMessage);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Extract the text content from the response
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock) {
    throw new Error("Claude returned no text content in the response.");
  }

  return textBlock.text.trim();
}

module.exports = { draftReply };
