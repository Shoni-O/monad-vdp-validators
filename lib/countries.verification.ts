/**
 * Verification script for Netherlands country normalization fix
 * Run with: node --require ts-node/register lib/countries.verification.ts
 * Or test in browser console after importing
 */

import { normalizeCountry } from './countries';

const testCases: Array<{ input: string | null | undefined; expected: string; description: string }> = [
  // NL variants
  { input: 'NL', expected: 'Netherlands', description: 'ISO2 code NL (uppercase)' },
  { input: 'nl', expected: 'Netherlands', description: 'ISO2 code nl (lowercase)' },

  // NLD variants
  { input: 'NLD', expected: 'Netherlands', description: 'ISO3 code NLD (uppercase)' },
  { input: 'nld', expected: 'Netherlands', description: 'ISO3 code nld (lowercase)' },

  // Full names
  { input: 'Netherlands', expected: 'Netherlands', description: 'Full name Netherlands' },
  { input: 'netherlands', expected: 'Netherlands', description: 'Full name netherlands (lowercase)' },

  // Variants
  { input: 'The Netherlands', expected: 'Netherlands', description: 'Variant: The Netherlands' },
  { input: 'the netherlands', expected: 'Netherlands', description: 'Variant: the netherlands' },
  { input: 'Holland', expected: 'Netherlands', description: 'Variant: Holland' },
  { input: 'holland', expected: 'Netherlands', description: 'Variant: holland' },
  { input: 'Dutch', expected: 'Netherlands', description: 'Variant: Dutch' },
  { input: 'dutch', expected: 'Netherlands', description: 'Variant: dutch' },

  // Whitespace
  { input: '  NL  ', expected: 'Netherlands', description: 'NL with whitespace' },
  { input: '\tNLD\n', expected: 'Netherlands', description: 'NLD with tabs/newlines' },
  { input: '  The Netherlands  ', expected: 'Netherlands', description: 'The Netherlands with whitespace' },

  // Other countries (regression tests)
  { input: 'DE', expected: 'Germany', description: 'Other country: DE' },
  { input: 'DEU', expected: 'Germany', description: 'Other country: DEU (3-letter)' },
  { input: 'US', expected: 'United States', description: 'Other country: US' },
  { input: 'USA', expected: 'United States', description: 'Other country: USA (3-letter)' },
  { input: 'GB', expected: 'United Kingdom', description: 'Other country: GB' },
  { input: 'GBR', expected: 'United Kingdom', description: 'Other country: GBR (3-letter)' },

  // Edge cases
  { input: null, expected: 'Unknown', description: 'null input' },
  { input: undefined, expected: 'Unknown', description: 'undefined input' },
  { input: '', expected: 'Unknown', description: 'empty string' },
  { input: '   ', expected: 'Unknown', description: 'whitespace only' },
  { input: 'XYZ', expected: 'Unknown', description: 'unmapped value' },
];

function runVerification() {
  console.log('🧪 Netherlands Country Normalization Verification\n');

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = normalizeCountry(testCase.input);
    const isPass = result === testCase.expected;

    if (isPass) {
      passed++;
      console.log(`✅ PASS: ${testCase.description}`);
      console.log(`   Input: ${JSON.stringify(testCase.input)} => Output: "${result}"\n`);
    } else {
      failed++;
      console.log(`❌ FAIL: ${testCase.description}`);
      console.log(`   Input: ${JSON.stringify(testCase.input)}`);
      console.log(`   Expected: "${testCase.expected}"\n   Got:      "${result}"\n`);
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);

  if (failed === 0) {
    console.log('🎉 All tests passed! Netherlands parsing is fixed.\n');
  } else {
    console.log(`❌ ${failed} test(s) failed. Please review the implementation.\n`);
  }

  return failed === 0;
}

if (typeof module !== 'undefined' && require.main === module) {
  runVerification();
}

export { runVerification };
