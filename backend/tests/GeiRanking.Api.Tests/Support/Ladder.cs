using GeiRanking.Domain.Matches;
using GeiRanking.Domain.Players;
using GeiRanking.Infrastructure;
using GeiRanking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GeiRanking.Api.Tests.Support;

/// <summary>Builds a ladder in the test database through <see cref="RankingService"/>, like the real write paths will.</summary>
public sealed class Ladder(PostgresFixture fixture)
{
    public static readonly DateTimeOffset Start = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private int _day;

    /// <summary>Player ids; index 0 is the initial position 1.</summary>
    public List<int> Ids { get; } = [];

    public async Task InitAsync(int players)
    {
        await RunAsync(async (db, ct) =>
        {
            var created = Enumerable.Range(1, players)
                .Select(i => new Player { FullName = $"Player {i:00}", JoinedAt = Start })
                .ToList();
            db.Players.AddRange(created);
            await db.SaveChangesAsync(ct);

            Ids.AddRange(created.Select(p => p.Id));
            db.RankingEvents.Add(new StoredRankingEvent
            {
                Kind = RankingEventKind.InitialRanking,
                OccurredAt = Start,
                CreatedAt = Start,
                InitialOrder = Ids.ToArray(),
            });
            await db.SaveChangesAsync(ct);
        });
    }

    /// <summary>Adds a match between players given by their initial index (1-based). Dates advance one day per match unless given.</summary>
    public async Task<int> AddMatchAsync(
        int challenger, int challenged, int winner,
        DateTimeOffset? playedAt = null,
        MatchScore? score = null,
        CompletionType completion = CompletionType.Normal)
    {
        var matchId = 0;
        var when = playedAt ?? Start.AddDays(++_day);

        await RunAsync(async (db, ct) =>
        {
            var match = new Match
            {
                PlayedAt = when,
                ChallengerId = Ids[challenger - 1],
                ChallengedId = Ids[challenged - 1],
                WinnerId = Ids[winner - 1],
                Score = score ?? new MatchScore([new SetScore(6, 4), new SetScore(6, 3)]),
                Completion = completion,
                CreatedAt = when,
                UpdatedAt = when,
            };
            db.Matches.Add(match);
            await db.SaveChangesAsync(ct);

            db.RankingEvents.Add(new StoredRankingEvent
            {
                Kind = RankingEventKind.MatchPlayed,
                OccurredAt = when,
                CreatedAt = when,
                MatchId = match.Id,
            });
            await db.SaveChangesAsync(ct);
            matchId = match.Id;
        });

        return matchId;
    }

    public Task RunAsync(Func<AppDbContext, CancellationToken, Task> mutation)
    {
        var db = fixture.CreateContext();
        return RunAndDisposeAsync(db, mutation);
    }

    private static async Task RunAndDisposeAsync(AppDbContext db, Func<AppDbContext, CancellationToken, Task> mutation)
    {
        await using (db)
        {
            await new RankingService(db).ExecuteAsync(mutation);
        }
    }

    public async Task<List<int>> OrderAsync()
    {
        await using var db = fixture.CreateContext();
        return await db.RankingSnapshot.OrderBy(s => s.Position).Select(s => s.PlayerId).ToListAsync();
    }
}
