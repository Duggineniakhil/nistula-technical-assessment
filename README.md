# Nistula Technical Assessment — Guest Message Handler

A backend webhook service that ingests guest messages from multiple hospitality channels, normalises them into a unified schema, classifies intent, drafts AI-generated responses using Claude, and returns confidence-scored actions for automated or human-assisted handling.

## Key Features
- Multi-channel guest message ingestion
- Unified schema normalisation
- Rule-based query classification (six categories)
- Claude-powered response drafting
- Deterministic confidence scoring with action routing (auto-send, agent review, escalation)
- Graceful fallback & escalation handling
- Modular service-based architecture
- Comprehensive unit tests covering the core pipeline

## Request Flow
```
Webhook Request → Validation & Normalisation → Query Classification → Claude Response Generation → Confidence Scoring → Action Routing → JSON Response
```

## Setup
### Prerequisites
- Node.js v18+
- Anthropic API key

### Installation
```bash
git clone https://github.com/Duggineniakhil/nistula-technical-assessment.git
cd nistula-technical-assessment
npm install
```

### Configuration
Copy the example env file and add your API key:
```bash
cp .env.example .env
# Edit .env
# ANTHROPIC_API_KEY=your-key-here
# PORT=3000
```

## Run the Server
```bash
npm run dev   # development with hot reload
npm start     # production
```

## Run Tests
```bash
npm test
```

## API Reference
### `POST /webhook/message`
**Request body** (JSON):
```json
{
  "source": "whatsapp",
  "guest_name": "Rahul Sharma",
  "message": "Is the villa available from April 20 to 24?",
  "timestamp": "2026-05-05T10:30:00Z",
  "booking_ref": "NIS-2024-0891",
  "property_id": "villa-b1"
}
```
**Response** (JSON):
```json
{
  "message_id": "550e8400-e29b-41d4-a716-446655440000",
  "query_type": "pre_sales_availability",
  "drafted_reply": "Hi Rahul! Villa B1 is available from April 20-24. The rate is INR 18,000 per night for up to 4 guests.",
  "confidence_score": 0.95,
  "action": "auto_send",
  "metadata": {
    "source": "whatsapp",
    "guest_name": "Rahul Sharma",
    "property_id": "villa-b1",
    "booking_ref": "NIS-2024-0891",
    "scoring_breakdown": { "base": 0.87, "property_context_bonus": 0.05, "booking_ref_bonus": 0.03 },
    "processing_time_ms": 1523
  }
}
```

## Confidence Scoring
**Why rule-based?** A deterministic scoring system was chosen instead of AI self-evaluation because it is:
- **Transparent**: Clear breakdown of scores.
- **Faster**: Instant calculation without extra API calls.
- **Easier to debug**: Deterministic inputs yield deterministic outputs.
- **Safer**: Allows enforcing hard business rules (e.g., complaints always escalate).

## Query Classification
Messages are classified into six categories using rule-based keyword matching:
- `pre_sales_availability`
- `pre_sales_pricing`
- `post_sales_checkin`
- `special_request`
- `complaint` (prioritised for escalation)
- `general_enquiry`

## Error Handling
The system validates all inbound payloads and handles failures gracefully:
- **Invalid source rejection**: Returns 400 if the source is not recognized.
- **Missing field validation**: Ensures required fields like `message` and `guest_name` are present.
- **Claude API failure fallback**: If AI generation fails, the endpoint returns a 200 with `action: "escalate"` and `drafted_reply: null`, ensuring the message is queued for human review.
- **Low-confidence escalation**: Responses with low scores or specific query types (like complaints) are automatically routed for agent review.

## Project Structure
```
nistula-technical-assessment/
├── src/
│   ├── server.js               # Express entry point
│   ├── routes/webhook.js       # POST /webhook/message handler
│   ├── services/
│   │   ├── normalizer.js       # Payload validation & unified schema
│   │   ├── classifier.js       # Keyword-based classification
│   │   └── claude.js           # Anthropic Claude integration
│   ├── config/propertyContext.js
│   └── utils/confidence.js     # Confidence scoring engine
├── tests/webhook.test.js
├── schema.sql                  # PostgreSQL schema
├── thinking.md                 # Technical thinking paper
└── README.md
```

## Future Improvements
- **Persistent Storage**: Implement PostgreSQL integration for guest profiles and message history.
- **Conversation Memory**: Track context across multiple messages in a session.
- **RAG Integration**: Use Retrieval-Augmented Generation for more accurate property-specific answers.
- **Real-time Dashboard**: Build an interface for agents to review and send AI drafts.
- **Analytics**: Trend detection for recurring guest complaints or requests.



