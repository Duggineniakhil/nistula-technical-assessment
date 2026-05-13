/**
 * Message Normalizer
 *
 * Transforms raw webhook payloads from different channels into a single
 * unified schema.  Each channel may send data in slightly different shapes;
 * the normalizer smooths those differences so downstream code never has to
 * care about the source.
 */

const { v4: uuidv4 } = require("uuid");
const { classifyQuery } = require("./classifier");

/** Channels we accept. Anything else is rejected at the route level. */
const VALID_SOURCES = [
  "whatsapp",
  "booking_com",
  "airbnb",
  "instagram",
  "direct",
];

/**
 * Channel-specific field mappings.
 *
 * Different platforms may use different field names for the same concept.
 * For example, Booking.com might use `guest_message` instead of `message`,
 * and Airbnb might nest the message in `thread.text`.
 *
 * This map lets us support those variations without scattering conditionals
 * throughout the codebase.
 */
const FIELD_ALIASES = {
  // Common alternative names for the message body
  message: ["message", "guest_message", "text", "body", "content"],
  // Common alternative names for the guest name
  guest_name: ["guest_name", "name", "sender_name", "from_name"],
  // Common alternative names for booking reference
  booking_ref: [
    "booking_ref",
    "reservation_id",
    "confirmation_code",
    "booking_id",
  ],
  // Common alternative names for property id
  property_id: ["property_id", "listing_id", "property_code"],
};

/**
 * Resolves a field value by checking the payload for any known alias.
 * Returns the first match or undefined.
 */
function resolveField(payload, fieldName) {
  const aliases = FIELD_ALIASES[fieldName] || [fieldName];
  for (const alias of aliases) {
    if (payload[alias] !== undefined) return payload[alias];
  }
  return undefined;
}

/**
 * Normalises a raw webhook payload into the unified message schema.
 *
 * @param {Object} payload – The raw request body from the webhook.
 * @returns {{ success: boolean, data?: Object, error?: string }}
 */
function normalizeMessage(payload) {
  // ── Validate source ──────────────────────────────────────────────
  const source = (payload.source || "").toLowerCase().trim();
  if (!VALID_SOURCES.includes(source)) {
    return {
      success: false,
      error: `Invalid source "${payload.source}". Accepted: ${VALID_SOURCES.join(", ")}`,
    };
  }

  // ── Resolve fields with aliases ──────────────────────────────────
  const messageText = resolveField(payload, "message");
  const guestName = resolveField(payload, "guest_name");
  const bookingRef = resolveField(payload, "booking_ref");
  const propertyId = resolveField(payload, "property_id");

  // ── Required field validation ────────────────────────────────────
  if (!messageText || typeof messageText !== "string" || !messageText.trim()) {
    return { success: false, error: "Message text is required and must be a non-empty string." };
  }

  if (!guestName || typeof guestName !== "string" || !guestName.trim()) {
    return { success: false, error: "Guest name is required and must be a non-empty string." };
  }

  // ── Timestamp handling ───────────────────────────────────────────
  let timestamp = payload.timestamp;
  if (!timestamp) {
    timestamp = new Date().toISOString();
  } else {
    // Validate the provided timestamp is parseable
    const parsed = new Date(timestamp);
    if (isNaN(parsed.getTime())) {
      return { success: false, error: `Invalid timestamp: "${timestamp}"` };
    }
    timestamp = parsed.toISOString();
  }

  // ── Classify the query ───────────────────────────────────────────
  const queryType = classifyQuery(messageText);

  // ── Build unified schema ─────────────────────────────────────────
  const normalized = {
    message_id: uuidv4(),
    source,
    guest_name: guestName.trim(),
    message_text: messageText.trim(),
    timestamp,
    booking_ref: bookingRef || null,
    property_id: propertyId || null,
    query_type: queryType,
  };

  return { success: true, data: normalized };
}

module.exports = { normalizeMessage, VALID_SOURCES };
