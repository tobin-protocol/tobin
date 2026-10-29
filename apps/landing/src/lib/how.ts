/** Copy and illustration for the five stages, shared by the static list and the carousel (788 x 317 images with a transparent background). */
export const HOW_STEPS = [
  {
    title: "Submit",
    image: "/illustrations/how/cut-submit.webp",
    alt: "Two institutions and an obligation passing between them, accepted by the counterparty.",
    role: "Institutions and counterparties",
    body: "Institutions submit authenticated payment obligations, and counterparties accept them.",
  },
  {
    title: "Group",
    image: "/illustrations/how/cut-group.webp",
    alt: "Accepted obligations collected into one clearing session.",
    role: "Clearing sessions",
    body: "Accepted obligations are grouped into clearing sessions.",
  },
  {
    title: "Net",
    image: "/illustrations/how/cut-net.webp",
    alt: "Large gross obligations reduced to one small net position.",
    role: "Deterministic engine",
    body: "A deterministic engine calculates each participant's net position. It is a calculator, not an authority.",
  },
  {
    title: "Sign",
    image: "/illustrations/how/cut-sign.webp",
    alt: "Three participants each signing, the last signature completing the result.",
    role: "Participants with non-zero net positions",
    body: "The result is committed and becomes final once the participants with non-zero net positions have signed it.",
  },
  {
    title: "Settle",
    image: "/illustrations/how/cut-settle.webp",
    alt: "Only the net amount settles at the end of the line.",
    role: "Soroban contract on Stellar",
    body: "Only the net positions settle, through a Soroban contract on Stellar.",
  },
] as const;

export const HOW_CLOSING =
  "Obligations in, net positions out. Because the calculation is deterministic, the same set of obligations always produces the same result.";
