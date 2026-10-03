using GeiRanking.Domain.Ranking;

namespace GeiRanking.Domain.Tests;

public class RankingEngineTests
{
    private static readonly DateTimeOffset Start = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    /// <summary>Builds events with increasing ids/creation times. Player id N starts at position N.</summary>
    private sealed class Log
    {
        private long _nextId;

        public List<RankingEvent> Events { get; } = [];

        public Log(int players = 25) => Add(new InitialRanking(Next(), Start, Start, Enumerable.Range(1, players).ToList()));

        private long Next() => ++_nextId;

        private DateTimeOffset Created => Start.AddMinutes(_nextId);

        private void Add(RankingEvent e) => Events.Add(e);

        public MatchPlayed Match(int matchId, int challenger, int challenged, int winner, int day)
        {
            var id = Next();
            var e = new MatchPlayed(id, Start.AddDays(day), Created, matchId, challenger, challenged, winner);
            Add(e);
            return e;
        }

        public void AddPlayer(int playerId, int day, int? position = null)
        {
            var id = Next();
            Add(new PlayerAdded(id, Start.AddDays(day), Created, playerId, position));
        }

        public void RemovePlayer(int playerId, int day)
        {
            var id = Next();
            Add(new PlayerRemoved(id, Start.AddDays(day), Created, playerId));
        }

        public void Adjust(int playerId, int newPosition, int day)
        {
            var id = Next();
            Add(new ManualAdjustment(id, Start.AddDays(day), Created, playerId, newPosition, "test"));
        }

        public RankingState Replay() => RankingEngine.Replay(Events);
    }

    private static int[] Top(RankingState state, int count) => state.Order.Take(count).ToArray();

    [Fact]
    public void InitialRanking_SetsOrder()
    {
        var state = new Log(5).Replay();

        Assert.Equal([1, 2, 3, 4, 5], state.Order);
        Assert.Equal(3, state.PositionOf(3));
        Assert.Null(state.PositionOf(99));
    }

    [Fact]
    public void ChallengerWins_SwapsWithChallenged()
    {
        var log = new Log();
        log.Match(1, challenger: 20, challenged: 17, winner: 20, day: 1);

        var state = log.Replay();

        Assert.Equal(17, state.PositionOf(20));
        Assert.Equal(20, state.PositionOf(17));
        Assert.Equal(16, state.PositionOf(16));
        Assert.Equal(18, state.PositionOf(18));

        var outcome = state.Outcomes[1];
        Assert.Equal(MovementKind.ChallengerSwapped, outcome.Movement);
        Assert.Equal((20, 17, 17, 20), (outcome.ChallengerPositionBefore, outcome.ChallengerPositionAfter, outcome.ChallengedPositionBefore, outcome.ChallengedPositionAfter));
        Assert.Null(outcome.Warning);
    }

    [Fact]
    public void ChallengerWins_AtMaximumRange_IsValid()
    {
        var log = new Log();
        log.Match(1, challenger: 20, challenged: 15, winner: 20, day: 1);

        var state = log.Replay();

        Assert.Equal(15, state.PositionOf(20));
        Assert.Empty(state.Warnings);
    }

    [Fact]
    public void DefenderWins_ClimbsOnePlace()
    {
        var log = new Log();
        log.Match(1, challenger: 20, challenged: 17, winner: 17, day: 1);

        var state = log.Replay();

        Assert.Equal(16, state.PositionOf(17));
        Assert.Equal(17, state.PositionOf(16));
        Assert.Equal(20, state.PositionOf(20));

        var outcome = state.Outcomes[1];
        Assert.Equal(MovementKind.DefenderMovedUp, outcome.Movement);
        Assert.Equal(16, outcome.ChallengedPositionAfter);
        Assert.Equal(16, outcome.DisplacedPlayerId);
    }

    [Fact]
    public void DefenderWins_AtNumberOne_NothingMoves()
    {
        var log = new Log();
        log.Match(1, challenger: 4, challenged: 1, winner: 1, day: 1);

        var state = log.Replay();

        Assert.Equal(Enumerable.Range(1, 25), state.Order);
        Assert.Equal(MovementKind.NoChange, state.Outcomes[1].Movement);
        Assert.Empty(state.Warnings);
    }

