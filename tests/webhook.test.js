/**
 * Test Suite for the Webhook Endpoint
 *
 * Runs 6 test scenarios against the normaliser, classifier, and confidence
 * scorer without making actual HTTP or Claude API calls.  This lets us
 * validate the pipeline logic quickly during development.
 *
 * Usage:  npm test   (or)   node tests/webhook.test.js
 */

const { normalizeMessage } = require("../src/services/normalizer");
const { classifyQuery } = require("../src/services/classifier");
const { calculateConfidence } = require("../src/utils/confidence");

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}`);
    failed++;
  }
}

// ────────────────────────────────────────────────────────────────────
// TEST 1: Normalisation — standard WhatsApp message
// ────────────────────────────────────────────────────────────────────
console.log("\n── Test 1: Normalise WhatsApp message ──");
{
  const result = normalizeMessage({
    source: "whatsapp",
    guest_name: "Rahul Sharma",
    message: "Is the villa available from April 20 to 24? What is the rate for 2 adults?",
    timestamp: "2026-05-05T10:30:00Z",
    booking_ref: "NIS-2024-0891",
    property_id: "villa-b1",
  });

  assert(result.success === true, "Normalisation succeeds");
  assert(result.data.source === "whatsapp", "Source preserved");
  assert(result.data.guest_name === "Rahul Sharma", "Guest name preserved");
  assert(result.data.message_id !== undefined, "UUID generated");
  assert(result.data.booking_ref === "NIS-2024-0891", "Booking ref preserved");
  assert(
    ["pre_sales_availability", "pre_sales_pricing"].includes(result.data.query_type),
    "Query type is availability or pricing"
  );
}

// ────────────────────────────────────────────────────────────────────
// TEST 2: Normalisation — missing required fields
// ────────────────────────────────────────────────────────────────────
console.log("\n── Test 2: Reject missing message ──");
{
  const result = normalizeMessage({
    source: "whatsapp",
    guest_name: "Test Guest",
  });
  assert(result.success === false, "Fails without message");
  assert(result.error.includes("Message text"), "Error mentions message");
}

// ────────────────────────────────────────────────────────────────────
// TEST 3: Normalisation — invalid source
// ────────────────────────────────────────────────────────────────────
console.log("\n── Test 3: Reject invalid source ──");
{
  const result = normalizeMessage({
    source: "telegram",
    guest_name: "Test",
    message: "Hello",
  });
  assert(result.success === false, "Fails with invalid source");
  assert(result.error.includes("Invalid source"), "Error mentions source");
}

// ────────────────────────────────────────────────────────────────────
// TEST 4: Classifier — all six categories
// ────────────────────────────────────────────────────────────────────
console.log("\n── Test 4: Query classification ──");
{
  assert(
    classifyQuery("Is the villa available from April 20 to 24?") === "pre_sales_availability",
    "Availability query"
  );
  assert(
    classifyQuery("What is the rate for 2 adults for 3 nights?") === "pre_sales_pricing",
    "Pricing query"
  );
  assert(
    classifyQuery("What time can we check in? WiFi password?") === "post_sales_checkin",
    "Check-in query"
  );
  assert(
    classifyQuery("Can we arrange early check-in and airport transfer?") === "special_request",
    "Special request"
  );
  assert(
    classifyQuery("The AC is not working. I am not happy with the service.") === "complaint",
    "Complaint"
  );
  assert(
    classifyQuery("Do you allow pets? Is there parking?") === "general_enquiry",
    "General enquiry"
  );
}

// ────────────────────────────────────────────────────────────────────
// TEST 5: Confidence scoring — high confidence auto-send
// ────────────────────────────────────────────────────────────────────
console.log("\n── Test 5: Confidence scoring — auto_send ──");
{
  const result = calculateConfidence({
    queryType: "post_sales_checkin",
    draftedReply: "Hi Rahul! Check-in is at 2 PM. The WiFi password is Nistula@2024. Let me know if you need anything else!",
    propertyId: "villa-b1",
    bookingRef: "NIS-2024-0891",
    propertyKnown: true,
  });
  assert(result.confidence_score >= 0.85, `Score ${result.confidence_score} >= 0.85`);
  assert(result.action === "auto_send", "Action is auto_send");
}

// ────────────────────────────────────────────────────────────────────
// TEST 6: Confidence scoring — complaint always escalates
// ────────────────────────────────────────────────────────────────────
console.log("\n── Test 6: Confidence scoring — complaint escalates ──");
{
  const result = calculateConfidence({
    queryType: "complaint",
    draftedReply: "I'm so sorry to hear about the AC issue. Our team has been notified and will address this immediately.",
    propertyId: "villa-b1",
    bookingRef: "NIS-2024-0891",
    propertyKnown: true,
  });
  assert(result.confidence_score <= 0.55, `Score ${result.confidence_score} <= 0.55`);
  assert(result.action === "escalate", "Complaint always escalates");
}

// ────────────────────────────────────────────────────────────────────
// TEST 7: Normalisation — field aliases (Booking.com style)
// ────────────────────────────────────────────────────────────────────
console.log("\n── Test 7: Field alias resolution ──");
{
  const result = normalizeMessage({
    source: "booking_com",
    sender_name: "Maria Chen",
    guest_message: "Is there parking available?",
    reservation_id: "BK-12345",
    listing_id: "villa-b1",
  });
  assert(result.success === true, "Normalises with aliased fields");
  assert(result.data.guest_name === "Maria Chen", "Alias sender_name → guest_name");
  assert(result.data.message_text === "Is there parking available?", "Alias guest_message → message_text");
  assert(result.data.booking_ref === "BK-12345", "Alias reservation_id → booking_ref");
}

// ────────────────────────────────────────────────────────────────────
console.log(`\n════════════════════════════════════════`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`════════════════════════════════════════\n`);

process.exit(failed > 0 ? 1 : 0);
