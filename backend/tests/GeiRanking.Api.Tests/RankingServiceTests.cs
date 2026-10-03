using GeiRanking.Api.Tests.Support;
using GeiRanking.Domain.Matches;
using GeiRanking.Domain.Ranking;
using GeiRanking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace GeiRanking.Api.Tests;

public class RankingServiceTests(PostgresFixture fixture) : IClassFixture<PostgresFixture>, IAsyncLifetime
{
    private readonly Ladder _ladder = new(fixture);

    public async Task InitializeAsync() => await fixture.ResetAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    /// <summary>Ids in the order of the given initial indexes (1-based).</summary>
    private List<int> Ids(params int[] initialIndexes) => initialIndexes.Select(i => _ladder.Ids[i - 1]).ToList();

    [Fact]
    public async Task Rebuild_WritesSnapshot_AndInitialHistory()
    {
        await _ladder.InitAsync(5);

        Assert.Equal(_ladder.Ids, await _ladder.OrderAsync());

        await using var db = fixture.CreateContext();
        Assert.Equal(5, await db.RankingHistory.CountAsync(h => h.FromPosition == null));
    }

    [Fact]
    public async Task AddingAMatch_MovesTheLadder_AndStoresPositionsAndMovementOnTheMatch()
    {
        await _ladder.InitAsync(10);

        var matchId = await _ladder.AddMatchAsync(challenger: 7, challenged: 4, winner: 7);

        Assert.Equal(Ids(1, 2, 3, 7, 5, 6, 4, 8, 9, 10), await _ladder.OrderAsync());

        await using var db = fixture.CreateContext();
        var match = await db.Matches.SingleAsync(m => m.Id == matchId);
        Assert.Equal((7, 4, 4, 7), (match.ChallengerPositionBefore, match.ChallengerPositionAfter, match.ChallengedPositionBefore, match.ChallengedPositionAfter));
        Assert.Equal("Player 07 pasa del #7 al #4; Player 04 baja del #4 al #7", match.MovementText);
        Assert.Null(match.Warning);
    }

    [Fact]
    public async Task VoidingAnOldMatch_RecalculatesLaterOnes_AndFlagsOutOfRange()
    {
        await _ladder.InitAsync(12);
        var first = await _ladder.AddMatchAsync(challenger: 10, challenged: 5, winner: 10);  // 10 climbs to #5
        var second = await _ladder.AddMatchAsync(challenger: 10, challenged: 1, winner: 10); // valid only thanks to the first

        await _ladder.RunAsync(async (db, ct) =>
        {
            (await db.Matches.SingleAsync(m => m.Id == first, ct)).Status = MatchStatus.Voided;
            await db.SaveChangesAsync(ct);
        });

        await using var db = fixture.CreateContext();
        var voided = await db.Matches.SingleAsync(m => m.Id == first);
        var later = await db.Matches.SingleAsync(m => m.Id == second);

        Assert.Null(voided.ChallengerPositionBefore);
        Assert.Null(voided.MovementText);
        Assert.Equal(RankingWarningCode.OutOfRange, later.Warning);
        Assert.Equal(10, later.ChallengerPositionBefore);
        Assert.Equal(Ids(10, 2, 3, 4, 5, 6, 7, 8, 9, 1, 11, 12), await _ladder.OrderAsync());
    }

    [Fact]
    public async Task EditingAMatchWinner_RecalculatesTheLadder()
    {
        await _ladder.InitAsync(10);
        var matchId = await _ladder.AddMatchAsync(challenger: 8, challenged: 5, winner: 8);

        await _ladder.RunAsync(async (db, ct) =>
        {
            (await db.Matches.SingleAsync(m => m.Id == matchId, ct)).WinnerId = _ladder.Ids[4]; // defender actually won
            await db.SaveChangesAsync(ct);
        });

        Assert.Equal(Ids(1, 2, 3, 5, 4, 6, 7, 8, 9, 10), await _ladder.OrderAsync());
    }

    [Fact]
    public async Task ChangingAMatchDate_ReordersEvents_AndKeepsEventDateInSync()
    {
        await _ladder.InitAsync(10);
        await _ladder.AddMatchAsync(challenger: 8, challenged: 6, winner: 8);        // day 1: 8 -> #6
        var b = await _ladder.AddMatchAsync(challenger: 7, challenged: 6, winner: 7);   // day 2

        // Move match b before match a: 7 beats 6 first (6 drops to #7), then 8 (#8) beats 6 (#7).
        await _ladder.RunAsync(async (db, ct) =>
        {
            (await db.Matches.SingleAsync(m => m.Id == b, ct)).PlayedAt = Ladder.Start.AddHours(1);
            await db.SaveChangesAsync(ct);
        });

        await using var db = fixture.CreateContext();
        var storedEvent = await db.RankingEvents.SingleAsync(e => e.MatchId == b);
        Assert.Equal(Ladder.Start.AddHours(1), storedEvent.OccurredAt);
        Assert.Equal(Ids(1, 2, 3, 4, 5, 7, 8, 6, 9, 10), await _ladder.OrderAsync());
    }

    [Fact]
    public async Task FailingMutation_RollsBackEverything()
    {
        await _ladder.InitAsync(5);

        await Assert.ThrowsAsync<InvalidOperationException>(() => _ladder.RunAsync(async (db, ct) =>
        {
            db.Matches.Add(new Match
            {
                PlayedAt = Ladder.Start.AddDays(1),
                ChallengerId = _ladder.Ids[4],
                ChallengedId = _ladder.Ids[3],
                WinnerId = _ladder.Ids[4],
                CreatedAt = Ladder.Start,
                UpdatedAt = Ladder.Start,
            });
            await db.SaveChangesAsync(ct);
            throw new InvalidOperationException("boom");
        }));

        await using var db = fixture.CreateContext();
        Assert.Equal(0, await db.Matches.CountAsync());
        Assert.Equal(_ladder.Ids, await _ladder.OrderAsync());
    }

