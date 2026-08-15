// "Our work" — finished rooms shown on /work (3D spiral) and /work/[slug].
// Plain serialisable data: it is imported by both server and client components.

export type WorkTone =
  | "ivory" | "brass" | "terracotta" | "sage" | "oxblood"
  | "slate" | "ink" | "indigo" | "walnut";

export interface WorkProject {
  slug: string;
  title: string;
  category: string;
  location: string;
  year: string;
  code: string;
  shadeName: string;
  swatch: string;
  tone: WorkTone;
  /** Tone of the wall before the recolour — drives the "before" pane of the slider. */
  beforeTone: WorkTone;
  /** Who previewed it, and where — keeps each story attributable. */
  credit: string;
  /** CSS aspect-ratio for the spiral card, e.g. "16 / 10". */
  aspect: string;
  blurb: string;
  story: readonly [string, string];
  palette: ReadonlyArray<{ hex: string; name: string; surface: string }>;
  stats: ReadonlyArray<readonly [string, string]>;
}

/**
 * A card in the /work spiral and list.
 *
 * Two very different things end up here: the built-in demonstration projects
 * below, which are tonal gradients with invented stories, and rooms an admin
 * published from the studio, which are real photographs with real shade codes.
 * The spiral should not have to know which it is holding — so both are mapped to
 * this before they reach it, and the single difference that matters to the
 * rendering (is there a photograph?) is one optional field.
 */
export interface WorkCard {
  slug: string;
  title: string;
  category: string;
  location: string;
  year: string;
  /** The line above the title — a shade code, or what is on the walls. */
  code: string;
  swatch: string;
  /** The tonal placeholder. Only seen when there is no photograph, or it fails. */
  tone: WorkTone;
  aspect: string;
  /** A real photograph. Absent on the built-ins, which have none. */
  imageUrl?: string;
  alt?: string;
}

/** A card plus everything its own page prints. */
export interface WorkDetail extends WorkCard {
  blurb: string;
  credit: string;
  story: readonly string[];
  palette: ReadonlyArray<{ hex: string; name: string; surface: string }>;
  stats: ReadonlyArray<readonly [string, string]>;
  /**
   * The wall before the recolour. Present only on the built-ins, which prove the
   * point with a drag-to-compare between two gradients. A published room has one
   * photograph — the finished room — so its page shows that instead of inventing
   * a "before" it never had.
   */
  beforeTone?: WorkTone;
  /** The shade's name, for the built-ins' compare caption. */
  shadeName?: string;
}

export function cardOfWork(w: WorkProject): WorkCard {
  return {
    slug: w.slug,
    title: w.title,
    category: w.category,
    location: w.location,
    year: w.year,
    code: `${w.code} · ${w.shadeName}`,
    swatch: w.swatch,
    tone: w.tone,
    aspect: w.aspect,
  };
}

export function detailOfWork(w: WorkProject): WorkDetail {
  return {
    ...cardOfWork(w),
    blurb: w.blurb,
    credit: w.credit,
    story: w.story,
    palette: w.palette,
    stats: w.stats,
    beforeTone: w.beforeTone,
    shadeName: w.shadeName,
  };
}

/** The same tonal gradients as the `.ph` placeholder system — used as the
 *  "after" pane of the before/after slider on detail pages. */
