# Nistula Technical Assessment — Guest Message Handler

A backend service that receives guest messages from multiple hospitality channels, normalises them into a unified schema, drafts AI-powered replies using Claude, and returns confidence-scored responses with recommended actions.

## Architecture

```
POST /webhook/message
        │
        ▼
┌───────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│    Normalizer     │────▶│    Classifier    │────▶│   Claude API     │
│  validate payload │     │ keyword rules →  │     │  draft reply     │
│  resolve aliases  │     │ query_type       │     │  with property   │
│  unified schema   │     │                  │     │  context         │
└───────────────────┘     └──────────────────┘     └──────────────────┘
                                                           │
                                                           ▼
                                                   ┌──────────────────┐
                                                   │  Confidence      │
                                                   │  Scorer          │
                                                   │  → auto_send     │
                                                   │  → agent_review  │
                                                   │  → escalate      │
                                                   └──────────────────┘
```

## Setup

### Prerequisites

- Node.js v18+
- An Anthropic API key

### Installation

```bash
git clone https://github.com/<Duggineniakhil>/nistula-technical-assessment.git
cd nistula-technical-assessment
npm install
```

### Configuration

Create a `.env` file from the template:

```bash
cp .env.example .env
```

Edit `.env` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
PORT=3000
```

### Run the server

```bash
npm run dev    # with auto-reload (nodemon)
npm start      # production
```

### Run tests

```bash
npm test
```

Tests validate the normaliser, classifier, and confidence scorer without making any API calls.

---

## API Reference

### `POST /webhook/message`

Receives a guest message and returns an AI-drafted reply.

**Request body:**

```json
{
  "source": "whatsapp",
  "guest_name": "Rahul Sharma",
  "message": "Is the villa available from April 20 to 24? What is the rate for 2 adults?",
  "timestamp": "2026-05-05T10:30:00Z",
  "booking_ref": "NIS-2024-0891",
  "property_id": "villa-b1"
}
```

| Field         | Type   | Required | Notes                                                      |
|---------------|--------|----------|------------------------------------------------------------|
| `source`      | string | ✅       | `whatsapp`, `booking_com`, `airbnb`, `instagram`, `direct` |
| `guest_name`  | string | ✅       | Also accepts `name`, `sender_name`, `from_name`            |
| `message`     | string | ✅       | Also accepts `guest_message`, `text`, `body`, `content`    |
| `timestamp`   | string | ❌       | ISO 8601. Defaults to current time if omitted              |
| `booking_ref` | string | ❌       | Also accepts `reservation_id`, `confirmation_code`         |
| `property_id` | string | ❌       | Also accepts `listing_id`, `property_code`                 |

**Response:**

```json
{
  "message_id": "550e8400-e29b-41d4-a716-446655440000",
  "query_type": "pre_sales_availability",
  "drafted_reply": "Hi Rahul! Great news — Villa B1 is available from April 20 to 24...",
  "confidence_score": 0.95,
  "action": "auto_send",
  "metadata": {
    "source": "whatsapp",
    "guest_name": "Rahul Sharma",
    "property_id": "villa-b1",
    "booking_ref": "NIS-2024-0891",
    "scoring_breakdown": {
      "base": 0.87,
      "property_context_bonus": 0.05,
      "booking_ref_bonus": 0.03
    },
    "processing_time_ms": 1523
  }
}
```

### `GET /health`

Health check endpoint. Returns `{ "status": "ok" }`.

---

## Confidence Scoring Logic

The confidence score determines how much we trust the AI-drafted reply. It starts with a **base score** derived from the query type and is adjusted by several heuristics:

### Scoring Factors

| Factor                      | Effect   | Rationale                                                     |
|-----------------------------|----------|---------------------------------------------------------------|
| **Query type base score**   | 0.40–0.92 | Factual queries (check-in info) score higher than complaints  |
| **Property context known**  | +0.05    | Having property data means the AI can give accurate answers   |
| **Booking reference present**| +0.03   | We know this is a real guest with a real booking              |
| **Short reply (<50 chars)** | −0.05   | Suspiciously short — model may have refused or given no answer |
| **Uncertainty language**    | −0.10   | Phrases like "I'm not sure" reduce trust                      |
| **Complaint ceiling**       | max 0.55 | Complaints never auto-send — they always need a human         |

### Base Scores by Query Type

| Query Type                | Base Score |
|---------------------------|-----------|
| `post_sales_checkin`      | 0.92      |
| `pre_sales_pricing`       | 0.88      |
| `pre_sales_availability`  | 0.87      |
| `general_enquiry`         | 0.80      |
| `special_request`         | 0.72      |
| `complaint`               | 0.40      |

### Action Thresholds

| Score Range     | Action          | Meaning                                    |
|-----------------|-----------------|---------------------------------------------|
| ≥ 0.85          | `auto_send`     | High confidence — send without human review |
| 0.60 – 0.84     | `agent_review`  | Moderate — queue for agent to approve       |
| < 0.60 or complaint | `escalate`  | Low confidence or complaint — needs a human |

### Why this approach?

I chose a **rule-based scoring system** over asking Claude to self-assess because:

1. **Determinism** — The same inputs always produce the same score. This makes debugging and auditing straightforward.
2. **Speed** — No extra API call needed. Scoring is instant.
3. **Transparency** — The `scoring_breakdown` in the response shows exactly why a score was assigned. An agent can look at it and understand the decision.
4. **Safety** — Hard ceilings (e.g. complaints always escalate) enforce business rules that should never be overridden by a probabilistic model.

---

## Query Classification

Messages are classified into one of six types using keyword pattern matching, evaluated in priority order:

1. **`complaint`** — checked first because an angry message about pricing is still a complaint
2. **`special_request`** — early check-in, airport transfers, celebrations
3. **`post_sales_checkin`** — check-in times, WiFi, directions
4. **`pre_sales_pricing`** — rates, costs, discounts
5. **`pre_sales_availability`** — dates, booking, vacancy
6. **`general_enquiry`** — fallback for everything else (pets, parking, amenities)

---

## Project Structure

```
nistula-technical-assessment/
├── src/
│   ├── server.js                 # Express entry point
│   ├── routes/
│   │   └── webhook.js            # POST /webhook/message handler
│   ├── services/
│   │   ├── normalizer.js         # Payload validation & unified schema
│   │   ├── classifier.js         # Query type classification
│   │   └── claude.js             # Anthropic Claude API integration
│   ├── config/
│   │   └── propertyContext.js    # Mock property data
│   └── utils/
│       └── confidence.js         # Confidence scoring engine
├── tests/
│   └── webhook.test.js           # Unit tests (no API calls)
├── schema.sql                    # Part 2 — PostgreSQL schema
├── thinking.md                   # Part 3 — Thinking questions
├── .env.example                  # Environment variable template
├── .gitignore
├── package.json
└── README.md
```

---

## Design Decisions

### Why Node.js + Express?

Express is lightweight, well-documented, and the project doesn't need the overhead of a full framework. The webhook handler is a single POST endpoint — Express fits perfectly.

### Why keyword-based classification instead of AI?

Using Claude to classify every message would add ~1-2 seconds of latency and double the API cost per message. The six categories are well-defined enough that regex patterns handle them accurately. Claude still sees the classification in its prompt and can adjust its response tone accordingly.

### Why field aliases in the normalizer?

Different OTA platforms (Booking.com, Airbnb) use different field names for the same concept. The alias system handles these variations without scattering `if/else` branches through the codebase. Adding a new platform is a one-line change to the alias map.

### Error handling philosophy

When Claude is unavailable, the endpoint still returns a 200 with `action: "escalate"` and a null `drafted_reply`. The message is preserved and queued for human review. The system degrades gracefully rather than failing hard.

---

## Testing

The test suite covers:

- ✅ Standard message normalisation
- ✅ Missing required field rejection
- ✅ Invalid source rejection
- ✅ All six query type classifications
- ✅ High-confidence auto-send scoring
- ✅ Complaint always escalates
- ✅ Field alias resolution (Booking.com style payloads)

Run with:

```bash
npm test
```

---

## Sample cURL Commands

**Test 1 — Availability enquiry (WhatsApp)**

```bash
curl -X POST http://localhost:3000/webhook/message \
  -H "Content-Type: application/json" \
  -d '{
    "source": "whatsapp",
    "guest_name": "Rahul Sharma",
    "message": "Is the villa available from April 20 to 24? What is the rate for 2 adults?",
    "timestamp": "2026-05-05T10:30:00Z",
    "booking_ref": "NIS-2024-0891",
    "property_id": "villa-b1"
  }'
```

**Test 2 — Complaint (Airbnb)**

```bash
curl -X POST http://localhost:3000/webhook/message \
  -H "Content-Type: application/json" \
  -d '{
    "source": "airbnb",
    "guest_name": "Priya Patel",
    "message": "The AC is not working and the room is extremely hot. This is unacceptable for the price we are paying.",
    "timestamp": "2026-05-06T22:15:00Z",
    "booking_ref": "NIS-2024-1002",
    "property_id": "villa-b1"
  }'
```

**Test 3 — Check-in info (Direct)**

```bash
curl -X POST http://localhost:3000/webhook/message \
  -H "Content-Type: application/json" \
  -d '{
    "source": "direct",
    "guest_name": "James Wilson",
    "message": "Hi, what time can we check in tomorrow? Also, what is the WiFi password?",
    "timestamp": "2026-05-07T08:00:00Z",
    "property_id": "villa-b1"
  }'
```
