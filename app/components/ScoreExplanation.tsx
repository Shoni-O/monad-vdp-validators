import Link from 'next/link';

export default function ScoreExplanation() {
  return (
    <section className="rounded-lg border-2 border-purple-200 bg-purple-50 p-5 text-sm dark:border-purple-800 dark:bg-purple-950">
      <h2 className="mb-3 font-semibold text-purple-900 dark:text-purple-100">About the score</h2>
      <p className="mb-3 text-purple-800 dark:text-purple-200">
        Each validator receives a diversity score from 0–100 based on how unique their
        geographic location and hosting provider are relative to other validators on the
        network. Higher scores indicate better distribution—validators in less common
        countries, cities, or with less common providers score higher.
      </p>
      <p className="text-purple-800 dark:text-purple-200">
        Badges reflect score tiers: <strong>unique</strong> (80+), <strong>ok</strong> (55–79),
        and <strong>saturated</strong> (&lt;55). Values shown as &quot;Unknown&quot; when
        data is missing. For formulas and a worked example, see{' '}
        <Link href="/methodology" className="font-medium text-purple-700 underline hover:text-purple-900 dark:text-purple-400 dark:hover:text-purple-300">
          methodology
        </Link>
        .
      </p>
    </section>
  );
}
