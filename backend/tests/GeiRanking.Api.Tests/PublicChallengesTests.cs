using GeiRanking.Api.Admin;
using GeiRanking.Api.Dtos;
using GeiRanking.Api.Tests.Support;

namespace GeiRanking.Api.Tests;

public class PublicChallengesTests(PostgresFixture fixture) : AdminApiTestBase(fixture), IClassFixture<PostgresFixture>
{
    private static readonly DateTimeOffset LongAgo = new(2026, 1, 5, 12, 0, 0, TimeSpan.FromHours(-3)); // a Monday, well past

    /// <summary>Registers a challenge between players given by initial position. Without a date it is announced now.</summary>
    private async Task<AdminChallengeDto> NewChallengeAsync(int challenger, int challenged, DateTimeOffset? issuedAt = null, string? notes = null)
    {
        var input = new ChallengeInput(Ladder.Ids[challenger - 1], Ladder.Ids[challenged - 1], issuedAt, null, notes, ConfirmWarnings: true);
        var response = await PostAsync("/api/admin/challenges", input);
        Assert.Equal(System.Net.HttpStatusCode.Created, response.StatusCode);
        return await ReadAsync<AdminChallengeDto>(response);
    }

    [Fact]
    public async Task Board_SplitsOnTimeExpiredAndRecentlyPlayed_AndHidesCancelled()
    {
        await Ladder.InitAsync(12);
        var onTime = await NewChallengeAsync(8, 5);
        var expired = await NewChallengeAsync(9, 6, LongAgo);
        var cancelled = await NewChallengeAsync(10, 7);
        var settled = await NewChallengeAsync(11, 8);
        await PostAsync($"/api/admin/challenges/{cancelled.Id}/cancel", new CancelChallengeRequest(null));
        await CreateMatchAsync(Input(11, 8) with { ChallengeId = settled.Id });

        var board = await GetAsync<ChallengeBoardDto>("/api/challenges", Anonymous);

        Assert.Equal([onTime.Id], board.Active.Select(c => c.Id));
        Assert.Equal([expired.Id], board.Expired.Select(c => c.Id));
        Assert.Equal([settled.Id], board.RecentlyPlayed.Select(c => c.Id));
        Assert.All(board.Expired, c => Assert.True(c.IsExpired));
        Assert.All(board.Active, c => Assert.False(c.IsExpired));
        Assert.NotNull(board.RecentlyPlayed[0].MatchId);
    }

    [Fact]
    public async Task Board_SortsOpenChallengesByDeadline_WithCurrentPositions()
    {
        await Ladder.InitAsync(12);
        var later = await NewChallengeAsync(8, 5);
        var earlierWeek = await NewChallengeAsync(9, 6, LongAgo);
        var earliest = await NewChallengeAsync(10, 7, LongAgo.AddDays(-14));

        var board = await GetAsync<ChallengeBoardDto>("/api/challenges", Anonymous);

        Assert.Equal([earliest.Id, earlierWeek.Id], board.Expired.Select(c => c.Id));
        var item = board.Active.Single();
        Assert.Equal(later.Id, item.Id);
        Assert.Equal((8, 5), (item.ChallengerPosition, item.ChallengedPosition));
        Assert.Equal("Player 08", item.Challenger.FullName);
    }

    [Fact]
    public async Task Board_DoesNotExposeAdminNotes()
    {
        await Ladder.InitAsync(10);
        await NewChallengeAsync(8, 5, notes: "nota-privada-del-coordinador");

        var raw = await Anonymous.GetStringAsync("/api/challenges");

        Assert.DoesNotContain("nota-privada", raw);
        Assert.DoesNotContain("notes", raw, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Board_IsEmptyWithoutChallenges()
    {
        await Ladder.InitAsync(5);

        var board = await GetAsync<ChallengeBoardDto>("/api/challenges", Anonymous);

        Assert.Empty(board.Active);
        Assert.Empty(board.Expired);
        Assert.Empty(board.RecentlyPlayed);
    }

    [Fact]
    public async Task Profile_ListsTheOpenChallengesOfThatPlayer_InEitherRole()
    {
        await Ladder.InitAsync(12);
        var asChallenger = await NewChallengeAsync(8, 5);
        var asChallenged = await NewChallengeAsync(11, 8, LongAgo);
        await NewChallengeAsync(10, 9); // someone else's
        var settled = await NewChallengeAsync(8, 6, LongAgo.AddDays(-14));
        await CreateMatchAsync(Input(8, 6) with { ChallengeId = settled.Id });

        var profile = await GetAsync<PlayerProfileDto>($"/api/players/{Ladder.Ids[7]}", Anonymous);
        var uninvolved = await GetAsync<PlayerProfileDto>($"/api/players/{Ladder.Ids[0]}", Anonymous);

        // Soonest deadline first: the old (expired) one, then the one of this week. The settled one is not "active".
        Assert.Equal([asChallenged.Id, asChallenger.Id], profile.ActiveChallenges.Select(c => c.Id));
        Assert.True(profile.ActiveChallenges[0].IsExpired);
        Assert.Empty(uninvolved.ActiveChallenges);
    }

    [Fact]
    public async Task Profile_DoesNotListCancelledChallenges()
    {
        await Ladder.InitAsync(10);
        var challenge = await NewChallengeAsync(8, 5);
        await PostAsync($"/api/admin/challenges/{challenge.Id}/cancel", new CancelChallengeRequest(null));

        var profile = await GetAsync<PlayerProfileDto>($"/api/players/{Ladder.Ids[4]}", Anonymous);

        Assert.Empty(profile.ActiveChallenges);
    }
}
