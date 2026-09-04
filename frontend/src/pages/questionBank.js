// src/components/questionBank.js

export const QUESTION_POOLS = {
  PUSH: {
    total: 15,
    required: 0,
    penalty: 20, // -20% health per wrong answer
    questions: [
      { q: "What is the primary risk of taking waves directly on the vessel's beam in high seas?", options: ["Parametric rolling and capsize", "Bow damage", "Engine overheating", "Rudder stall"], ans: 0, reason: "Beam seas cause severe rolling, risking cargo shift and capsizing." },
      { q: "When pushing through a storm, how should speed be managed against head seas?", options: ["Increase to max speed", "Maintain cruising speed", "Reduce speed to avoid slamming", "Stop engines completely"], ans: 2, reason: "High speed in head seas causes slamming, destroying the hull and cargo." },
      { q: "What is 'Parametric Rolling'?", options: ["A controlled turn", "Spontaneous, severe rolling in head/following seas", "Rolling cargo below deck", "Radar interference"], ans: 1, reason: "It's a dangerous resonance effect causing sudden extreme angles." },
      { q: "Which wind scale is used to measure storm severity?", options: ["Saffir-Simpson", "Beaufort", "Fujita", "Richter"], ans: 1, reason: "The Beaufort scale measures wind speed based on observed sea conditions." },
      { q: "What is the safest angle to take heavy swells?", options: ["0 degrees (Head on)", "90 degrees (Beam)", "45 degrees (Bow quarter)", "180 degrees (Following)"], ans: 2, reason: "Taking waves on the bow quarter (45°) minimizes slamming and rolling." },
      { q: "If cargo shifts during a storm, what happens to the vessel's center of gravity (G)?", options: ["Moves towards the shift", "Moves opposite the shift", "Remains unchanged", "Drops lower"], ans: 0, reason: "The center of gravity shifts toward the added or moved weight, causing a list." },
      { q: "What is the purpose of freeing ports on a vessel's deck?", options: ["Loading cargo", "Allowing crew to escape", "Draining water quickly from the deck", "Ventilating the engine room"], ans: 2, reason: "Freeing ports prevent water accumulation that could destabilize the ship." },
      { q: "What defines a 'Rogue Wave'?", options: ["A wave twice the significant wave height", "A tidal wave", "A wave caused by a submarine", "A wave hitting the stern"], ans: 0, reason: "Rogue waves are massive, unpredictable waves far larger than surrounding seas." },
      { q: "Why is 'Slack Water' dangerous in cargo tanks during a storm?", options: ["It evaporates quickly", "Free Surface Effect reduces stability", "It increases fuel efficiency", "It freezes"], ans: 1, reason: "Moving liquid (Free Surface Effect) violently throws the ship's balance off." },
      { q: "What is the primary indicator of an approaching severe squall on marine radar?", options: ["A solid, bright, fast-moving echo", "A dotted line", "Complete static", "A circular ring"], ans: 0, reason: "Heavy rain and microbursts appear as dense, solid echoes on the X-band radar." },
      { q: "If the barometer drops 5 millibars in 3 hours, what does it indicate?", options: ["Clearing skies", "Rapidly deteriorating weather", "Static high pressure", "Instrument failure"], ans: 1, reason: "A rapid pressure drop signifies an approaching severe low-pressure system." },
      { q: "What is the most critical communication channel to monitor during a Mayday situation?", options: ["VHF Channel 13", "VHF Channel 16", "UHF Channel 4", "CB Radio"], ans: 1, reason: "VHF Channel 16 is the international distress and calling frequency." },
      { q: "How does 'Squat Effect' alter a vessel in shallow storm waters?", options: ["Increases speed", "Reduces draft", "Increases draft and reduces under-keel clearance", "Lifts the bow"], ans: 2, reason: "Hydrodynamic pressure causes the ship to sink deeper into the water." },
      { q: "What is the primary function of a sea anchor?", options: ["To dock the ship", "To keep the bow pointing into the wind/waves", "To measure depth", "To catch fish for rations"], ans: 1, reason: "A sea anchor creates drag to stabilize the vessel's heading in a storm." },
      { q: "What does a vessel's 'Righting Arm' (GZ) represent?", options: ["Crane length", "The force attempting to return the ship to upright", "Rudder angle", "Anchor chain tension"], ans: 1, reason: "It is the lever arm that creates the righting moment to prevent capsizing." }
    ]
  },
  RETREAT: {
    total: 5,
    required: 0, // Always passes, but minimizes health loss
    penalty: 5, // -5% health per wrong answer
    questions: [
      { q: "When executing a tactical retreat to a Safe Haven, what is the priority?", options: ["Fuel efficiency", "Maintaining steerage way and stability", "Reaching port immediately", "Radio silence"], ans: 1, reason: "Steerage way ensures you can control your heading while falling back." },
      { q: "What is the correct procedure for dropping anchor in heavy weather?", options: ["Drop it at max speed", "Drop it while reversing slowly", "Let all the chain out instantly", "Don't use the anchor"], ans: 1, reason: "Reversing slowly ensures the chain lays out flat and digs in properly." },
      { q: "Why might retreating downwind (running with the storm) be dangerous?", options: ["You reach port too fast", "Risk of broaching or being pooped by a wave", "It uses too much fuel", "Radar stops working"], ans: 1, reason: "Waves crashing over the stern (pooping) or forcing the ship sideways (broaching) is lethal." },
      { q: "What is the internationally recognized distress signal sent via DSC?", options: ["Securite", "Pan-Pan", "Mayday", "CQD"], ans: 2, reason: "Mayday designates grave and imminent danger requiring immediate assistance." },
      { q: "During a retreat, why is it vital to constantly monitor the bilge alarms?", options: ["To check water temperature", "To detect hidden hull breaches or flooding", "To ensure the horn works", "To monitor fuel levels"], ans: 1, reason: "Storm stress can cause cracks; bilge alarms warn of internal flooding." }
    ]
  },
  REROUTE: {
    total: 8,
    required: 0,
    penalty: 20, // -20% health per wrong answer
    questions: [
      { q: "Rerouting extends the voyage. How is fuel consumption related to vessel speed?", options: ["Linear", "Square", "Cubic", "No relation"], ans: 2, reason: "Fuel consumption increases by the cube of the speed; doubling speed uses 8x fuel." },
      { q: "What is the primary constraint when selecting an alternate coastal route?", options: ["Scenic views", "Under-keel clearance and draft", "Wind direction", "Time of day"], ans: 1, reason: "If the water is shallower than the ship's draft, you will run aground." },
      { q: "What does 'ECA' stand for in maritime routing?", options: ["Emergency Cargo Area", "Emission Control Area", "Estimated Clear Arrival", "Eastern Coastal Authority"], ans: 1, reason: "ECAs require vessels to switch to expensive, low-sulfur fuel." },
      { q: "If you reroute 500 nautical miles at 15 knots, how much delay is added?", options: ["20 hours", "33.3 hours", "45 hours", "50 hours"], ans: 1, reason: "Time = Distance / Speed (500 / 15 = 33.33 hours)." },
      { q: "What navigational chart system must be updated before executing a reroute?", options: ["Google Maps", "ECDIS", "Sonar", "AIS"], ans: 1, reason: "ECDIS (Electronic Chart Display and Information System) handles official maritime navigation." },
      { q: "What is a 'Chokepoint' in maritime logistics?", options: ["A narrow channel with high traffic", "A fuel shortage", "An engine failure", "A customs delay"], ans: 0, reason: "Chokepoints like the Malacca Strait are highly congested and dangerous." },
      { q: "How does navigating a shallower reroute affect the vessel's handling?", options: ["Makes it faster", "Increases turning radius and sluggishness", "Improves fuel economy", "No effect"], ans: 1, reason: "Shallow water effects drastically reduce rudder responsiveness." },
      { q: "When notifying the destination port of a reroute delay, what document is updated?", options: ["Bill of Lading", "ETA (Estimated Time of Arrival)", "Crew Roster", "Ship Registry"], ans: 1, reason: "The ETA is critical for port authorities to manage berth scheduling." }
    ]
  }
};