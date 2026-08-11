/**
 * The free plan, in the words and numbers the site is allowed to use about it.
 *
 * This replaces `lib/trial.ts`. The free tier used to be a seven-day trial, and the
 * length of that window was the thing every page had to agree on — it had already
 * drifted once (the homepage said fourteen days while the backend granted seven), which
 * is why the constant existed at all. There is no window any more: the plan renews, so
 * what pages have to agree on is the ALLOWANCE and the fact that it comes back.
 *
 * Mirrors `Plan.FREE` on the backend, which is what actually decides all of it. Anything
 * user-facing that states what the free plan includes should read from here rather than
 * spelling a number out.
 */

/** Complete projects the free plan includes each month. */
export const FREE_PLAN_PROJECTS = 2;

/** The same number spelled out, for headings that set figures in words. */
export const FREE_PLAN_PROJECTS_WORD = "Two";

/** What one extra project costs once the free month is spent — the dearest rate on the
 *  ladder, which is what makes subscribing the cheaper way to buy volume. */
export const FREE_PLAN_EXTRA_PROJECT_RUPEES = 199;
export const FREE_PLAN_EXTRA_PROJECT_POINTS = 80;

/**
 * The one-line promise, for marquees and stat rows.
 *
 * Deliberately says "every month" rather than a total: the whole difference between this
 * and the trial it replaced is that the number comes back.
 */
export const FREE_PLAN_LINE = `${FREE_PLAN_PROJECTS} projects every month · free · no card`;
