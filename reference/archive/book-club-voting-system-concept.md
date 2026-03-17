# Book Club App — Voting System Concept Plan

## The Problem With Isolated Rounds

The original design treats each voting round as a standalone event: books are proposed, votes are cast, a winner is selected, and everything else evaporates. This means a book that came in second place three months running starts from zero every time. That doesn't match how people actually feel about those books — there's accumulated interest that the system throws away.

---

## The Living Queue

Instead of isolated rounds, the book list is a **persistent, self-curating queue** with momentum. Books enter through proposals, survive through ongoing human interest, and retire when nobody cares anymore. The queue is always visible and always reflects the current state of what the group wants to read.

### How Books Enter the Queue

Any member proposes a book at any time (title, author, optional pitch, cover image via Open Library / Google Books API). The book enters the active queue with zero points and zero votes. It will participate in the next voting round.

### How Voting Rounds Work

A round opens (admin-triggered or on a schedule). Every book on the active queue is eligible. Members cast votes — the voting method (ranked choice or approval) determines how human votes are tallied. When the round closes:

1. **The winner is removed from the queue** and moved to the "reading" or "completed" shelf
2. **Every remaining book is evaluated for survival** based solely on human votes received this round
3. Books with **at least one human vote** survive and carry forward
4. Books with **zero human votes** are retired

### How Carry-Forward Scoring Works

After the winner is removed, the surviving books are **ranked by their human vote count from this round only**. Ties are broken by most recent vote timestamp (the book that got a vote most recently ranks higher).

Based on that ranking, each book receives **seed points** equal to its position from the top:

- If 8 books survived: 1st place gets 8 seed points, 2nd gets 7, ..., 8th gets 1
- If 3 books survived: 1st gets 3, 2nd gets 2, 3rd gets 1

These seed points carry into the next round as **display context** — they show the book's history and relative standing. They affect the default sort order of the queue. But they do **not** factor into survival decisions. Survival is always and only determined by human votes in the current round.

### The Survival Rule (Critical Design Point)

**A book must receive at least one human vote in a round to stay on the active queue.** Seed points from prior rounds do not count. This means:

- A book can have 10 seed points from being a perennial runner-up, but if nobody votes for it this round, it's retired
- A member who really believes in a book can spend a vote on it to keep it alive, even if it won't win — this is a deliberate, meaningful choice
- The queue self-cleans: books that have lost all advocacy naturally fall away without anyone having to make an awkward "let's remove this" decision

### Display Score

On the queue, each book shows a **total score** that combines seed points and current-round human votes:

```
Total Score = Seed Points (from prior rounds) + Human Votes (this round)
```

The display format makes both components visible:

```
The Left Hand of Darkness — 14 pts (6 votes + 8 seed)
Project Hail Mary — 11 pts (4 votes + 7 seed)
Piranesi — 3 pts (3 votes + 0 seed)  ← new proposal, first round
Klara and the Sun — 2 pts (0 votes + 2 seed)  ← ⚠️ at risk of retiring
```

This gives members an at-a-glance sense of both **current enthusiasm** and **historical momentum**. A book with high seed but low current votes is visibly coasting on past interest. A new proposal with no seed but strong votes is clearly a fresh contender.

### Retirement and Re-Addition

When a book gets zero human votes and is retired, it moves to a **retired list** — visible but not part of active voting. Members can browse the retired list and **manually re-add** any book they want back on the active queue. Re-added books return with a seed of 0 (fresh start, no legacy points). They need to earn votes on their own merits.

The retired list serves as:
- A historical record ("we considered these")
- A safety net ("oops, I forgot to vote and it dropped off")
- A discovery tool ("what books has the group talked about before?")

---

## The Dashboard (First-Page Experience)

When a member logs in, the first thing they see is a dashboard with two primary sections:

### Section 1: Proposed Meeting Times

Any pending meeting proposals that need the member's availability response. This is the most time-sensitive action, so it goes first. Show:

- Event title / book being discussed
- Proposed date(s) and time(s)
- Who proposed it
- Quick action: vote on availability (yes / maybe / no per slot)

If no meetings are pending, this section collapses or shows "No upcoming meetings."

### Section 2: The Book Queue

The full active voting list, sorted by total score (seed + current votes), showing:

```
📚 Current Voting Round — closes March 15

 1. The Left Hand of Darkness    14 pts  (6 votes + 8 seed)
 2. Project Hail Mary            11 pts  (4 votes + 7 seed)
 3. Piranesi                      3 pts  (3 votes + 0 seed)
 4. Klara and the Sun             2 pts  (0 votes + 2 seed)
 5. Babel                         1 pt   (1 vote + 0 seed)

 [+ Propose a Book]    [View Retired Books (12)]
```

Each book entry is tappable/clickable to see details (author, pitch, cover, vote history). Members can vote directly from this list if a round is open.

The "View Retired Books" link opens the retired list with a "Re-add to Queue" button on each entry.

### Optional Section 3: Currently Reading

