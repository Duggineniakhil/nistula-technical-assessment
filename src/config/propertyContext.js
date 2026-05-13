/**
 * Property context data used to ground Claude's responses.
 *
 * In a production system this would come from a database or CMS.
 * For the assessment we hard-code the provided mock data so the AI
 * has accurate information to draft replies from.
 */

const properties = {
  "villa-b1": {
    name: "Villa B1",
    location: "Assagao, North Goa",
    bedrooms: 3,
    max_guests: 6,
    private_pool: true,
    check_in: "2:00 PM",
    check_out: "11:00 AM",
    base_rate_inr: 18000,
    base_rate_guests: 4,
    extra_guest_rate_inr: 2000,
    wifi_password: "Nistula@2024",
    caretaker_hours: "8:00 AM – 10:00 PM",
    chef_on_call: true,
    chef_note: "Pre-booking required",
    availability: {
      "2026-04-20_to_2026-04-24": true,
    },
    cancellation_policy: "Free cancellation up to 7 days before check-in",
  },
};

/**
 * Returns property context as a formatted string for the Claude prompt.
 * Falls back to a generic message when the property ID is unknown.
 */
function getPropertyContext(propertyId) {
  const prop = properties[propertyId];

  if (!prop) {
    return `Property "${propertyId}" not found in our records. Please provide general assistance and suggest the guest contact us for specific property details.`;
  }

  return `
PROPERTY DETAILS — ${prop.name}
────────────────────────────────
Location       : ${prop.location}
Bedrooms       : ${prop.bedrooms}
Max guests     : ${prop.max_guests}
Private pool   : ${prop.private_pool ? "Yes" : "No"}
Check-in       : ${prop.check_in}
Check-out      : ${prop.check_out}
Base rate       : INR ${prop.base_rate_inr.toLocaleString()} per night (up to ${prop.base_rate_guests} guests)
Extra guest     : INR ${prop.extra_guest_rate_inr.toLocaleString()} per night per person
WiFi password  : ${prop.wifi_password}
Caretaker      : Available ${prop.caretaker_hours}
Chef on call   : ${prop.chef_on_call ? "Yes" : "No"} — ${prop.chef_note}
Cancellation   : ${prop.cancellation_policy}
Availability   : April 20 – 24 is ${prop.availability["2026-04-20_to_2026-04-24"] ? "AVAILABLE" : "NOT available"}
  `.trim();
}

module.exports = { properties, getPropertyContext };