export const TONE_BG: Record<WorkTone, string> = {
  ivory: "radial-gradient(ellipse at 30% 25%, rgba(255,255,255,.6), transparent 60%), linear-gradient(160deg, #e8e0cf 0%, #c9bda4 55%, #9b8d70 100%)",
  brass: "radial-gradient(ellipse at 30% 25%, rgba(255,250,235,.5), transparent 60%), linear-gradient(135deg, #d4b88a 0%, #b89968 50%, #7a5d3a 100%)",
  terracotta: "radial-gradient(ellipse at 28% 22%, rgba(255,235,210,.4), transparent 60%), linear-gradient(140deg, #c87a55 0%, #9d5236 55%, #61301d 100%)",
  sage: "radial-gradient(ellipse at 28% 22%, rgba(255,250,235,.22), transparent 60%), linear-gradient(150deg, #8a9a85 0%, #5b6c5b 55%, #2e3a2e 100%)",
  oxblood: "radial-gradient(ellipse at 28% 22%, rgba(255,210,190,.22), transparent 60%), linear-gradient(155deg, #884240 0%, #5a2724 55%, #2a100e 100%)",
  slate: "radial-gradient(ellipse at 28% 22%, rgba(255,255,255,.18), transparent 60%), linear-gradient(150deg, #6a7680 0%, #3e4a52 55%, #1f262d 100%)",
  ink: "radial-gradient(ellipse at 30% 18%, rgba(244,244,242,.12), transparent 55%), linear-gradient(160deg, #2a2825 0%, #141413 60%, #0e0e0d 100%)",
  indigo: "radial-gradient(ellipse at 30% 22%, rgba(220,225,255,.22), transparent 60%), linear-gradient(150deg, #3a4870 0%, #1f284a 55%, #0c1226 100%)",
  walnut: "radial-gradient(ellipse at 30% 22%, rgba(255,220,180,.2), transparent 60%), linear-gradient(150deg, #8a6446 0%, #5a4030 55%, #2c1d12 100%)",
};

