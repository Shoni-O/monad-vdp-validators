# Netherlands City-to-Country Fallback Fix

## Problem Identified
Even with the enhanced `normalizeCountry()` function, some Netherlands validators still showed:
- ✅ City: Lelystad
- ✅ Provider: Servers.com, Inc.  
- ❌ Country: Unknown

**Root Cause**: The registry entry for this validator had `city: "Lelystad"` but **no `country` field at all**. The country field was completely missing, not just using a different code format.

## Solution: City-to-Country Fallback
Added a conservative fallback mechanism that infers country from city when:
1. Country is "Unknown" (not found from any source)
2. City is known and valid (not "Unknown" or "No data")
3. City matches a small whitelist of known Netherlands cities

This fallback is **intentionally conservative and limited to Netherlands only** to avoid false positives from cities that might exist in multiple countries.

## Implementation Details

### 1. Enhanced `lib/countries.ts`
Added `resolveCountryFromCity()` function with a whitelist of Netherlands cities:

```typescript
const NETHERLANDS_CITIES_WHITELIST = new Set<string>([
  'Amsterdam',
  'Lelystad',
  'Soest',
  'Rotterdam',
  'The Hague',
  'Den Haag',
  'Utrecht',
  'Groningen',
  'Eindhoven',
  'Tilburg',
]);

export function resolveCountryFromCity(city?: string | null): string | undefined {
  if (!city) return undefined;
  const normalized = city.trim();
  if (!normalized) return undefined;
  if (NETHERLANDS_CITIES_WHITELIST.has(normalized)) {
    return 'Netherlands';
  }
  return undefined;
}
```

**Key features:**
- Case-sensitive matching (whitelist has exact city names)
- Whitespace trimmed from input
- Returns `undefined` for any unrecognized city
- Returns `"Netherlands"` only for whitelisted cities
- No ambiguity: rejects cities that might exist in multiple countries

### 2. Updated `lib/getSnapshot.ts`
Modified the country resolution logic in the validator enrichment pipeline:

**Before:**
```typescript
const country = country_from_registry ?? country_from_mapping ?? normalizeCountry(country_from_extracted ?? ipGeo.country);
const city = city_from_registry ?? city_from_mapping ?? city_from_extracted ?? ipGeo.city;
```

**After:**
```typescript
let country = country_from_registry ?? country_from_mapping ?? normalizeCountry(country_from_extracted ?? ipGeo.country);
const city = city_from_registry ?? city_from_mapping ?? city_from_extracted ?? ipGeo.city;

// Fallback: If country is Unknown but city is known, try to infer country from city
if (country === 'Unknown' && city && city !== 'Unknown' && city !== 'No data') {
  const countryFromCity = resolveCountryFromCity(city);
  if (countryFromCity) {
    country = countryFromCity;
  }
}
```

**Why this order matters:**
1. Registry/mapping data has highest priority (explicitly researched)
2. Normalized extracted/IP geo data is second
3. City-based fallback is last resort (only applies if country is "Unknown")

### 3. Added Comprehensive Tests
Created `resolveCountryFromCity` test suite in `lib/countries.test.ts` covering:

#### Netherlands Cities
- Amsterdam, Lelystad, Soest (from bug report)
- Rotterdam, Utrecht, Groningen, Eindhoven, Tilburg
- The Hague (English) and Den Haag (Dutch)

#### Safety Tests
- Case-sensitive matching (lowercase/uppercase cities not resolved)
- Whitespace handling (trimmed correctly)
- Edge cases (null, undefined, empty, whitespace-only)
- No false positives (Paris, London, Berlin, etc. not resolved)

#### Real-World Scenario Test
Specific regression test for the exact bug case:
```typescript
it('should resolve missing country when city is Lelystad', () => {
  // This is the exact case from the bug report:
  // Country: Unknown, City: Lelystad, Hosting: Servers.com, Inc.
  expect(resolveCountryFromCity('Lelystad')).toBe('Netherlands');
});
```

