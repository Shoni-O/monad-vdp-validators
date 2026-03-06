import Link from 'next/link';

export const metadata = {
  title: 'Methodology | Monad Validators',
  description: 'How validator diversity scores are computed',
};

export default function MethodologyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <header>
        <Link
          href="/"
          className="mb-4 inline-block text-sm text-purple-600 hover:text-purple-800"
        >
          ← Back to validators
        </Link>
        <h1 className="text-2xl font-semibold text-purple-900">Score methodology</h1>
      </header>

      <section>
        <h2 className="mb-2 text-lg font-medium text-purple-800">What the score means</h2>
        <p className="text-purple-800">
          The diversity score (0–100) measures how well a validator contributes to network
          decentralization. It combines geographic diversity (country and city) with
          infrastructure diversity (hosting provider). Less saturated locations and
          providers receive higher scores.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium text-purple-800">Input fields used</h2>
        <ul className="list-inside list-disc space-y-1 text-purple-800">
          <li><strong>Country</strong> — from validator-info metadata or IP geolocation</li>
          <li><strong>City</strong> — from validator-info metadata or IP geolocation</li>
          <li><strong>Provider</strong> — hosting provider, from metadata or IP org/hostname</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium text-purple-800">Logarithmic penalty</h2>
        <p className="mb-2 text-purple-800">
          Each field is penalized based on how many other validators share the same value.
          The penalty uses the natural logarithm so that going from 1→2 validators has a
          small impact, while 10→100 has diminishing additional impact.
        </p>
        <p className="text-purple-800">
          Penalty = log(max(1, count)). For example: count 1 → 0, count 2 → 0.69,
          count 10 → 2.30, count 100 → 4.61.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium text-purple-800">Formulas</h2>
        <pre className="overflow-x-auto rounded-lg border-2 border-purple-200 bg-purple-50 p-4 text-sm text-purple-900">
{`geoPenalty     = log(countryCount) × 14 + log(cityCount) × 6
providerPenalty = log(providerCount) × 18

geoScore     = clamp(100 - geoPenalty, 0, 100)
providerScore = clamp(100 - providerPenalty, 0, 100)

total        = clamp(geoScore × 0.55 + providerScore × 0.45, 0, 100)`}
        </pre>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium text-purple-800">Worked example</h2>
        <p className="mb-2 text-purple-800">
          Fictional validator &quot;Acme Staking&quot; in Germany, Berlin, provider AWS.
          Assume: 20 validators in Germany, 5 in Berlin, 15 on AWS.
        </p>
        <pre className="mb-2 overflow-x-auto rounded-lg border-2 border-purple-200 bg-purple-50 p-4 text-sm text-purple-900">
{`geoPenalty = log(20)×14 + log(5)×6 = 2.996×14 + 1.609×6 ≈ 41.93 + 9.65 ≈ 51.6
providerPenalty = log(15)×18 ≈ 2.708×18 ≈ 48.7

geoScore = 100 - 51.6 ≈ 48
providerScore = 100 - 48.7 ≈ 51

total = 48×0.55 + 51×0.45 ≈ 26.4 + 23.0 ≈ 49 → badge: saturated`}
        </pre>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium text-purple-800">Badge interpretation</h2>
        <ul className="space-y-1 text-purple-800">
          <li><strong>unique</strong> — score ≥ 80. Strong diversity contribution.</li>
          <li><strong>ok</strong> — score 55–79. Moderate diversity.</li>
          <li><strong>saturated</strong> — score &lt; 55. Overlapping with many others.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium text-purple-800">Unknown values</h2>
        <p className="text-purple-800">
          Missing country, city, or provider is treated as &quot;Unknown&quot; and counted
          as a single shared value. Validators with Unknown in multiple fields typically
          receive lower scores because many validators may share the same Unknown bucket.
        </p>
      </section>

      <footer className="pt-4">
        <Link href="/" className="text-sm text-purple-600 hover:text-purple-800">
          ← Back to validators
        </Link>
      </footer>
    </main>
  );
}
