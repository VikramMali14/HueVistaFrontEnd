import type { ReactNode } from "react";

export type JournalCategory = "All" | "Essays" | "Case studies" | "Field notes" | "Press" | "Engineering";

export interface JournalEntry {
  num: string;
  category: Exclude<JournalCategory, "All">;
  title: ReactNode;
  meta: string;
  date: string;
}

export const ENTRIES: ReadonlyArray<JournalEntry> = [
  { num: "17", category: "Essays", title: <>The colour of an <i>Indian afternoon.</i></>, meta: "By Ananya R. · 10 min", date: "May 2026" },
  { num: "16", category: "Case studies", title: <>From <i>let me think</i> to <i>same afternoon</i> — one counter, four months in.</>, meta: "From the field desk · 8 min", date: "May 2026" },
  { num: "15", category: "Engineering", title: <>Why we don't <i>generate</i> rooms — we recolour them.</>, meta: "By the engineering desk · 12 min", date: "Apr 2026" },
  { num: "14", category: "Essays", title: <>A small history of the <i>tinting machine.</i></>, meta: "By Vikram J. · 14 min", date: "Apr 2026" },
  { num: "13", category: "Field notes", title: <>Notes from the pilot · <i>twelve cities, twelve counters.</i></>, meta: "From the field desk · 7 min", date: "Mar 2026" },
  { num: "12", category: "Field notes", title: <>Counter notes · <i>what walk-ins ask first.</i></>, meta: "From the field desk · 4 min", date: "Mar 2026" },
  { num: "11", category: "Engineering", title: <>The <i>ΔE problem</i>, or why approximate isn't good enough.</>, meta: "By the engineering desk · 9 min", date: "Feb 2026" },
  { num: "10", category: "Essays", title: <>On the quiet dignity of a <i>repaint-free job.</i></>, meta: "By Ananya R. · 6 min", date: "Feb 2026" },
  { num: "9", category: "Field notes", title: <>A field note from a <i>Mangalore monsoon.</i></>, meta: "From the field desk · 5 min", date: "Jan 2026" },
  { num: "8", category: "Essays", title: <>Why we begin <i>with the retailer</i> — and not the consumer.</>, meta: "A founding letter · 11 min", date: "Dec 2025" },
];
