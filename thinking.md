# Part 3 — Thinking Question

## The Scenario

It is 3 AM. A guest at Villa B1 sends a WhatsApp message:

> "There is no hot water and we have guests arriving for breakfast in 4 hours. This is unacceptable. I want a refund for tonight."

---

## Question A — The Immediate Response

**The AI reply at 3 AM:**

> Hi [Guest Name], I'm really sorry about the hot water issue — I completely understand how frustrating this is, especially with guests coming in the morning. I've alerted our maintenance team right now and someone will reach out to you shortly to get this fixed. Regarding the refund, our manager will personally follow up with you first thing in the morning to make sure this is resolved fairly. Is there anything else I can do for you right now?

**Why this wording:** The message leads with genuine empathy, not a template apology. It gives a concrete action ("maintenance team alerted") so the guest knows something is actually happening, not just words. The refund question is acknowledged but deferred to a manager — the AI should never make financial commitments it cannot authorize. The tone is human and urgent, matching the gravity the guest feels at 3 AM.

---

## Question B — The System Design

The platform should trigger a multi-step response chain:

1. **Classify & escalate immediately.** The message is tagged `complaint` with sub-tag `urgent_maintenance`. The confidence score is capped low, and the action is set to `escalate` — the AI reply is held for review unless no human responds within 5 minutes, at which case it auto-sends the empathetic acknowledgement.

2. **Notify the right people.** The system sends parallel alerts: (a) the on-call caretaker via WhatsApp with the property name, room details, and issue type; (b) the property manager via SMS and push notification; (c) the operations dashboard flags this conversation in red with a 30-minute SLA timer.

3. **Log everything.** The inbound message, AI draft, classification, confidence score, and all notifications are written to the audit log with timestamps. This creates a full incident timeline.

4. **30-minute dead-man switch.** If no human agent has responded or updated the ticket within 30 minutes, the system (a) re-sends alerts to the property manager with an escalation flag, (b) sends a follow-up to the guest: _"Just checking in — our team is working on the hot water issue and will update you shortly,"_ and (c) alerts the operations manager on call.

5. **Incident ticket created.** A maintenance incident is auto-created, linked to the reservation and property, with priority `P1-urgent` so it feeds into next-day operational reviews.

---

## Question C — The Learning

Three complaints about the same issue at the same property is a pattern, not a coincidence. The system should:

1. **Detect the pattern automatically.** A background job should scan complaint messages by property and issue category (NLP-extracted or tag-based). When the same issue appears ≥ 3 times within a rolling window, it generates a **recurring issue alert** to the property operations team.

2. **Create a preventive maintenance ticket.** The system auto-creates a maintenance work order: "Inspect and service hot water system at Villa B1 — 3 guest complaints in 60 days." This goes to the property owner and Nistula's operations team with full complaint history attached.

3. **Update the property's risk profile.** Villa B1 gets a flag in the system: `known_issue: hot_water`. When future guests book, the pre-arrival checklist now includes "verify hot water system" for the caretaker on the day of check-in.

4. **Proactive guest communication.** For guests currently staying or arriving soon at Villa B1, the caretaker is prompted to do a hot water check and confirm it is working — before the guest has to discover the problem themselves.

The goal is to close the loop: detect → fix → verify → prevent. The fourth complaint should never happen.
