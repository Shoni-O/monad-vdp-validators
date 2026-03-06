import Link from 'next/link';

export default function ScoreExplanation() {
  return (
    <section className="rounded-lg border border-purple-200 bg-white p-5 text-sm dark:border-purple-700 dark:bg-purple-950">
      <h2 className="mb-3 font-semibold text-purple-900 dark:text-white">About the score</h2>
      <p className="mb-3 text-purple-800 dark:text-purple-100">
        Each validator receives a diversity score from 0–100 based on how unique their
        geographic location and hosting provider are relative to other validators on the
        network. Higher scores indicate better distribution—validators in less common
        countries, cities, or with less common providers score higher.
      </p>
      <p className="text-purple-800 dark:text-purple-100">
        Badges reflect score tiers: <strong>unique</strong> (80+), <strong>ok</strong> (55–79),
        and <strong>saturated</strong> (&lt;55). Values shown as &quot;Unknown&quot; when
        data is missing. For formulas and a worked example, see{' '}
        <Link href="/methodology" className="font-medium text-purple-600 underline hover:text-purple-900 dark:text-purple-300 dark:hover:text-purple-100">
          methodology
        </Link>
        .
      </p>
    </section>
  );
}
