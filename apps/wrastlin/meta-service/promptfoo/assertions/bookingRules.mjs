/**
 * promptfoo JavaScript assertion for show-outline structural rules.
 *
 * Signature: (output: string, context: { vars: Record<string, string> })
 *   => { pass: boolean, score: number, reason: string }
 *
 * Checks:
 *  - Output is valid JSON (markdown fences stripped if present)
 *  - Required top-level fields: showId (string), week (number), segments (array)
 *  - 3–5 segments total
 *  - At least 1 promo, at least 2 matches
 *  - Exactly 1 headliner: true match
 *  - Headliner is the last segment
 *  - Match participants are array-of-arrays: [["w-001"], ["w-002"]]
 *  - No wrestler ID appears in more than one match
 */
export default function bookingRules(output, _context) {
  const failures = [];

  // Strip markdown fences if present
  const cleaned = output
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return { pass: false, score: 0, reason: `Output is not valid JSON: ${e.message}` };
  }

  // Required top-level fields
  if (typeof parsed.showId !== 'string' || !parsed.showId) {
    failures.push('Missing or invalid showId (must be a non-empty string)');
  }
  if (typeof parsed.week !== 'number') {
    failures.push('Missing or invalid week (must be a number)');
  }
  if (!Array.isArray(parsed.segments)) {
    return { pass: false, score: 0, reason: 'Missing segments array' };
  }

  const segments = parsed.segments;

  // 3–5 segments
  if (segments.length < 3 || segments.length > 5) {
    failures.push(`Expected 3–5 segments, got ${segments.length}`);
  }

  const matches = segments.filter(s => s.type === 'match');
  const promos  = segments.filter(s => s.type === 'promo');

  if (promos.length < 1)  failures.push('Must have at least 1 promo');
  if (matches.length < 2) failures.push('Must have at least 2 matches');

  // Exactly one headliner
  const headliners = matches.filter(s => s.headliner === true);
  if (headliners.length !== 1) {
    failures.push(`Expected exactly 1 headliner:true match, got ${headliners.length}`);
  }

  // Headliner must be last segment
  if (headliners.length === 1 && segments[segments.length - 1] !== headliners[0]) {
    failures.push('Headliner must be the last segment');
  }

  // Match participants: array-of-arrays
  for (const match of matches) {
    if (!Array.isArray(match.participants)) {
      failures.push(`Match ${match.segmentId ?? '?'}: participants must be an array`);
      continue;
    }
    for (const team of match.participants) {
      if (!Array.isArray(team)) {
        failures.push(
          `Match ${match.segmentId ?? '?'}: participants must be array-of-arrays e.g. [["w-001"],["w-002"]]`,
        );
        break;
      }
    }
  }

  // No wrestler in more than one match
  const booked = new Set();
  for (const match of matches) {
    if (!Array.isArray(match.participants)) continue;
    for (const team of match.participants) {
      if (!Array.isArray(team)) continue;
      for (const wid of team) {
        if (booked.has(wid)) {
          failures.push(`Wrestler ${wid} is booked in multiple matches`);
        }
        booked.add(wid);
      }
    }
  }

  if (failures.length === 0) {
    return { pass: true, score: 1, reason: 'All structural booking rules passed' };
  }
  return {
    pass: false,
    score: 0,
    reason: `Booking rule violations:\n- ${failures.join('\n- ')}`,
  };
}