If a book has been selected and a meeting is scheduled, show:

- Current book title and cover
- Next meeting date
- Reading progress check-in (not started / in progress / finished) — stretch feature

---

## Round Lifecycle (Step by Step)

### 1. Round Opens
- All active queue books are eligible for voting
- New proposals can still be added during the round
- Members vote using the configured method (ranked choice or approval)
- Dashboard shows the queue with live vote counts updating

### 2. Round Closes
- Winner is determined by vote tally
- Winner is announced and removed from the queue → moves to "reading" shelf
- Remaining books are evaluated:
  - **≥1 human vote**: Survives. Ranked by vote count (ties broken by most recent vote). Assigned seed points based on rank position.
  - **0 human votes**: Retired. Moved to retired list.
- Queue is updated with new seed scores
- Notifications sent: winner announcement, and optionally "X books were retired this round"

### 3. Between Rounds
- Queue is visible on dashboard with seed scores from last round
- Members can propose new books (enter with 0 seed)
- Members can re-add retired books (enter with 0 seed)
- Meeting scheduling happens for the winning book

### 4. Next Round Opens
- Cycle repeats
- Books carry their seed scores as starting context
- Human votes accumulate on top of seed during the round

---

## Key Behaviors and Edge Cases

### A Book That Always Comes Close
A book that consistently finishes 2nd or 3rd will naturally maintain a high seed score, keeping it visible at the top of the queue. It earns its position through sustained interest. If it eventually wins, great. If interest fades and votes dry up, it retires naturally.

### The Lone Advocate
One member really wants the group to read a specific book. They vote for it every round. That single vote keeps it alive with a seed of 1. It sits at the bottom of the queue but it's there, visible, a standing invitation for someone else to join the cause. If nobody ever does, and the advocate eventually stops voting, it retires.

### A New Proposal That Catches Fire
A freshly proposed book with 0 seed gets 8 votes in its first round. It has a total of 8 points. Meanwhile, a legacy book has 6 seed + 2 votes = 8 points. Tie goes to... the one with the most recent vote. This naturally advantages fresh enthusiasm over coasting momentum in tie scenarios, which feels right.

### The Forgotten Book
A book has 5 seed points from last round. Nobody votes for it this round. It's retired despite its seed. The seed points don't save it — they were just a display of past interest. This is intentional: the queue should only contain books with at least one current advocate.

### Re-Adding a Retired Book
A member notices a retired book and re-adds it. It enters the queue at 0 seed. If it's the middle of a round, it's immediately eligible for votes. If it's between rounds, it'll wait for the next one. Either way, it gets a completely fresh start.

### First Round Ever
No books have seed scores. Everything is new proposals. The first round functions identically to the original design. After the first winner is selected, the carry-forward system kicks in for everything else.

---

## Data Implications

### New Fields on Proposals
- `seed_score` (integer, default 0) — carry-forward points from prior rounds
- `status` (enum: `active` | `retired` | `won` | `reading` | `completed`) — lifecycle state
- `last_voted_at` (timestamp, nullable) — most recent vote received, used for tiebreaking
- `retired_at` (timestamp, nullable) — when the book was retired
- `re_added_by` (user_id, nullable) — who brought it back from retirement, if applicable
- `original_round_id` (foreign key) — the round in which the book was first proposed
- `rounds_survived` (integer, default 0) — how many rounds this book has carried forward through

### New Concept: Round Results Processing
When a round closes, a processing step runs that:
1. Identifies the winner
2. Filters remaining books by human vote count > 0
3. Ranks survivors by vote count, tiebroken by `last_voted_at`
4. Assigns seed scores based on rank position
5. Updates `seed_score` on each surviving proposal
6. Sets status to `retired` on books with 0 votes
7. Resets all vote counts for the next round (votes are archived with the round)

### API Additions
- `GET /api/queue` — the active book queue, sorted by total score, with seed and vote breakdown
- `GET /api/retired` — retired books list
- `POST /api/retired/:id/readd` — re-add a retired book to the active queue
- `GET /api/dashboard` — combined endpoint: pending meetings + active queue + currently reading

---

## Design Principles

1. **Human votes are the only survival mechanism.** Seed points are context, not currency. A book lives or dies by whether anyone cares enough to vote for it right now.

2. **The queue self-curates.** No admin has to make awkward decisions about removing unpopular books. The system handles it through the natural absence of votes.

3. **Momentum is visible but not decisive.** Seed points show history and create a satisfying sense of accumulation, but they don't override current-round engagement.

4. **One vote is enough to keep a book alive.** This respects minority enthusiasm. If someone cares, the book stays.

5. **The dashboard tells the whole story at a glance.** Meeting proposals (action needed) + book queue (current state) = everything a member needs to stay engaged.

6. **Retirement is reversible.** Nothing is permanently lost. Any member can bring back any book, giving it a fresh start.

7. **Fresh proposals compete fairly.** A new book with strong first-round support can leapfrog legacy books that are coasting on seed alone, especially in tiebreakers.