    [Fact]
    public async Task Rebuild_IsIdempotent()
    {
        await _ladder.InitAsync(8);
        await _ladder.AddMatchAsync(6, 3, 6);
        var before = await _ladder.OrderAsync();

        await using var db = fixture.CreateContext();
        var service = new RankingService(db);
        await service.RebuildAsync();
        await service.RebuildAsync();

        Assert.Equal(before, await _ladder.OrderAsync());
        Assert.Equal(8, await db.RankingSnapshot.CountAsync());
    }

    [Fact]
    public async Task PlayerAddedAndRemovedEvents_AreReplayedFromThePersistedLog()
    {
        await _ladder.InitAsync(5);
        var newPlayerId = 0;

        await _ladder.RunAsync(async (db, ct) =>
        {
            var p = new GeiRanking.Domain.Players.Player { FullName = "Newcomer", JoinedAt = Ladder.Start.AddDays(1) };
            db.Players.Add(p);
            await db.SaveChangesAsync(ct);
            newPlayerId = p.Id;
            db.RankingEvents.Add(new StoredRankingEvent
            {
                Kind = RankingEventKind.PlayerAdded, PlayerId = p.Id, Position = 2,
                OccurredAt = Ladder.Start.AddDays(1), CreatedAt = Ladder.Start.AddDays(1),
            });
            db.RankingEvents.Add(new StoredRankingEvent
            {
                Kind = RankingEventKind.PlayerRemoved, PlayerId = _ladder.Ids[0],
                OccurredAt = Ladder.Start.AddDays(2), CreatedAt = Ladder.Start.AddDays(2),
            });
            await db.SaveChangesAsync(ct);
        });

        var expected = new List<int> { newPlayerId, _ladder.Ids[1], _ladder.Ids[2], _ladder.Ids[3], _ladder.Ids[4] };
        Assert.Equal(expected, await _ladder.OrderAsync());
    }

    [Fact]
    public async Task Database_RejectsSamePlayerMatch()
    {
        await _ladder.InitAsync(3);

        var ex = await Assert.ThrowsAnyAsync<DbUpdateException>(() => _ladder.RunAsync(async (db, ct) =>
        {
            db.Matches.Add(NewMatch(_ladder.Ids[0], _ladder.Ids[0], _ladder.Ids[0]));
            await db.SaveChangesAsync(ct);
        }));

        Assert.Equal("ck_matches_distinct_players", ((PostgresException)ex.InnerException!).ConstraintName);
    }

    [Fact]
    public async Task Database_RejectsWinnerWhoDidNotPlay()
    {
        await _ladder.InitAsync(3);

        var ex = await Assert.ThrowsAnyAsync<DbUpdateException>(() => _ladder.RunAsync(async (db, ct) =>
        {
            db.Matches.Add(NewMatch(_ladder.Ids[0], _ladder.Ids[1], _ladder.Ids[2]));
            await db.SaveChangesAsync(ct);
        }));

        Assert.Equal("ck_matches_winner_is_a_player", ((PostgresException)ex.InnerException!).ConstraintName);
    }

    [Fact]
    public async Task Database_RejectsMatchWithUnknownPlayer()
    {
        await _ladder.InitAsync(3);

        var ex = await Assert.ThrowsAnyAsync<DbUpdateException>(() => _ladder.RunAsync(async (db, ct) =>
        {
            db.Matches.Add(NewMatch(_ladder.Ids[0], 9999, _ladder.Ids[0]));
            await db.SaveChangesAsync(ct);
        }));

        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, ((PostgresException)ex.InnerException!).SqlState);
    }

    [Fact]
    public async Task Database_RejectsDuplicatePositionsInSnapshot()
    {
        await _ladder.InitAsync(3);
        await using var db = fixture.CreateContext();

        var ex = await Assert.ThrowsAnyAsync<DbUpdateException>(async () =>
        {
            db.RankingSnapshot.Add(new RankingSnapshotEntry { Position = 1, PlayerId = _ladder.Ids[0] });
            await db.SaveChangesAsync();
        });

        Assert.Equal(PostgresErrorCodes.UniqueViolation, ((PostgresException)ex.InnerException!).SqlState);
    }

    [Fact]
    public async Task Score_RoundTripsThroughJsonb()
    {
        await _ladder.InitAsync(3);
        var score = new MatchScore([new SetScore(7, 6, new TieBreakScore(7, 4)), new SetScore(3, 6)], new TieBreakScore(10, 8));
        var id = await _ladder.AddMatchAsync(3, 2, 3, score: score);

        await using var db = fixture.CreateContext();
        var stored = await db.Matches.AsNoTracking().SingleAsync(m => m.Id == id);

        Assert.Equal("7-6(4) 3-6 10-8", stored.Score.Format());
        Assert.Equal(new TieBreakScore(7, 4), stored.Score.Sets[0].TieBreak);
        Assert.Equal(new TieBreakScore(10, 8), stored.Score.SuperTieBreak);
    }

    private static Match NewMatch(int challenger, int challenged, int winner) => new()
    {
        PlayedAt = Ladder.Start.AddDays(1),
        ChallengerId = challenger,
        ChallengedId = challenged,
        WinnerId = winner,
        CreatedAt = Ladder.Start,
        UpdatedAt = Ladder.Start,
    };
}
