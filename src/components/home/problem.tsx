/**
 * The hinge of the page: the reason the rest of it exists.
 *
 * This sat at position ten, under the heading "What shops say", as a centred
 * pull-quote with a mono label over it. Both were wrong. It is not a
 * testimonial — nobody said it — and a page cannot show the answer for eight
 * sections and then explain the question. It now runs second, where the
 * argument needs it.
 *
 * Set left against a rule rather than centred. The hero above it and the
 * closing below it are both centred, and a third centred block between them is
 * how a long page turns into one column of symmetrical slabs; the change of
 * axis is what makes this read as an aside in the argument rather than another
 * band of the brochure.
 */
export function Problem() {
  return (
    <section className="hv-problem band-tight" aria-label="The problem this solves">
      <div className="hv-problem-inner reveal">
        {/* No invented numbers. This used to open "Two of every five walk-ins end
            with 'let me think'" — a statistic with no study behind it, printed as
            fact. The difficulty it describes is real and needs no figure. */}
        <p className="hv-problem-quote">
          A shade card is small. A wall is not.
        </p>
        <p className="hv-problem-line">
          Which is why most customers leave saying <i>let me think</i> — and why so
          few of them come back. Show them the room first.
        </p>
      </div>
    </section>
  );
}