export const WORKS: ReadonlyArray<WorkProject> = [
  {
    slug: "spice-market",
    title: "The Spice Market",
    category: "Living room",
    location: "India",
    year: "2026",
    code: "HV-1410",
    shadeName: "Rust",
    swatch: "#9d5236",
    tone: "terracotta",
    beforeTone: "ivory",
    credit: "Previewed at the counter · India",
    aspect: "16 / 10",
    blurb: "A west-facing living room that asked for warmth — answered with a rust feature wall picked at the counter in one visit.",
    story: [
      "The family arrived with a phone photo of a room that went orange every evening. On the counter tablet we tried nine shades against that exact light — the rust held its depth where the brighter terracottas burned out.",
      "The feature wall was recoloured alone, the trim left ivory, and the preview went home on WhatsApp. The order was placed the same afternoon.",
    ],
    palette: [
      { hex: "#9d5236", name: "Rust · HV-1410", surface: "Feature wall" },
      { hex: "#e8dfd2", name: "Cotton · HV-2014", surface: "Walls" },
      { hex: "#f0ead9", name: "Ivory · HV-2001", surface: "Trim & frames" },
    ],
    stats: [["Surfaces", "4 walls · trim"], ["Photo to preview", "18 s"], ["Decided", "same visit"]],
  },
  {
    slug: "linen-bedroom",
    title: "Linen Bedroom",
    category: "Bedroom",
    location: "Pune",
    year: "2026",
    code: "HV-1923",
    shadeName: "Bisque",
    swatch: "#cdb9a0",
    tone: "ivory",
    beforeTone: "slate",
    credit: "Previewed at the counter · Pune",
    aspect: "4 / 5",
    blurb: "A small bedroom made to feel wider with one quiet shade — bisque on every wall, nothing shouting.",
    story: [
      "The brief was calm. The customer had circled four near-identical neutrals on a shade card and could not choose between them — on paper they were the same colour.",
      "On their own photograph the differences were obvious within a minute. Bisque kept its warmth in the room's single-window light where the cooler greys went flat.",
    ],
    palette: [
      { hex: "#cdb9a0", name: "Bisque · HV-1923", surface: "All walls" },
      { hex: "#f0ead9", name: "Ivory · HV-2001", surface: "Ceiling & trim" },
    ],
    stats: [["Shades compared", "9"], ["Photo to preview", "16 s"], ["Repaint requests", "none"]],
  },
  {
    slug: "bluestone-hall",
    title: "Bluestone Hall",
    category: "Kitchen",
    location: "Bengaluru",
    year: "2026",
    code: "HV-1304",
    shadeName: "Bluestone",
    swatch: "#3e4a52",
    tone: "slate",
    beforeTone: "ivory",
    credit: "Previewed at the counter · Bengaluru",
    aspect: "1 / 1",
    blurb: "A dark kitchen the owners were warned against — previewed first, painted with confidence.",
    story: [
      "Everyone advising the couple said a deep slate would shrink the kitchen. The preview said otherwise: with the cabinetry and marble untouched, the dark wall gave the room its missing edge.",
      "Because the recolour keeps every highlight where it was, the steel and stone read true. They ordered the slate, and the painter worked from the saved preview.",
    ],
    palette: [
      { hex: "#3e4a52", name: "Bluestone · HV-1304", surface: "Walls" },
      { hex: "#d9d9d4", name: "Fog · HV-2104", surface: "Ceiling" },
    ],
    stats: [["Surfaces", "2 walls"], ["Photo to preview", "21 s"], ["Decided", "two visits"]],
  },
  {
    slug: "pondicherry-sage",
    title: "Pondicherry Sage",
    category: "Bedroom",
    location: "Mangalore",
    year: "2026",
    code: "HV-1611",
    shadeName: "Sage",
    swatch: "#5b6c5b",
    tone: "sage",
    beforeTone: "walnut",
    credit: "Previewed via shared link · chosen from Bengaluru",
    aspect: "1 / 1",
    blurb: "Coastal light, a sage bedroom, and a customer who chose it from two hundred kilometres away.",
    story: [
      "The room was in Mangalore; the daughter choosing the colour was in Bengaluru. The retailer issued an access code, she uploaded the photo from her phone, and the family compared shades over a shared link.",
      "Three previews travelled the family WhatsApp group. The sage won unanimously, and the shop read the exact codes from her saved project.",
    ],
    palette: [
      { hex: "#5b6c5b", name: "Sage · HV-1611", surface: "Walls" },
      { hex: "#a9b8a4", name: "Eucalypt · HV-1624", surface: "Niche" },
      { hex: "#f0ead9", name: "Ivory · HV-2001", surface: "Trim" },
    ],
    stats: [["Chosen from", "200 km away"], ["Previews shared", "3"], ["Decided", "one evening"]],
  },
  {
    slug: "brass-veranda",
    title: "Brass Veranda",
    category: "Veranda",
    location: "Hubballi",
    year: "2026",
    code: "HV-1521",
    shadeName: "Amber Brass",
    swatch: "#a47148",
    tone: "brass",
    beforeTone: "ivory",
    credit: "Previewed at the counter · Hubballi",
    aspect: "1 / 1",
    blurb: "An exterior veranda tested against afternoon sun before a single can was opened.",
    story: [
      "Exterior colour is the hardest promise to make — the same brass reads gold at noon and brown at dusk. The owner photographed the veranda at both hours and previewed the shade against each.",
      "It held. The painter received the two previews side by side and matched the finish to the western wall first.",
    ],
    palette: [
      { hex: "#a47148", name: "Amber Brass · HV-1521", surface: "Veranda walls" },
      { hex: "#2c1d12", name: "Walnut · HV-1718", surface: "Rail & posts" },
    ],
    stats: [["Lights tested", "noon · dusk"], ["Photo to preview", "19 s"], ["Surfaces", "3 walls · rail"]],
  },
  {
    slug: "oxblood-library",
    title: "Oxblood Library",
    category: "Library",
    location: "Mysuru",
    year: "2026",
    code: "HV-1109",
    shadeName: "Oxblood",
    swatch: "#7a3a2f",
    tone: "oxblood",
    beforeTone: "ivory",
    credit: "Previewed at the counter · Mysuru",
    aspect: "4 / 5",
    blurb: "A reading room taken two shades darker than anyone dared suggest out loud.",
    story: [
      "The owner wanted drama and the family wanted safety. The compromise was a preview: the oxblood applied to the shelved wall only, the rest of the room left in its existing cream.",
      "Seen rather than imagined, the dark wall stopped being a risk. The books did the decorating; the wall did the depth.",
    ],
    palette: [
      { hex: "#7a3a2f", name: "Oxblood · HV-1109", surface: "Shelf wall" },
      { hex: "#e8dfd2", name: "Cotton · HV-2014", surface: "Walls" },
    ],
    stats: [["Surfaces", "1 wall"], ["Photo to preview", "17 s"], ["Family vote", "unanimous"]],
  },
  {
    slug: "midnight-indigo",
    title: "Midnight Indigo",
    category: "Façade",
    location: "Mumbai",
    year: "2025",
    code: "HV-1212",
    shadeName: "Midnight Indigo",
    swatch: "#3a4870",
    tone: "indigo",
    beforeTone: "slate",
    credit: "Specified by the contractor · approved via shared link",
    aspect: "16 / 10",
    blurb: "A street-facing façade previewed at scale — indigo against Mumbai's monsoon sky.",
    story: [
      "A façade is public. The building's committee needed more than a 2-inch shade card to agree on indigo, so the contractor previewed the whole elevation from a single photograph.",
      "Seven members, one link, no meeting. The indigo carried the vote and the repaint started within the week.",
    ],
    palette: [
      { hex: "#3a4870", name: "Midnight Indigo · HV-1212", surface: "Façade" },
      { hex: "#d9d9d4", name: "Fog · HV-2104", surface: "Bands & sills" },
    ],
    stats: [["Committee votes", "7 / 7"], ["Elevation", "G + 3"], ["Decided", "one week"]],
  },
  {
    slug: "ivory-drawing-room",
    title: "Ivory Drawing Room",
    category: "Drawing room",
    location: "India",
    year: "2025",
    code: "HV-2001",
    shadeName: "Ivory",
    swatch: "#f0ead9",
    tone: "ivory",
    beforeTone: "walnut",
    credit: "Previewed at the counter · India",
    aspect: "1 / 1",
    blurb: "Proof that the quietest colour is still a decision — ivory chosen over eleven rivals.",
    story: [
      "White is never just white. The room's brass fittings pulled some ivories yellow and pushed others grey; on the customer's photograph each candidate showed its bias immediately.",
      "HV-2001 sat exactly between — warm against the brass, clean against the floor. Eleven shades auditioned; one was painted.",
    ],
    palette: [
      { hex: "#f0ead9", name: "Ivory · HV-2001", surface: "Walls & ceiling" },
      { hex: "#b89968", name: "Brass · HV-1520", surface: "Accents kept" },
    ],
    stats: [["Ivories compared", "11"], ["Photo to preview", "15 s"], ["Repaint requests", "none"]],
  },
  {
    slug: "walnut-study",
    title: "Walnut Study",
    category: "Study",
    location: "Kolhapur",
    year: "2025",
    code: "HV-1718",
    shadeName: "Walnut",
    swatch: "#7a5a3f",
    tone: "walnut",
    beforeTone: "ivory",
    credit: "Previewed at the counter · Kolhapur",
    aspect: "1 / 1",
    blurb: "A work-from-home study tuned for video calls — walnut behind the desk, matte everywhere.",
    story: [
      "The owner's one requirement was how the wall read on camera. We previewed the walnut, then screenshotted the preview inside a video-call window to check it against his face in daylight.",
      "Flat, warm, no glare. The finish was specified matte from the preview notes, and the painter never had to guess.",
    ],
    palette: [
      { hex: "#7a5a3f", name: "Walnut · HV-1718", surface: "Desk wall" },
      { hex: "#cdb9a0", name: "Bisque · HV-1923", surface: "Walls" },
    ],
    stats: [["Surfaces", "1 wall"], ["Finish", "matte"], ["Decided", "same visit"]],
  },
  {
    slug: "adobe-table",
    title: "Adobe Table",
    category: "Dining",
    location: "Goa",
    year: "2025",
    code: "HV-1418",
    shadeName: "Adobe",
    swatch: "#c87a55",
    tone: "terracotta",
    beforeTone: "sage",
    credit: "Found with the colour finder · previewed at the counter",
    aspect: "4 / 5",
    blurb: "A dining room that borrowed its colour from the laterite outside the window.",
    story: [
      "The house sits on Goan laterite, and the owners wanted the dining room to continue the ground. The adobe shade was found with the colour finder — sampled straight from a photograph of the soil.",
      "From sampled pixel to catalogue code in one click, then onto the dining-room wall in the next. The room and the land now share a palette.",
    ],
    palette: [
      { hex: "#c87a55", name: "Adobe · HV-1418", surface: "Dining wall" },
      { hex: "#f0ead9", name: "Ivory · HV-2001", surface: "Walls & trim" },
    ],
    stats: [["Found via", "colour finder"], ["Match", "exact code found"], ["Decided", "same visit"]],
  },
  {
    slug: "eucalypt-nursery",
    title: "Eucalypt Nursery",
    category: "Nursery",
    location: "Bengaluru",
    year: "2025",
    code: "HV-1624",
    shadeName: "Eucalypt",
    swatch: "#a9b8a4",
    tone: "sage",
    beforeTone: "ivory",
    credit: "Previewed at the counter · Bengaluru",
    aspect: "4 / 5",
    blurb: "A nursery painted once, correctly — soft eucalypt checked against morning and night-lamp light.",
    story: [
      "New parents do not repaint. The eucalypt was previewed twice — in the room's bright morning and again under the warm night lamp — to make sure it stayed gentle in both.",
      "It did, and the second coat went on before the crib arrived. The saved project is waiting for the inevitable repaint, years from now.",
    ],
    palette: [
      { hex: "#a9b8a4", name: "Eucalypt · HV-1624", surface: "Walls" },
      { hex: "#f0ead9", name: "Ivory · HV-2001", surface: "Ceiling & trim" },
    ],
    stats: [["Lights tested", "morning · lamp"], ["Photo to preview", "16 s"], ["Coats", "2"]],
  },
  {
    slug: "minuit-bar",
    title: "Minuit Bar",
    category: "Commercial",
    location: "Hyderabad",
    year: "2025",
    code: "HV-0102",
    shadeName: "Ink",
    swatch: "#1d1d1c",
    tone: "ink",
    beforeTone: "oxblood",
    credit: "Specified by the designer · previewed via shared link",
    aspect: "4 / 5",
    blurb: "A bar interior signed off by an owner abroad — near-black walls, zero test patches.",
    story: [
      "The owner was in Dubai; the bar was in Hyderabad; the opening date was fixed. The designer previewed the near-black against the bar's existing brass and timber from site photos and shared a single link.",
      "Approval came back in an hour, across a timezone, without one test patch on the wall. The painters worked nights and hit the date.",
    ],
    palette: [
      { hex: "#1d1d1c", name: "Ink · HV-0102", surface: "Walls & ceiling" },
      { hex: "#b89968", name: "Brass · HV-1520", surface: "Bar front kept" },
    ],
    stats: [["Approved from", "Dubai"], ["Test patches", "none"], ["Opened", "on date"]],
  },
];

export function getWork(slug: string): WorkProject | undefined {
  return WORKS.find((w) => w.slug === slug);
}

/* getWorkNeighbours() used to live here and has been removed. The portfolio can
   now be either these built-ins or the rooms an admin published, so "the project
   before this one" is a question about whichever list is on the page — a helper
   that could only ever answer it from WORKS would be right half the time and
   silently wrong the rest. /work/[slug] walks the list it rendered. */
