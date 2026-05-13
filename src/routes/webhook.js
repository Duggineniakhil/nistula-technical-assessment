/**
 * Webhook Route — POST /webhook/message
 *
 * This is the single entry point for all inbound guest messages.
 * It orchestrates the full pipeline:
 *   1. Validate & normalise the payload
 *   2. Send to Claude for a drafted reply
 *   3. Calculate confidence score
 *   4. Return the response
 */

const express = require("express");
const { normalizeMessage } = require("../services/normalizer");
const { draftReply } = require("../services/claude");
const { calculateConfidence } = require("../utils/confidence");
const { properties } = require("../config/propertyContext");

const router = express.Router();

router.post("/message", async (req, res) => {
  const startTime = Date.now();

  try {
    // ── Step 1: Normalise ────────────────────────────────────────
    const normalized = normalizeMessage(req.body);

    if (!normalized.success) {
      return res.status(400).json({
        error: "Validation failed",
        detail: normalized.error,
      });
    }

    const message = normalized.data;

    // ── Step 2: Draft reply via Claude ────────────────────────────
    let draftedReplyText;
    try {
      draftedReplyText = await draftReply(message);
    } catch (aiError) {
      console.error("[Claude API Error]", aiError.message);

      // Return a degraded response rather than a 500 — the message was
      // still normalised successfully and we can queue it for human review.
      return res.status(200).json({
        message_id: message.message_id,
        query_type: message.query_type,
        drafted_reply: null,
        confidence_score: 0,
        action: "escalate",
        error: "AI service temporarily unavailable. Message queued for agent review.",
        processing_time_ms: Date.now() - startTime,
      });
    }

    // ── Step 3: Score confidence ─────────────────────────────────
    const propertyKnown = !!(
      message.property_id && properties[message.property_id]
    );

    const { confidence_score, action, scoring_breakdown } =
      calculateConfidence({
        queryType: message.query_type,
        draftedReply: draftedReplyText,
        propertyId: message.property_id,
        bookingRef: message.booking_ref,
        propertyKnown,
      });

    // ── Step 4: Respond ──────────────────────────────────────────
    const response = {
      message_id: message.message_id,
      query_type: message.query_type,
      drafted_reply: draftedReplyText,
      confidence_score,
      action,
      // Extra metadata — helpful for debugging & audit
      metadata: {
        source: message.source,
        guest_name: message.guest_name,
        property_id: message.property_id,
        booking_ref: message.booking_ref,
        scoring_breakdown,
        processing_time_ms: Date.now() - startTime,
      },
    };

    console.log(
      `[${new Date().toISOString()}] ${message.source} | ${message.guest_name} | ${message.query_type} → ${action} (${confidence_score})`
    );

    return res.status(200).json(response);
  } catch (error) {
    console.error("[Webhook Error]", error);
    return res.status(500).json({
      error: "Internal server error",
      detail:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

module.exports = router;
