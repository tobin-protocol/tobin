/** Copy for the four stages, shared by the static list and the pinned scene. */
export const HOW_STEPS = [
  { title: "Submit", body: "Institutions submit authenticated payment obligations." },
  { title: "Clear", body: "Eligible obligations are grouped into clearing sessions." },
  { title: "Net", body: "Tobin calculates deterministic net positions." },
  { title: "Settle", body: "Resulting positions are settled through Soroban on Stellar." },
] as const;

export const HOW_CLOSING =
  "Obligations in, net positions out. Because the calculation is deterministic, the same set of obligations always produces the same result.";