    [Fact]
    public void ChallengerBeatsNumberOne_TakesFirstPlace()
    {
        var log = new Log();
        log.Match(1, challenger: 5, challenged: 1, winner: 5, day: 1);

        var state = log.Replay();

        Assert.Equal([5, 2, 3, 4, 1], Top(state, 5));
    }

    [Theory]
    [InlineData(20, 14)] // 6 places above
    [InlineData(10, 15)] // downward
    [InlineData(10, 2)]
    public void OutOfRangeChallenge_IsFlaggedButStillApplied(int challenger, int challenged)
    {
        var log = new Log();
        log.Match(1, challenger, challenged, winner: challenged, day: 1);

        var state = log.Replay();

        Assert.Equal(RankingWarningCode.OutOfRange, state.Outcomes[1].Warning);
        Assert.Contains(state.Warnings, w => w.MatchId == 1 && w.Code == RankingWarningCode.OutOfRange);
        Assert.NotEqual(MovementKind.NotApplied, state.Outcomes[1].Movement);
    }

    [Fact]
    public void OutOfRangeChallenge_ChallengerWinning_StillMoves()
    {
        var log = new Log();
        log.Match(1, challenger: 20, challenged: 10, winner: 20, day: 1);

        var state = log.Replay();

        Assert.Equal(10, state.PositionOf(20));
        Assert.Equal(20, state.PositionOf(10));
        Assert.Equal(RankingWarningCode.OutOfRange, state.Outcomes[1].Warning);
    }

    [Fact]
    public void DownwardChallenge_ChallengerWinning_DoesNotWorsenChallenger()
    {
        var log = new Log();
        log.Match(1, challenger: 10, challenged: 12, winner: 10, day: 1);

        var state = log.Replay();

        Assert.Equal(10, state.PositionOf(10));
        Assert.Equal(12, state.PositionOf(12));
        Assert.Equal(MovementKind.NoChange, state.Outcomes[1].Movement);
        Assert.Equal(RankingWarningCode.OutOfRange, state.Outcomes[1].Warning);
    }

    [Fact]
    public void Walkover_MovesTheLadderLikeAPlayedMatch()
    {
        // A W.O. is a MatchPlayed whose winner was declared by the admin: the engine moves it like any other match.
        var log = new Log();
        log.Match(1, 12, 9, 12, day: 1);

        var state = log.Replay();

        Assert.Equal(9, state.PositionOf(12));
        Assert.Equal(12, state.PositionOf(9));
    }

    [Fact]
    public void Match_WithSamePlayer_IsNotApplied()
    {
        var log = new Log();
        log.Match(1, 7, 7, 7, day: 1);

        var state = log.Replay();

        Assert.Equal(MovementKind.NotApplied, state.Outcomes[1].Movement);
        Assert.Equal(RankingWarningCode.SamePlayer, state.Outcomes[1].Warning);
        Assert.Equal(Enumerable.Range(1, 25), state.Order);
    }

    [Fact]
    public void Match_WithWinnerOutsideTheMatch_IsNotApplied()
    {
        var log = new Log();
        log.Match(1, 8, 6, 3, day: 1);

        var state = log.Replay();

        Assert.Equal(RankingWarningCode.InvalidWinner, state.Outcomes[1].Warning);
        Assert.Equal(Enumerable.Range(1, 25), state.Order);
    }

    [Fact]
    public void Match_WithPlayerNotInRanking_IsNotApplied()
    {
        var log = new Log();
        log.Match(1, 99, 6, 99, day: 1);

        var state = log.Replay();

        Assert.Equal(RankingWarningCode.PlayerNotRanked, state.Outcomes[1].Warning);
        Assert.Equal(Enumerable.Range(1, 25), state.Order);
    }

    [Fact]
    public void PlayerAdded_WithoutPosition_GoesLast()
    {
        var log = new Log(5);
        log.AddPlayer(100, day: 1);

        var state = log.Replay();

        Assert.Equal([1, 2, 3, 4, 5, 100], state.Order);
    }

