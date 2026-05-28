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
  { num: "XVII.", category: "Essays", title: <>The colour of an <i>Indian afternoon.</i></>, meta: "By Ananya R. · 10 min", date: "May MMXXVI" },
  { num: "XVI.", category: "Case studies", title: <>From <i>let me think</i> to <i>same afternoon</i> — Sharda Paints, four months in.</>, meta: "With Suresh K. · 8 min", date: "May MMXXVI" },
  { num: "XV.", category: "Engineering", title: <>Why we don't <i>generate</i> rooms — we recolour them.</>, meta: "By the engineering desk · 12 min", date: "Apr MMXXVI" },
  { num: "XIV.", category: "Essays", title: <>A small history of the <i>tinting machine.</i></>, meta: "By Vikram J. · 14 min", date: "Apr MMXXVI" },
  { num: "XIII.", category: "Field notes", title: <>Notes from the pilot · <i>twelve cities, twelve counters.</i></>, meta: "From the field desk · 7 min", date: "Mar MMXXVI" },
  { num: "XII.", category: "Press", title: <>HueVista featured in <i>The Hindu BusinessLine</i>.</>, meta: "Press · 3 min", date: "Mar MMXXVI" },
  { num: "XI.", category: "Engineering", title: <>The <i>ΔE problem</i>, or why approximate isn't good enough.</>, meta: "By the engineering desk · 9 min", date: "Feb MMXXVI" },
  { num: "X.", category: "Essays", title: <>On the quiet dignity of a <i>repaint-free job.</i></>, meta: "By Ananya R. · 6 min", date: "Feb MMXXVI" },
  { num: "IX.", category: "Field notes", title: <>A field note from a <i>Mangalore monsoon.</i></>, meta: "From the field desk · 5 min", date: "Jan MMXXVI" },
  { num: "VIII.", category: "Essays", title: <>Why we begin <i>with the retailer</i> — and not the consumer.</>, meta: "A founding letter · 11 min", date: "Dec MMXXV" },
];