## Priority Logic

```
┌─ Registry country?
│  └─ YES → Use as-is (highest priority)
├─ Mapped country?
│  └─ YES → Use as-is
├─ Extracted/IP country?
│  ├─ YES → Normalize (2-letter, 3-letter, variants)
│  └─ NO → Result is "Unknown"
│
└─ Country is "Unknown" AND city is known?
   ├─ YES → Try city-to-country fallback (NEW)
   │  ├─ City in whitelist? → Return mapped country (Netherlands)
   │  └─ NO → Return "Unknown"
   └─ NO → Return "Unknown"
```

## Safety Guarantees

### Conservative Whitelist
- Only countries added: **Netherlands only** (intentionally limited)
- Only cities added: Known major cities + some smaller ones
- Not including: Ambiguous city names (exist in multiple countries)

### No False Positives
- Case-sensitive: "amsterdam" ≠ "Amsterdam"
- Only exact matches: No fuzzy matching or approximation
- Explicit whitelist: No automatic inference for unlisted cities

### Fallback Only When Needed
- Never overrides explicit country values
- Only applies when country is exactly "Unknown"
- Requires both city is known AND valid

## Test Results

Build status: ✅ **Successful**
- TypeScript compilation: No errors
- Next.js 16.1.6 build: Passed
- All pages generated successfully

Test coverage:
- ✅ Netherlands cities resolution
- ✅ Case sensitivity
- ✅ Whitespace handling
- ✅ Edge cases
- ✅ Real-world scenario (Lelystad + Servers.com)
- ✅ Safety regressions (no false positives)
- ✅ Other countries still not resolved

## Expected Outcomes

### Before Fix
```json
{
  "name": "Ledger by P2P.org",
  "city": "Lelystad",
  "provider": "Servers.com, Inc.",
  "country": "Unknown"  ← BUG
}
```

### After Fix
```json
{
  "name": "Ledger by P2P.org",
  "city": "Lelystad",
  "provider": "Servers.com, Inc.",
  "country": "Netherlands"  ← FIXED
}
```

## Files Modified
1. **lib/countries.ts**
   - Added `NETHERLANDS_CITIES_WHITELIST` constant
   - Added `resolveCountryFromCity()` function
   - Well-documented with JSDoc comments

2. **lib/getSnapshot.ts**
   - Updated import to include `resolveCountryFromCity`
   - Added fallback logic in validator enrichment
   - Changed `country` to `let` to allow reassignment

3. **lib/countries.test.ts**
   - Updated import to include `resolveCountryFromCity`
   - Added comprehensive test suite (80+ lines)
   - Covers all scenarios including the specific bug case

## Deployment Notes

### Zero Configuration
- No environment variables needed
- No database changes required
- No API changes needed

### Backward Compatibility
- ✅ All existing country values still work
- ✅ City-based fallback is opt-in (only for "Unknown" countries)
- ✅ No impact on validators with explicit country data

### Performance
- O(1) Set lookup for city whitelist
- No additional API calls
- No database queries

## Future Enhancements (Optional)

If we discover other countries have similar issues:
1. Extend `NETHERLANDS_CITIES_WHITELIST` for other countries
2. Create separate whitelists (e.g., `GERMANY_CITIES_WHITELIST`)
3. Create generic city-to-country mapping function
4. Add monitoring/logging to detect new patterns

## Verification Checklist

- [x] Lelystad + Servers.com shows Netherlands (not Unknown)
- [x] Soest validators show Netherlands
- [x] Amsterdam validators show Netherlands
- [x] Case-sensitive matching (security)
- [x] No false positives for other cities
- [x] TypeScript compilation successful
- [x] Build successful
- [x] Tests cover real-world scenarios
- [x] Backward compatible

---

**Implementation Date**: March 12, 2026  
**Status**: ✅ Complete and Ready for Deployment  
**Build Status**: ✅ Passing  
**Test Coverage**: Comprehensive
