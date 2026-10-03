using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using GeiRanking.Api.Dtos;
using GeiRanking.Api.Tests.Support;
using GeiRanking.Domain.Matches;
using Microsoft.AspNetCore.Mvc.Testing;

namespace GeiRanking.Api.Tests;

public class PublicEndpointsTests(PostgresFixture fixture) : IClassFixture<PostgresFixture>, IAsyncLifetime
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    private readonly Ladder _ladder = new(fixture);
    private WebApplicationFactory<Program>? _factory;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        await fixture.ResetAsync();
        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(b => b.UseSetting("ConnectionStrings:Default", fixture.ConnectionString));
        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        if (_factory is not null)
        {
            await _factory.DisposeAsync();
        }
    }

    private Task<T?> GetAsync<T>(string url) => _client.GetFromJsonAsync<T>(url, Json);

    [Fact]
    public async Task Ranking_ListsPlayersInOrder_WithStatsAndMovement()
    {
        await _ladder.InitAsync(10);
        await _ladder.AddMatchAsync(challenger: 7, challenged: 4, winner: 7);   // 7 climbs to #4, 4 drops to #7
        await _ladder.AddMatchAsync(challenger: 9, challenged: 6, winner: 6);   // 6 defends and climbs one place

        var ranking = await GetAsync<List<RankingRowDto>>("/api/ranking");

        Assert.NotNull(ranking);
        Assert.Equal(10, ranking.Count);
        Assert.Equal(Enumerable.Range(1, 10), ranking.Select(r => r.Position));

        var climber = ranking.Single(r => r.Player.FullName == "Player 07");
        Assert.Equal(4, climber.Position);
        Assert.Equal((1, 1, 0, 1, 0), (climber.Played, climber.Wins, climber.Losses, climber.ChallengesWon, climber.ChallengesLost));
        Assert.Equal(7, climber.PreviousPosition);
        Assert.Equal(3, climber.Movement);

        var dropped = ranking.Single(r => r.Player.FullName == "Player 04");
        Assert.Equal(7, dropped.Position);
        Assert.Equal(-3, dropped.Movement);
        Assert.Equal((1, 0, 1, 0, 0), (dropped.Played, dropped.Wins, dropped.Losses, dropped.ChallengesWon, dropped.ChallengesLost));

        var untouched = ranking.Single(r => r.Player.FullName == "Player 01");
        Assert.Equal(0, untouched.Played);
        Assert.Equal(0, untouched.Movement);
    }

    [Fact]
    public async Task Ranking_IgnoresVoidedMatchesInStats()
    {
        await _ladder.InitAsync(6);
        var matchId = await _ladder.AddMatchAsync(5, 3, 5);
        await _ladder.RunAsync(async (db, ct) =>
        {
            (await db.Matches.FindAsync([matchId], ct))!.Status = MatchStatus.Voided;
            await db.SaveChangesAsync(ct);
        });

        var ranking = await GetAsync<List<RankingRowDto>>("/api/ranking");

        Assert.All(ranking!, r => Assert.Equal(0, r.Played));
        Assert.Equal(_ladder.Ids, ranking!.Select(r => r.Player.Id));
    }

    [Fact]
    public async Task Ranking_IsEmpty_WhenThereIsNoData()
    {
        var ranking = await GetAsync<List<RankingRowDto>>("/api/ranking");

        Assert.Empty(ranking!);
    }

    [Fact]
    public async Task Profile_ReturnsStatsChallengeableOpponentsAndPositionHistory()
    {
        await _ladder.InitAsync(12);
        await _ladder.AddMatchAsync(challenger: 10, challenged: 8, winner: 10);  // 10 -> #8
        await _ladder.AddMatchAsync(challenger: 11, challenged: 8, winner: 8);   // 8 (dropped to #10) defends and climbs to #9
        var id = _ladder.Ids[9];

        var profile = await GetAsync<PlayerProfileDto>($"/api/players/{id}");

        Assert.NotNull(profile);
        Assert.Equal("Player 10", profile.FullName);
        Assert.Equal(8, profile.Position);
        Assert.Equal(10, profile.PreviousPosition);
        Assert.Equal(2, profile.Movement);
        Assert.Equal(8, profile.BestPosition);
        Assert.Equal(1, profile.Stats.Wins);
        Assert.Equal(1, profile.Stats.ChallengesWon);
        Assert.Equal(100.0, profile.Stats.WinPercentage);
        Assert.Equal(1, profile.Stats.CurrentStreak);

        // Positions 3..7 are the 5 places above #8.
        Assert.Equal([3, 4, 5, 6, 7], profile.CanChallenge.Select(c => c.Position));

        Assert.Equal([10, 8], profile.PositionHistory.Select(p => p.Position));
    }

    [Fact]
    public async Task Profile_OfNumberOne_CannotChallengeAnyone()
    {
        await _ladder.InitAsync(5);

        var profile = await GetAsync<PlayerProfileDto>($"/api/players/{_ladder.Ids[0]}");

        Assert.Equal(1, profile!.Position);
        Assert.Empty(profile.CanChallenge);
        Assert.Equal(0, profile.Stats.Played);
        Assert.Null(profile.Stats.WinPercentage);
    }

    [Fact]
    public async Task Profile_OfUnknownPlayer_Is404()
    {
        var response = await _client.GetAsync("/api/players/9999");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Players_AreOrderedByName_AndExcludeInactiveByDefault()
    {
        await _ladder.InitAsync(4);
        await _ladder.RunAsync(async (db, ct) =>
        {
            (await db.Players.FindAsync([_ladder.Ids[1]], ct))!.IsActive = false;
            await db.SaveChangesAsync(ct);
        });

        var active = await GetAsync<List<PlayerListItemDto>>("/api/players");
        var all = await GetAsync<List<PlayerListItemDto>>("/api/players?includeInactive=true");

        Assert.Equal(["Player 01", "Player 03", "Player 04"], active!.Select(p => p.FullName));
        Assert.Equal(4, all!.Count);
        Assert.Equal(3, active!.Single(p => p.FullName == "Player 03").Position);
    }

    [Fact]
    public async Task Matches_AreListedNewestFirst_WithResultAndMovement()
    {
        await _ladder.InitAsync(10);
        await _ladder.AddMatchAsync(8, 6, 8);
        await _ladder.AddMatchAsync(5, 3, 3, completion: CompletionType.Walkover, score: MatchScore.Empty);
        var retired = new MatchScore([new SetScore(6, 2), new SetScore(3, 1)]);
        await _ladder.AddMatchAsync(9, 7, 9, score: retired, completion: CompletionType.Retirement);

        var page = await GetAsync<PagedDto<MatchDto>>("/api/matches");

        Assert.Equal(3, page!.Total);
        Assert.Equal(["6-2 3-1 (ab.)", "W.O.", "6-4 6-3"], page.Items.Select(m => m.Result));
        Assert.Equal(CompletionType.Walkover, page.Items[1].Completion);
        var first = page.Items[2];
        Assert.Equal("Player 08", first.Challenger.FullName);
        Assert.Equal("Player 08", first.Winner.FullName);
        Assert.Equal((8, 6), (first.ChallengerPositionBefore, first.ChallengerPositionAfter));
        Assert.Contains("Player 08 pasa del #8 al #6", first.MovementText);
    }

    [Fact]
    public async Task Matches_CanBeFilteredByPlayer()
    {
        await _ladder.InitAsync(10);
        await _ladder.AddMatchAsync(8, 6, 8);
        await _ladder.AddMatchAsync(5, 3, 3);
        await _ladder.AddMatchAsync(10, 8, 10);

        var page = await GetAsync<PagedDto<MatchDto>>($"/api/matches?playerId={_ladder.Ids[7]}");

        Assert.Equal(2, page!.Total);
        Assert.All(page.Items, m => Assert.True(m.Challenger.Id == _ladder.Ids[7] || m.Challenged.Id == _ladder.Ids[7]));
    }

    [Fact]
    public async Task Matches_CanBeFilteredByClubLocalDateRange_Inclusive()
    {
        await _ladder.InitAsync(10);
        // 01:00 UTC on 11/03 is still 10/03 22:00 in Buenos Aires (UTC-3).
        await _ladder.AddMatchAsync(8, 6, 8, playedAt: new DateTimeOffset(2026, 3, 11, 1, 0, 0, TimeSpan.Zero));
        await _ladder.AddMatchAsync(5, 3, 3, playedAt: new DateTimeOffset(2026, 3, 11, 12, 0, 0, TimeSpan.Zero));
        await _ladder.AddMatchAsync(9, 7, 9, playedAt: new DateTimeOffset(2026, 3, 12, 12, 0, 0, TimeSpan.Zero));

        var onTheTenth = await GetAsync<PagedDto<MatchDto>>("/api/matches?from=2026-03-10&to=2026-03-10");
        var tenthToEleventh = await GetAsync<PagedDto<MatchDto>>("/api/matches?from=2026-03-10&to=2026-03-11");
        var fromTwelfth = await GetAsync<PagedDto<MatchDto>>("/api/matches?from=2026-03-12");
        var untilEleventh = await GetAsync<PagedDto<MatchDto>>("/api/matches?to=2026-03-11");

        Assert.Equal(1, onTheTenth!.Total);
        Assert.Equal(2, tenthToEleventh!.Total);
        Assert.Equal(1, fromTwelfth!.Total);
        Assert.Equal(2, untilEleventh!.Total);
    }

    [Fact]
    public async Task Matches_ArePaged()
    {
        await _ladder.InitAsync(10);
        for (var i = 0; i < 5; i++)
        {
            await _ladder.AddMatchAsync(6, 5, 6);
        }

        var second = await GetAsync<PagedDto<MatchDto>>("/api/matches?page=2&pageSize=2");

        Assert.Equal(5, second!.Total);
        Assert.Equal(2, second.Items.Count);
        Assert.Equal(2, second.Page);
    }

    [Theory]
    [InlineData("/api/matches?page=0")]
    [InlineData("/api/matches?pageSize=0")]
    [InlineData("/api/matches?pageSize=101")]
    [InlineData("/api/matches?from=2026-03-12&to=2026-03-10")]
    public async Task Matches_InvalidQuery_IsBadRequest(string url)
    {
        var response = await _client.GetAsync(url);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Matches_ExcludeVoided()
    {
        await _ladder.InitAsync(10);
        var id = await _ladder.AddMatchAsync(8, 6, 8);
        await _ladder.AddMatchAsync(5, 3, 3);
        await _ladder.RunAsync(async (db, ct) =>
        {
            (await db.Matches.FindAsync([id], ct))!.Status = MatchStatus.Voided;
            await db.SaveChangesAsync(ct);
        });

        var page = await GetAsync<PagedDto<MatchDto>>("/api/matches");

        Assert.Equal(1, page!.Total);
    }
}
