import { describe, it, expect } from "vitest";
import type { PublishedProject } from "@/lib/free-projects-server";
import { workCardOf, workDetailOf } from "@/lib/work-published";

/**
 * A published room, as "Our work" shows it.
 *
 * The rule being pinned is that a room can go on the portfolio with nothing
 * written about it. An admin picks a destination and presses publish; the story,
 * the location, the credit line are all things they may add next week or never.
 * So every field the page prints has to come from somewhere the room already
 * has — the photograph, the shades on its walls, the kind of room it is — and
 * the editorial fields only override.
 *
 * The other half is the palette. It is read off the walls in the picture and is
 * the one thing on that page nobody can type, because the whole claim of the
 * site is that these are real, orderable shade codes.
 */
function room(overrides: Partial<PublishedProject> = {}): PublishedProject {
  return {
    slug: "sunlit-hall",
    title: "Sunlit hall",
    description: null,
    space: "INTERIOR",
    roomLabel: "Living room",
    imageUrl: "https://media.example.com/free-projects/sunlit-hall/source.jpg",
    imageWidth: 1600,
    imageHeight: 1200,
    wallCount: 2,
    colours: [
      { label: "Main wall", hex: "#9D5236", shadeCode: "HV-1410" },
      { label: "Trim", hex: "#F0EAD9", shadeCode: "HV-2001" },
    ],
    publishedAt: "2026-04-11T09:30:00",
    onGallery: false,
    onWork: true,
    location: null,
    projectYear: null,
    credit: null,
    blurb: null,
    story: [],
    stats: [],
    ...overrides,
  };
}

describe("a published room as a work card", () => {
  it("carries the photograph, which is what makes it different from the built-ins", () => {
    const card = workCardOf(room());
    expect(card.imageUrl).toBe("https://media.example.com/free-projects/sunlit-hall/source.jpg");
    expect(card.aspect).toBe("1600 / 1200");
  });

  it("leads with the catalogue code and says how many others there are", () => {
    expect(workCardOf(room()).code).toBe("HV-1410 · +1 more");
  });

  it("says what it does have when the walls were painted freehand", () => {
    const card = workCardOf(room({
      colours: [{ label: "Main wall", hex: "#9D5236", shadeCode: null }],
      wallCount: 3,
    }));
    expect(card.code).toBe("3 surfaces");
  });

  it("falls back to the room type and the publish year when neither was written", () => {
    const card = workCardOf(room());
    expect(card.location).toBe("Living room");
    expect(card.year).toBe("2026");
  });

  it("prefers what the admin wrote over what it can infer", () => {
    const card = workCardOf(room({ location: "Pune", projectYear: "Winter 2025" }));
    expect(card.location).toBe("Pune");
    expect(card.year).toBe("Winter 2025");
  });

  it("still has an aspect ratio when the photo's dimensions were never recorded", () => {
    expect(workCardOf(room({ imageWidth: null, imageHeight: null })).aspect).toBe("4 / 3");
  });
});

describe("a published room as its own page", () => {
  it("builds the palette from the shades actually on the walls", () => {
    expect(workDetailOf(room()).palette).toEqual([
      { hex: "#9D5236", name: "HV-1410", surface: "Main wall" },
      { hex: "#F0EAD9", name: "HV-2001", surface: "Trim" },
    ]);
  });

  it("writes its own lead when nobody wrote one", () => {
    const detail = workDetailOf(room());
    expect(detail.blurb).toContain("Living room");
    expect(detail.blurb).toContain("2 surfaces");
  });

  it("takes the description as the lead before inventing one", () => {
    expect(workDetailOf(room({ description: "South-facing, one accent wall." })).blurb)
      .toBe("South-facing, one accent wall.");
  });

  it("leaves the story and the numbers empty rather than filling them in", () => {
    const detail = workDetailOf(room());
    expect(detail.story).toEqual([]);
    expect(detail.stats).toEqual([]);
    expect(detail.credit).toBe("");
  });

  it("passes the story and numbers through when they were written", () => {
    const detail = workDetailOf(room({
      story: ["They arrived with a phone photo.", "The rust held its depth."],
      stats: [{ label: "Surfaces", value: "4 walls" }, { label: "Decided", value: "same visit" }],
      credit: "Previewed at the counter · Pune",
    }));
    expect(detail.story).toHaveLength(2);
    expect(detail.stats).toEqual([["Surfaces", "4 walls"], ["Decided", "same visit"]]);
    expect(detail.credit).toBe("Previewed at the counter · Pune");
  });

  /**
   * The built-ins prove the point by dragging between a before and an after.
   * A published room has one photograph — the finished wall — so its page must
   * not claim a "before" it never had.
   */
  it("has no before-tone, so its page shows the photograph instead of a comparison", () => {
    expect(workDetailOf(room()).beforeTone).toBeUndefined();
  });
});