    [Fact]
    public void PlayerAdded_InTheMiddle_ShiftsOthersDown()
    {
        var log = new Log(5);
        log.AddPlayer(100, day: 1, position: 3);

        var state = log.Replay();

        Assert.Equal([1, 2, 100, 3, 4, 5], state.Order);
        Assert.Equal(4, state.PositionOf(3));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-4)]
    public void PlayerAdded_PositionBelowOne_GoesFirst(int position)
    {
        var log = new Log(3);
        log.AddPlayer(100, day: 1, position);

        Assert.Equal([100, 1, 2, 3], log.Replay().Order);
    }

    [Fact]
    public void PlayerAdded_PositionBeyondEnd_GoesLast()
    {
        var log = new Log(3);
        log.AddPlayer(100, day: 1, position: 50);

        Assert.Equal([1, 2, 3, 100], log.Replay().Order);
    }

    [Fact]
    public void PlayerAdded_AlreadyRanked_IsIgnoredWithWarning()
    {
        var log = new Log(3);
        log.AddPlayer(2, day: 1);

        var state = log.Replay();

        Assert.Equal([1, 2, 3], state.Order);
        Assert.Contains(state.Warnings, w => w.Code == RankingWarningCode.PlayerAlreadyRanked);
    }

    [Fact]
    public void PlayerRemoved_InTheMiddle_MovesEveryoneBelowUp()
    {
        var log = new Log(6);
        log.RemovePlayer(3, day: 1);

        var state = log.Replay();

        Assert.Equal([1, 2, 4, 5, 6], state.Order);
        Assert.Null(state.PositionOf(3));
        Assert.Equal(3, state.PositionOf(4));
    }

    [Fact]
    public void PlayerRemoved_NotRanked_WarnsAndChangesNothing()
    {
        var log = new Log(3);
        log.RemovePlayer(42, day: 1);

        var state = log.Replay();

        Assert.Equal([1, 2, 3], state.Order);
        Assert.Contains(state.Warnings, w => w.Code == RankingWarningCode.PlayerNotRanked);
    }

    [Fact]
    public void RemovedPlayer_KeepsHisMatchOutcomes()
    {
        var log = new Log();
        log.Match(1, 20, 18, 20, day: 1);
        log.RemovePlayer(20, day: 2); // player 20 now sits at #18

        var state = log.Replay();

        Assert.Null(state.PositionOf(20));
        Assert.Equal(18, state.Outcomes[1].ChallengerPositionAfter);
        Assert.Equal(24, state.Order.Count);
    }

    [Fact]
    public void AddedPlayer_CanPlayAfterJoining()
    {
        var log = new Log(5);
        log.AddPlayer(100, day: 1);
        log.Match(1, challenger: 100, challenged: 4, winner: 100, day: 2);

        var state = log.Replay();

        Assert.Equal([1, 2, 3, 100, 5, 4], state.Order);
        Assert.Empty(state.Warnings);
    }

    [Fact]
    public void ManualAdjustment_MovesPlayerAndShiftsOthers()
    {
        var log = new Log(6);
        log.Adjust(5, newPosition: 2, day: 1);
        log.Adjust(1, newPosition: 6, day: 2);

        var state = log.Replay();

        Assert.Equal([5, 2, 3, 4, 6, 1], state.Order);
    }

    [Fact]
    public void ManualAdjustment_OfUnknownPlayer_Warns()
    {
        var log = new Log(3);
        log.Adjust(77, newPosition: 1, day: 1);

        var state = log.Replay();

        Assert.Equal([1, 2, 3], state.Order);
        Assert.Contains(state.Warnings, w => w.Code == RankingWarningCode.PlayerNotRanked);
    }

    [Fact]
    public void VoidedMatch_IsExcludedFromReplay()
    {
        var log = new Log();
        var match = log.Match(1, 20, 17, 20, day: 1);
        log.Events[log.Events.IndexOf(match)] = match with { IsVoided = true };

        var state = log.Replay();

        Assert.Equal(Enumerable.Range(1, 25), state.Order);
        Assert.Empty(state.Outcomes);
        Assert.Empty(state.Warnings);
    }

    [Fact]
    public void Events_AreOrderedByDate_ThenByCreation_NotByListOrder()
    {
        var log = new Log(10);
        // The second match is created later but dated earlier: it must be applied first.
        log.Match(1, challenger: 5, challenged: 3, winner: 5, day: 5);
        log.Match(2, challenger: 4, challenged: 3, winner: 4, day: 2);

        log.Events.Reverse();
        var state = log.Replay();

        // day 2: [1,2,4,3,5]; day 5: 5 (#5) beats 3 (now #4) -> [1,2,4,5,3].
        Assert.Equal([1, 2, 4, 5, 3], Top(state, 5));
        Assert.Equal(4, state.Outcomes[1].ChallengedPositionBefore);
    }

    [Fact]
    public void SameDate_IsOrderedByCreationTime()
    {
        var created1 = Start.AddMinutes(10);
        var created2 = Start.AddMinutes(20);
        var events = new List<RankingEvent>
        {
            new MatchPlayed(3, Start.AddDays(1), created2, 2, 3, 2, 3), // applied second
            new MatchPlayed(2, Start.AddDays(1), created1, 1, 3, 1, 3), // applied first
            new InitialRanking(1, Start, Start, [1, 2, 3]),
        };

        var state = RankingEngine.Replay(events);

        // First 3 beats 1 -> [3,2,1]; then 3 (#1) vs 2 (#2): downward challenge, winner 3 stays.
        Assert.Equal([3, 2, 1], state.Order);
        Assert.Equal(RankingWarningCode.OutOfRange, state.Outcomes[2].Warning);
    }

    [Fact]
    public void RangeIsEvaluatedWithPositionsAtMatchTime()
    {
        var log = new Log();
        // Player 10 climbs from #10 to #5 first, then challenges #1 (4 places up): in range at that moment.
        log.Match(1, 10, 5, 10, day: 1);
        log.Match(2, 10, 1, 10, day: 2);

        var state = log.Replay();

        Assert.Empty(state.Warnings);
        Assert.Equal(1, state.PositionOf(10));
    }

    [Fact]
    public void VoidingAnOldMatch_RecalculatesEverythingAfterIt_AndWarnsOutOfRange()
    {
        var log = new Log();
        var a = log.Match(1, challenger: 10, challenged: 5, winner: 10, day: 1);
        log.Match(2, challenger: 10, challenged: 1, winner: 10, day: 2); // valid only because match 1 happened

        var before = log.Replay();
        Assert.Empty(before.Warnings);
        Assert.Equal(1, before.PositionOf(10));

        log.Events[log.Events.IndexOf(a)] = a with { IsVoided = true };
        var after = log.Replay();

        // Without match 1, player 10 was still #10 when challenging #1: out of range, but not blocked.
        var warning = Assert.Single(after.Warnings);
        Assert.Equal((2, RankingWarningCode.OutOfRange), (warning.MatchId, warning.Code));
        Assert.Equal(1, after.PositionOf(10));
        Assert.Equal(10, after.PositionOf(1));
        Assert.DoesNotContain(1, after.Outcomes.Keys);
        Assert.Equal(10, after.Outcomes[2].ChallengerPositionBefore);
    }

    [Fact]
    public void EditingAnOldMatchWinner_RecalculatesLaterMatches()
    {
        var log = new Log();
        var a = log.Match(1, challenger: 10, challenged: 5, winner: 10, day: 1);
        log.Match(2, challenger: 8, challenged: 5, winner: 8, day: 2); // 5 is the old #5 -> now sits at #10 after match 1
        var original = log.Replay();

        // After match 1 player 10 is #5 and 5 is #10. Match 2: 8 (#8) vs 5 (#10) is a downward challenge.
        Assert.Equal(RankingWarningCode.OutOfRange, original.Outcomes[2].Warning);

        // Edit match 1: the defender actually won. Player 5 climbs to #4; nothing else moves.
        log.Events[log.Events.IndexOf(a)] = a with { WinnerId = 5 };
        var edited = log.Replay();

        Assert.Equal(MovementKind.DefenderMovedUp, edited.Outcomes[1].Movement);
        // Match 2 now: 8 (#8) challenges 5 (#4): 4 places up, valid, challenger wins and takes #4.
        Assert.Null(edited.Outcomes[2].Warning);
        Assert.Equal(4, edited.PositionOf(8));
        Assert.Equal(8, edited.PositionOf(5));
        Assert.Equal(5, edited.PositionOf(4));
    }

    [Fact]
    public void History_RecordsEveryPositionChangeInOrder()
    {
        var log = new Log(5);
        log.Match(1, challenger: 4, challenged: 2, winner: 4, day: 1);
        log.AddPlayer(100, day: 2, position: 1);

        var state = log.Replay();

        var matchChanges = state.History.Where(h => h.EventId == log.Events[1].Id).ToList();
        Assert.Equal(2, matchChanges.Count);
        Assert.Contains(matchChanges, h => h is { PlayerId: 4, FromPosition: 4, ToPosition: 2 });
        Assert.Contains(matchChanges, h => h is { PlayerId: 2, FromPosition: 2, ToPosition: 4 });

        var addChanges = state.History.Where(h => h.EventId == log.Events[2].Id).ToList();
        Assert.Contains(addChanges, h => h is { PlayerId: 100, FromPosition: null, ToPosition: 1 });
        Assert.Contains(addChanges, h => h is { PlayerId: 1, FromPosition: 1, ToPosition: 2 });
        Assert.Equal(6, addChanges.Count); // 100 enters and all 5 existing players shift down
    }

    [Fact]
    public void History_RecordsRemovalAsNullPosition()
    {
        var log = new Log(4);
        log.RemovePlayer(2, day: 1);

        var state = log.Replay();

        Assert.Contains(state.History, h => h is { PlayerId: 2, FromPosition: 2, ToPosition: null });
        Assert.Contains(state.History, h => h is { PlayerId: 3, FromPosition: 3, ToPosition: 2 });
    }

    [Fact]
    public void Replay_IsDeterministic()
    {
        var log = new Log();
        log.Match(1, 20, 17, 20, 1);
        log.Match(2, 18, 16, 16, 2);
        log.AddPlayer(100, 3, 4);
        log.RemovePlayer(9, 4);

        Assert.Equal(log.Replay().Order, log.Replay().Order);
    }

    [Fact]
    public void CustomRange_ChangesWhatIsConsideredInRange()
    {
        var log = new Log();
        log.Match(1, challenger: 20, challenged: 15, winner: 20, day: 1);

        var state = RankingEngine.Replay(log.Events, new RankingRules(MaxChallengeRange: 3));

        Assert.Equal(RankingWarningCode.OutOfRange, state.Outcomes[1].Warning);
    }

    [Fact]
    public void Describe_ProducesSpanishMovementText()
    {
        var log = new Log();
        log.Match(1, 20, 17, 20, 1);
        log.Match(2, 12, 9, 9, 2);

        var state = log.Replay();
        string Name(int id) => $"J{id}";

        Assert.Equal("J20 pasa del #20 al #17; J17 baja del #17 al #20", state.Outcomes[1].Describe(Name));
        Assert.Equal("J9 defiende y sube del #9 al #8; J8 baja al #9", state.Outcomes[2].Describe(Name));
    }

    [Fact]
    public void Describe_NoChange_And_NotApplied()
    {
        var log = new Log();
        log.Match(1, 3, 1, 1, 1);
        log.Match(2, 7, 7, 7, 2);

        var state = log.Replay();

        Assert.Equal("Sin movimiento", state.Outcomes[1].Describe(id => $"J{id}"));
        Assert.Equal("No se aplicó movimiento", state.Outcomes[2].Describe(id => $"J{id}"));
    }

    [Fact]
    public void FullScenario_69Players_ManyEvents()
    {
        var log = new Log(69);
        log.Match(1, 69, 65, 69, 1);                  // 69->65, 65->69
        log.Match(2, 64, 62, 62, 2);                  // 62 defends: 62->61, 61->62
        log.AddPlayer(200, 3);                        // #70
        log.RemovePlayer(1, 4);                       // everyone moves up one
        log.Match(3, 200, 66, 200, 5);                // 200 is #69 now, 66 is #65: in range
        log.Adjust(2, 69, 6);

        var state = log.Replay();

        Assert.Equal(69, state.Order.Count);
        Assert.Equal(69, state.Order.Distinct().Count());
        Assert.Equal(69, state.PositionOf(2));
        Assert.Empty(state.Warnings);
    }
}
