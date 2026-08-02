const BYE = null

/**
 * Round-robin pairing (circle method).
 *
 * Every pair meets once before any pair repeats. With an odd number of
 * fighters a BYE is added, so exactly one fighter sits out each round.
 * Returns a flat list of matches in the order they should be fought.
 */
export function buildRoundRobin(names) {
  const fighters = names.filter((n) => n.trim().length > 0)
  if (fighters.length < 2) return []

  const seats = [...fighters]
  if (seats.length % 2 === 1) seats.push(BYE)

  // Seed the circle so the opening match is fighter 1 vs fighter 2, which reads
  // more naturally than the raw circle-method order. Every pairing still
  // appears exactly once.
  if (seats.length >= 4) {
    const [first, second, ...rest] = seats
    seats.splice(0, seats.length, first, ...rest, second)
  }

  const n = seats.length
  const half = n / 2
  let ring = [...seats]
  const matches = []

  for (let session = 0; session < n - 1; session++) {
    for (let i = 0; i < half; i++) {
      const red = ring[i]
      const blue = ring[n - 1 - i]
      if (red !== BYE && blue !== BYE) matches.push({ red, blue })
    }
    // Seat 0 stays put, everyone else rotates one place clockwise.
    ring = [ring[0], ring[n - 1], ...ring.slice(1, n - 1)]
  }

  return matches
}

/**
 * The match for a given round index, cycling through the schedule when there
 * are more rounds than distinct pairings.
 */
export function matchForRound(matches, roundIndex) {
  if (matches.length === 0) return null
  return matches[roundIndex % matches.length]
}

/** Fighters not in the ring this round. */
export function sittingOut(names, match) {
  if (!match) return []
  return names.filter((n) => n.trim() && n !== match.red && n !== match.blue)
}
