# Part 3 — Thinking Question

**Question A: Immediate Response**
*AI Reply:* "Hi [Name], I’m so sorry about the hot water issue, especially with guests arriving soon. I’ve immediately alerted our on-call maintenance team to investigate. Regarding the refund, our manager will review this and follow up with you first thing in the morning. Is there anything else I can assist with right now?"
*Why:* Leads with empathy and actionable reassurance (team alerted). Acknowledges the refund request without making unauthorized financial commitments, deferring to management.

**Question B: System Design**
1. **Classification:** Tagged as `complaint:urgent`. Action set to `escalate`. AI reply auto-sends if no agent responds within 5 minutes.
2. **Alerts:** Triggers P1 notifications: WhatsApp to on-call caretaker (property/issue details) and SMS to property manager. Flags red on operations dashboard.
3. **Audit Log:** Records inbound message, AI draft, confidence score, and notification timestamps.
4. **SLA Escalation:** If unacknowledged after 30 minutes, re-alerts manager, notifies operations head, and sends guest an update: *"Our team is still working on your issue."*
5. **Ticketing:** Auto-creates a P1 maintenance ticket linked to the reservation for next-day review.

**Question C: The Learning**
Three similar complaints indicate a systemic failure. The system should:
1. **Detect Pattern:** Background job flags issues occurring ≥3 times within a rolling window at a specific property.
2. **Preventive Action:** Auto-generates a mandatory preventive maintenance ticket ("Inspect Villa B1 boiler system") assigned to operations.
3. **Risk Profiling:** Tags Villa B1 with `risk:hot_water`.
4. **Pre-Arrival Checks:** Updates the caretaker’s pre-check-in checklist for Villa B1 to explicitly verify the hot water system before future guests arrive.
