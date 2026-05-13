-- ═══════════════════════════════════════════════════════════════════
-- NISTULA UNIFIED MESSAGING PLATFORM — DATABASE SCHEMA
-- ═══════════════════════════════════════════════════════════════════
--
-- Design principles:
--   1. One guest, one record — regardless of how many channels they use.
--   2. All messages in one table, partitioned logically by conversation.
--   3. Full audit trail: who drafted, who edited, what was sent.
--   4. AI metadata (confidence, query type) stored per inbound message.
--
-- ───────────────────────────────────────────────────────────────────


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  PROPERTIES                                                      │
-- │  Each villa / apartment managed by Nistula.                      │
-- └──────────────────────────────────────────────────────────────────┘
CREATE TABLE properties (
    id              VARCHAR(50)     PRIMARY KEY,          -- e.g. "villa-b1"
    name            VARCHAR(200)    NOT NULL,
    location        VARCHAR(300),
    bedrooms        SMALLINT,
    max_guests      SMALLINT,
    base_rate_inr   INTEGER,                              -- per night, base occupancy
    check_in_time   TIME,
    check_out_time  TIME,
    amenities       JSONB           DEFAULT '{}',         -- flexible key-value for pool, wifi, etc.
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE properties IS 'Nistula-managed properties. One row per physical property.';


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  GUESTS                                                          │
-- │  Single profile per guest across ALL channels.                   │
-- │                                                                  │
-- │  Design decision: We use a separate guest_channels table to map  │
-- │  channel-specific identifiers (WhatsApp phone, Airbnb user ID)   │
-- │  to a single guest record.  This avoids duplicate guest rows     │
-- │  when the same person messages from multiple platforms.           │
-- └──────────────────────────────────────────────────────────────────┘
CREATE TABLE guests (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(200)    NOT NULL,
    email           VARCHAR(320),                         -- RFC 5321 max length
    phone           VARCHAR(20),
    notes           TEXT,                                 -- agent notes about this guest
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_guests_email ON guests(email) WHERE email IS NOT NULL;
CREATE INDEX idx_guests_phone ON guests(phone) WHERE phone IS NOT NULL;

COMMENT ON TABLE guests IS 'One record per real-world guest, regardless of channel.';


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  GUEST CHANNELS                                                  │
-- │  Maps a channel-specific identifier to a guest profile.          │
-- │  One guest can have many channel identifiers.                    │
-- └──────────────────────────────────────────────────────────────────┘
CREATE TYPE channel_type AS ENUM (
    'whatsapp', 'booking_com', 'airbnb', 'instagram', 'direct'
);

CREATE TABLE guest_channels (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id        UUID            NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    channel         channel_type    NOT NULL,
    channel_user_id VARCHAR(200)    NOT NULL,             -- phone number, OTA user id, etc.
    UNIQUE (channel, channel_user_id)                     -- one mapping per channel identity
);

CREATE INDEX idx_guest_channels_guest ON guest_channels(guest_id);

COMMENT ON TABLE guest_channels IS
  'Links channel-specific identifiers to a unified guest profile. '
  'Allows the same guest to message from WhatsApp and Airbnb and still '
  'be recognized as one person.';


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  RESERVATIONS                                                    │
-- │  Bookings linked to a guest and a property.                      │
-- └──────────────────────────────────────────────────────────────────┘
CREATE TYPE reservation_status AS ENUM (
    'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'
);

CREATE TABLE reservations (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_ref     VARCHAR(50)     NOT NULL UNIQUE,      -- e.g. "NIS-2024-0891"
    guest_id        UUID            NOT NULL REFERENCES guests(id),
    property_id     VARCHAR(50)     NOT NULL REFERENCES properties(id),
    check_in_date   DATE            NOT NULL,
    check_out_date  DATE            NOT NULL,
    num_guests      SMALLINT        NOT NULL DEFAULT 1,
    total_amount    INTEGER,                              -- in INR
    status          reservation_status NOT NULL DEFAULT 'confirmed',
    source_channel  channel_type,                         -- where the booking originated
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_dates CHECK (check_out_date > check_in_date)
);

CREATE INDEX idx_reservations_guest    ON reservations(guest_id);
CREATE INDEX idx_reservations_property ON reservations(property_id);
CREATE INDEX idx_reservations_dates    ON reservations(check_in_date, check_out_date);

COMMENT ON TABLE reservations IS 'All bookings across all channels linked to a guest and property.';


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  CONVERSATIONS                                                   │
-- │  A conversation groups messages between a guest and Nistula      │
-- │  about a specific topic or reservation.                          │
-- │                                                                  │
-- │  Design decision: A conversation can optionally link to a        │
-- │  reservation.  Pre-sales conversations may not have a booking    │
-- │  yet, so reservation_id is nullable.                             │
-- └──────────────────────────────────────────────────────────────────┘
CREATE TYPE conversation_status AS ENUM (
    'open', 'waiting_on_guest', 'waiting_on_agent', 'resolved', 'escalated'
);

CREATE TABLE conversations (
    id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id        UUID                NOT NULL REFERENCES guests(id),
    reservation_id  UUID                REFERENCES reservations(id),   -- nullable for pre-sales
    property_id     VARCHAR(50)         REFERENCES properties(id),
    channel         channel_type        NOT NULL,
    status          conversation_status NOT NULL DEFAULT 'open',
    assigned_agent  VARCHAR(200),                         -- agent handling this conversation
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_guest       ON conversations(guest_id);
CREATE INDEX idx_conversations_reservation ON conversations(reservation_id);
CREATE INDEX idx_conversations_status      ON conversations(status);

COMMENT ON TABLE conversations IS
  'Groups messages into threads. Links guest ↔ reservation ↔ property.';


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  MESSAGES                                                        │
-- │  Every message across every channel lives here.                  │
-- │                                                                  │
-- │  This is the core table.  Key design choices:                    │
-- │                                                                  │
-- │  • direction: 'inbound' (guest → Nistula) or 'outbound'.        │
-- │  • draft_source: tracks whether a reply was AI-generated,        │
-- │    manually written by an agent, or auto-sent by the system.     │
-- │  • ai_confidence & query_type: stored per inbound message so     │
-- │    we can analyse AI accuracy over time.                         │
-- │  • agent_edited: boolean flag — if an agent tweaked an AI draft  │
-- │    before sending, we set this to true.  This creates a built-in │
-- │    feedback loop for AI improvement.                             │
-- └──────────────────────────────────────────────────────────────────┘
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');

CREATE TYPE draft_source AS ENUM (
    'ai_drafted',       -- Claude generated the reply
    'agent_written',    -- Human wrote from scratch
    'ai_auto_sent',     -- AI reply sent without human review
    'system'            -- Automated system messages (confirmations, etc.)
);

CREATE TYPE query_type AS ENUM (
    'pre_sales_availability',
    'pre_sales_pricing',
    'post_sales_checkin',
    'special_request',
    'complaint',
    'general_enquiry'
);

CREATE TABLE messages (
    id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     UUID                NOT NULL REFERENCES conversations(id),
    direction           message_direction   NOT NULL,
    message_text        TEXT                NOT NULL,
    channel             channel_type        NOT NULL,

    -- AI metadata (populated for inbound messages)
    query_type          query_type,
    ai_confidence       NUMERIC(3,2)        CHECK (ai_confidence BETWEEN 0 AND 1),
    ai_action           VARCHAR(20),                       -- auto_send / agent_review / escalate

    -- Outbound metadata (populated for outbound messages)
    draft_source        draft_source,
    ai_drafted_text     TEXT,                              -- original AI draft before edits
    agent_edited        BOOLEAN             DEFAULT false, -- true if agent modified AI draft
    sent_at             TIMESTAMPTZ,

    -- Common metadata
    created_at          TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created      ON messages(created_at);
CREATE INDEX idx_messages_query_type   ON messages(query_type) WHERE query_type IS NOT NULL;

COMMENT ON TABLE messages IS
  'All messages across all channels. Inbound messages carry AI classification '
  'metadata; outbound messages track whether they were AI-drafted, agent-edited, '
  'or auto-sent.';

COMMENT ON COLUMN messages.ai_drafted_text IS
  'Stores the original AI draft so we can compare it with what the agent '
  'actually sent — this is the training data for improving the AI.';

COMMENT ON COLUMN messages.agent_edited IS
  'When true, the agent modified the AI draft before sending. Comparing '
  'ai_drafted_text with message_text reveals what the AI got wrong.';


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  MESSAGE AUDIT LOG                                               │
-- │  Tracks every state change on a message (drafted → reviewed →    │
-- │  edited → sent).  Useful for compliance and debugging.           │
-- └──────────────────────────────────────────────────────────────────┘
CREATE TABLE message_audit_log (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      UUID            NOT NULL REFERENCES messages(id),
    action          VARCHAR(50)     NOT NULL,              -- e.g. 'ai_drafted', 'agent_edited', 'sent'
    performed_by    VARCHAR(200),                          -- agent name or 'system'
    details         JSONB,                                 -- any extra context
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_message ON message_audit_log(message_id);

COMMENT ON TABLE message_audit_log IS
  'Immutable audit trail of every action taken on a message.';


-- ═══════════════════════════════════════════════════════════════════
-- HARDEST DESIGN DECISION
-- ═══════════════════════════════════════════════════════════════════
--
-- The hardest decision was how to model the relationship between a guest
-- and their multiple channel identities.  The two options were:
--
--   A) Store channel IDs as columns on the guests table (whatsapp_id,
--      airbnb_id, etc.)  — simple but rigid.  Adding a new channel
--      means an ALTER TABLE.
--
--   B) Use a separate guest_channels junction table with a row per
--      channel identity.
--
-- I chose (B) because Nistula integrates with multiple OTAs and the
-- channel list will grow.  The junction table also lets us handle edge
-- cases cleanly — e.g. two WhatsApp numbers for the same guest, or
-- merging duplicate guest profiles when we discover they are the same
-- person across channels.  The trade-off is a JOIN on every message
-- lookup, but that is easily handled by the index on guest_channels
-- and is a worthwhile cost for the flexibility gained.
--
-- ═══════════════════════════════════════════════════════════════════
