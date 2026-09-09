# Municipal flood response actions

Vocabulary the planner may emit. Every action must be one of these four.

## pump
Deploy portable / mobile pumps at impassable or deep waterlogging.
- Use when severity is `impassable` or `moderate` with rising rain.
- Prefer chronic blackspots and verified citizen reports.
- Assign nearest available pump unit from a depot with clear access.

## desilt
Clear drains, nallas, and choked mouths before or during moderate rain.
- Use when blackspot history cites drainage choke / silt.
- Prefer before peak rain when risk is rising but not yet impassable.

## barricade
Close or divert traffic at dangerous submerged stretches / underpasses.
- Use when severity is `impassable` or route safety is compromised.
- Coordinate with traffic police corridors when known.

## monitor
Watch-and-hold: keep a crew observing without heavy equipment yet.
- Use when risk is elevated but severity is `minor`, or credibility is low.
- Escalate to pump / barricade if verified reports increase or rain intensifies.

## Priority rules (SOP-aligned heuristic)
1. Impassable + verified reports + blackspot → pump (or barricade if no pump free)
2. Moderate + continuing rain + low ground → desilt or pump
3. Minor / low credibility → monitor
4. Never invent actions outside this vocabulary
