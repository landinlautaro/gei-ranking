namespace GeiRanking.Domain.Ranking;

/// <summary>
/// Pure ladder logic. The ranking is never edited: it is derived by replaying all events in order,
/// so editing or voiding an old match is just replaying the corrected event list.
/// </summary>
public static class RankingEngine
{
    public static RankingState Replay(IEnumerable<RankingEvent> events, RankingRules? rules = null)
    {
        rules ??= RankingRules.Default;

        var order = new List<int>();
        var outcomes = new Dictionary<int, MatchOutcome>();
        var history = new List<PositionChange>();
        var warnings = new List<RankingWarning>();

        var sorted = events
            .Where(e => e is not MatchPlayed { IsVoided: true })
            .OrderBy(e => e.OccurredAt)
            .ThenBy(e => e.CreatedAt)
            .ThenBy(e => e.Id);

        foreach (var e in sorted)
        {
            var before = order.ToArray();

            switch (e)
            {
                case InitialRanking initial:
                    order.Clear();
                    order.AddRange(initial.PlayerIds.Distinct());
                    break;

                case MatchPlayed match:
                    var outcome = ApplyMatch(order, match, rules);
                    outcomes[match.MatchId] = outcome;
                    if (outcome.Warning is { } matchWarning)
                    {
                        warnings.Add(new RankingWarning(e.Id, match.MatchId, matchWarning));
                    }

                    break;

                case PlayerAdded added:
                    if (order.Contains(added.PlayerId))
                    {
                        warnings.Add(new RankingWarning(e.Id, null, RankingWarningCode.PlayerAlreadyRanked));
                        break;
                    }

                    var index = added.Position is { } p ? Math.Clamp(p - 1, 0, order.Count) : order.Count;
                    order.Insert(index, added.PlayerId);
                    break;

                case PlayerRemoved removed:
                    if (!order.Remove(removed.PlayerId))
                    {
                        warnings.Add(new RankingWarning(e.Id, null, RankingWarningCode.PlayerNotRanked));
                    }

                    break;

                case ManualAdjustment adjustment:
                    if (!order.Remove(adjustment.PlayerId))
                    {
                        warnings.Add(new RankingWarning(e.Id, null, RankingWarningCode.PlayerNotRanked));
                        break;
                    }

                    order.Insert(Math.Clamp(adjustment.NewPosition - 1, 0, order.Count), adjustment.PlayerId);
                    break;
            }

            RecordChanges(history, e, before, order);
        }

        return new RankingState(order, outcomes, history, warnings);
    }

    private static MatchOutcome ApplyMatch(List<int> order, MatchPlayed m, RankingRules rules)
    {
        var challengerIndex = order.IndexOf(m.ChallengerId);
        var challengedIndex = order.IndexOf(m.ChallengedId);
        int? Pos(int index) => index >= 0 ? index + 1 : null;

        MatchOutcome NotApplied(RankingWarningCode warning) => new(
            m.MatchId, m.Id, MovementKind.NotApplied,
            Pos(challengerIndex), Pos(challengerIndex), Pos(challengedIndex), Pos(challengedIndex),
            m.ChallengerId, m.ChallengedId, null, warning);

        if (m.ChallengerId == m.ChallengedId)
        {
            return NotApplied(RankingWarningCode.SamePlayer);
        }

        if (challengerIndex < 0 || challengedIndex < 0)
        {
            return NotApplied(RankingWarningCode.PlayerNotRanked);
        }

        if (m.WinnerId != m.ChallengerId && m.WinnerId != m.ChallengedId)
        {
            return NotApplied(RankingWarningCode.InvalidWinner);
        }

        // Range is checked against the positions in force when the match happens. Out of range never blocks.
        var inRange = rules.IsChallengeInRange(challengerIndex + 1, challengedIndex + 1);
        var kind = MovementKind.NoChange;
        int? displaced = null;

        if (m.WinnerId == m.ChallengerId)
        {
            // Challenger takes the challenged place. Never worsens the challenger (downward challenges stay put).
            if (challengerIndex > challengedIndex)
            {
                (order[challengerIndex], order[challengedIndex]) = (order[challengedIndex], order[challengerIndex]);
                displaced = m.ChallengedId;
                kind = MovementKind.ChallengerSwapped;
            }
        }
        else if (challengedIndex > 0)
        {
            // Successful defense: climb one place, swapping with whoever is right above.
            displaced = order[challengedIndex - 1];
            (order[challengedIndex], order[challengedIndex - 1]) = (order[challengedIndex - 1], order[challengedIndex]);
            kind = MovementKind.DefenderMovedUp;
        }

        return new MatchOutcome(
            m.MatchId, m.Id, kind,
            challengerIndex + 1, order.IndexOf(m.ChallengerId) + 1,
            challengedIndex + 1, order.IndexOf(m.ChallengedId) + 1,
            m.ChallengerId, m.ChallengedId, displaced,
            inRange ? null : RankingWarningCode.OutOfRange);
    }

    private static void RecordChanges(List<PositionChange> history, RankingEvent e, int[] before, List<int> after)
    {
        var remaining = before.Select((id, i) => (id, pos: i + 1)).ToDictionary(x => x.id, x => x.pos);

        for (var i = 0; i < after.Count; i++)
        {
            int? from = remaining.Remove(after[i], out var previous) ? previous : null;
            if (from != i + 1)
            {
                history.Add(new PositionChange(e.Id, e.OccurredAt, after[i], from, i + 1));
            }
        }

        // Whoever is left was in the ranking before and is gone now.
        foreach (var (id, pos) in remaining)
        {
            history.Add(new PositionChange(e.Id, e.OccurredAt, id, pos, null));
        }
    }
}
