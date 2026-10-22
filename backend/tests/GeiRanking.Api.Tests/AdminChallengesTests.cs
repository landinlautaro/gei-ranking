using System.Net;
using GeiRanking.Api.Admin;
using GeiRanking.Api.Dtos;
using GeiRanking.Api.Tests.Support;
using GeiRanking.Domain.Challenges;

namespace GeiRanking.Api.Tests;

public class AdminChallengesTests(PostgresFixture fixture) : AdminApiTestBase(fixture), IClassFixture<PostgresFixture>
{
    // Buenos Aires is UTC-3. 2026-01-05 is a Monday; the week ends on Sunday the 11th.
    private static DateTimeOffset Club(int day, int hour = 12) => new(2026, 1, day, hour, 0, 0, TimeSpan.FromHours(-3));

    private static readonly DateTimeOffset SundayEndOfDay = new(2026, 1, 11, 23, 59, 59, 999, TimeSpan.FromHours(-3));

    private ChallengeInput Body(int challenger, int challenged, DateTimeOffset? issuedAt = null, DateTimeOffset? scheduledAt = null, bool confirm = false) =>
        new(Ladder.Ids[challenger - 1], Ladder.Ids[challenged - 1], issuedAt ?? Club(5), scheduledAt, null, confirm);

    private async Task<ChallengePreviewDto> PreviewAsync(ChallengeInput input)
    {
        var response = await PostAsync("/api/admin/challenges/preview", input);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await ReadAsync<ChallengePreviewDto>(response);
    }

    private async Task<AdminChallengeDto> CreateAsync(ChallengeInput input)
    {
        var response = await PostAsync("/api/admin/challenges", input);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await ReadAsync<AdminChallengeDto>(response);
    }

    // ---- create ----

    [Fact]
    public async Task Create_InRangeAndOnTime_IsPendingWithTheSundayDeadline()
    {
        await Ladder.InitAsync(10);

        var created = await CreateAsync(Body(8, 5));

        Assert.Equal(ChallengeStatus.Pending, created.Status);
        Assert.Equal((8, 5), (created.ChallengerPosition, created.ChallengedPosition));
        Assert.Equal(SundayEndOfDay.ToUniversalTime(), created.DeadlineAt);
        Assert.True(created.IsExpired); // the week of 5/1/2026 is long gone
        Assert.Null(created.MatchId);
    }

    [Fact]
    public async Task Create_WithAnAgreedDate_IsScheduled()
    {
        await Ladder.InitAsync(10);

        var created = await CreateAsync(Body(8, 5, scheduledAt: Club(9, 19)));

        Assert.Equal(ChallengeStatus.Scheduled, created.Status);
        Assert.Equal(Club(9, 19).ToUniversalTime(), created.ScheduledAt);
    }

    [Fact]
    public async Task Create_WithoutIssuedAt_UsesNowAndIsNotExpired()
    {
        await Ladder.InitAsync(10);

        var response = await PostAsync("/api/admin/challenges", Body(8, 5) with { IssuedAt = null, ConfirmWarnings = true });
        var created = await ReadAsync<AdminChallengeDto>(response);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.False(created.IsExpired);
        Assert.True(created.DeadlineAt > DateTimeOffset.UtcNow);
    }

    // ---- warnings ----

    [Fact]
    public async Task Preview_ListsWarnings_WithoutBlocking()
    {
        await Ladder.InitAsync(12);
        await CreateAsync(Body(8, 5));

        var outOfRange = await PreviewAsync(Body(12, 3, Club(6)));
        var lateInTheWeek = await PreviewAsync(Body(10, 9, Club(8))); // Thursday
        var secondThisWeek = await PreviewAsync(Body(8, 7, Club(6)));

        Assert.True(outOfRange.IsValid);
        Assert.Equal([ChallengeWarning.OutOfRange], outOfRange.Warnings);
        Assert.Equal([ChallengeWarning.OutsideChallengeWindow], lateInTheWeek.Warnings);
        Assert.Equal([ChallengeWarning.AlreadyChallengedThisWeek], secondThisWeek.Warnings);
        Assert.Equal(SundayEndOfDay.ToUniversalTime(), lateInTheWeek.DeadlineAt);
    }

    [Fact]
    public async Task Create_WithWarnings_NeedsConfirmation()
    {
        await Ladder.InitAsync(12);

        var refused = await PostAsync("/api/admin/challenges", Body(12, 3));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("ChallengeWarningsRequireConfirmation", (await ProblemAsync(refused)).Code);
        Assert.Equal(0, (await GetAsync<PagedDto<AdminChallengeDto>>("/api/admin/challenges")).Total);

        var confirmed = await CreateAsync(Body(12, 3, confirm: true));
        Assert.Equal(ChallengeStatus.Pending, confirmed.Status);
    }

    [Fact]
    public async Task AWeekWarning_IgnoresCancelledChallenges_AndAppliesToBothPlayers()
    {
        await Ladder.InitAsync(10);
        var first = await CreateAsync(Body(8, 5));

        // Either player of the first challenge counts, in either role.
        Assert.Contains(ChallengeWarning.AlreadyChallengedThisWeek, (await PreviewAsync(Body(5, 3, Club(6)))).Warnings);
        Assert.Contains(ChallengeWarning.AlreadyChallengedThisWeek, (await PreviewAsync(Body(9, 8, Club(6)))).Warnings);

        Assert.Equal(HttpStatusCode.OK, (await PostAsync($"/api/admin/challenges/{first.Id}/cancel", new CancelChallengeRequest(null))).StatusCode);

        Assert.Empty((await PreviewAsync(Body(5, 3, Club(6)))).Warnings);
        // The following week is a different one.
        await CreateAsync(Body(8, 5));
        Assert.Empty((await PreviewAsync(Body(8, 7, Club(12)))).Warnings);
    }

    // ---- blocking errors ----

    [Fact]
    public async Task Create_SamePlayer_IsRejected()
    {
        await Ladder.InitAsync(5);

        var response = await PostAsync("/api/admin/challenges", Body(4, 4));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("SamePlayer", (await ProblemAsync(response)).Errors["challengedId"]);
    }

    [Fact]
    public async Task Create_WithAnInactivePlayer_IsRejected()
    {
        await Ladder.InitAsync(8);
        Assert.Equal(HttpStatusCode.OK, (await PostAsync($"/api/admin/players/{Ladder.Ids[2]}/deactivate")).StatusCode);

        var response = await PostAsync("/api/admin/challenges", Body(5, 3, confirm: true));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("PlayerNotRanked", (await ProblemAsync(response)).Errors["challengedId"]);
    }

    [Fact]
    public async Task Create_UnknownPlayer_IsRejected()
    {
        await Ladder.InitAsync(5);

        var response = await PostAsync("/api/admin/challenges", Body(4, 3) with { ChallengedId = 99999 });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("PlayerNotFound", (await ProblemAsync(response)).Errors["challengedId"]);
    }

    [Fact]
    public async Task Create_AgreedDateAfterTheDeadline_IsRejected()
    {
        await Ladder.InitAsync(8);

        var response = await PostAsync("/api/admin/challenges", Body(5, 3, scheduledAt: Club(12, 10)));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("AfterDeadline", (await ProblemAsync(response)).Errors["scheduledAt"]);
    }

    // ---- update / cancel ----

    [Fact]
    public async Task Update_ExtendsTheDeadline_AndSchedulesAndUnschedules()
    {
        await Ladder.InitAsync(10);
        var created = await CreateAsync(Body(8, 5));
        var extended = SundayEndOfDay.AddDays(7);

        var scheduled = await ReadAsync<AdminChallengeDto>(
            await PutAsync($"/api/admin/challenges/{created.Id}", new ChallengeUpdateRequest(created.IssuedAt, extended, Club(14, 18), "Se juega el martes")));

        Assert.Equal(ChallengeStatus.Scheduled, scheduled.Status);
        Assert.Equal(extended.ToUniversalTime(), scheduled.DeadlineAt);
        Assert.Equal("Se juega el martes", scheduled.Notes);

        var cleared = await ReadAsync<AdminChallengeDto>(
            await PutAsync($"/api/admin/challenges/{created.Id}", new ChallengeUpdateRequest(created.IssuedAt, extended, null, null)));
        Assert.Equal(ChallengeStatus.Pending, cleared.Status);
        Assert.Null(cleared.ScheduledAt);
    }

    [Fact]
    public async Task Update_DeadlineBeforeTheIssueDate_IsRejected()
    {
        await Ladder.InitAsync(10);
        var created = await CreateAsync(Body(8, 5));

        var response = await PutAsync($"/api/admin/challenges/{created.Id}", new ChallengeUpdateRequest(created.IssuedAt, created.IssuedAt.AddDays(-1), null, null));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("BeforeIssuedAt", (await ProblemAsync(response)).Errors["deadlineAt"]);
    }

    [Fact]
    public async Task Cancel_KeepsTheHistory_IsIdempotent_AndLocksTheChallenge()
    {
        await Ladder.InitAsync(10);
        var created = await CreateAsync(Body(8, 5));

        var cancelled = await ReadAsync<AdminChallengeDto>(
            await PostAsync($"/api/admin/challenges/{created.Id}/cancel", new CancelChallengeRequest("Se lesionó")));
        Assert.Equal(ChallengeStatus.Cancelled, cancelled.Status);
        Assert.False(cancelled.IsExpired);
        Assert.Contains("Se lesionó", cancelled.Notes);

        var again = await PostAsync($"/api/admin/challenges/{created.Id}/cancel", new CancelChallengeRequest(null));
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);

        var edit = await PutAsync($"/api/admin/challenges/{created.Id}", new ChallengeUpdateRequest(created.IssuedAt, created.DeadlineAt, null, null));
        Assert.Equal(HttpStatusCode.Conflict, edit.StatusCode);
        Assert.Equal("ChallengeNotActive", (await ProblemAsync(edit)).Code);
    }

    [Fact]
    public async Task Cancel_UnknownChallenge_Is404()
    {
        var response = await PostAsync("/api/admin/challenges/12345/cancel", new CancelChallengeRequest(null));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- list ----

    [Fact]
    public async Task List_FiltersByDerivedExpiredStatus_AndByPlayer()
    {
        await Ladder.InitAsync(10);
        var old = await CreateAsync(Body(8, 5));
        var current = await ReadAsync<AdminChallengeDto>(
            await PostAsync("/api/admin/challenges", Body(10, 7) with { IssuedAt = null, ConfirmWarnings = true }));
        var cancelled = await CreateAsync(Body(9, 6, Club(12)));
        await PostAsync($"/api/admin/challenges/{cancelled.Id}/cancel", new CancelChallengeRequest(null));

        var expired = await GetAsync<PagedDto<AdminChallengeDto>>("/api/admin/challenges?status=Expired");
        var active = await GetAsync<PagedDto<AdminChallengeDto>>("/api/admin/challenges?status=Active");
        var ofPlayer = await GetAsync<PagedDto<AdminChallengeDto>>($"/api/admin/challenges?playerId={Ladder.Ids[6]}");
        var week = await GetAsync<PagedDto<AdminChallengeDto>>("/api/admin/challenges?weekOf=2026-01-07");

        Assert.Equal([old.Id], expired.Items.Select(c => c.Id));
        Assert.Equal([current.Id, old.Id], active.Items.Select(c => c.Id).Order().Reverse());
        Assert.Equal([current.Id], ofPlayer.Items.Select(c => c.Id));
        Assert.Equal([old.Id], week.Items.Select(c => c.Id));
    }

    // ---- settling a challenge with a result ----

    private Task<HttpResponseMessage> SettleAsync(int challengeId, int challenger, int challenged, bool challengerWins = true, bool allowOutOfRange = false) =>
        PostAsync("/api/admin/matches", Input(challenger, challenged, challengerWins: challengerWins, allowOutOfRange: allowOutOfRange) with { ChallengeId = challengeId });

    [Fact]
    public async Task LoadingTheResult_SettlesTheChallenge_AndMovesTheRanking()
    {
        await Ladder.InitAsync(10);
        var challenge = await CreateAsync(Body(8, 5));

        var response = await SettleAsync(challenge.Id, 8, 5);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var match = (await ReadAsync<MatchChangeResultDto>(response)).Match;
        var settled = await GetAsync<AdminChallengeDto>($"/api/admin/challenges/{challenge.Id}");
        Assert.Equal(ChallengeStatus.Played, settled.Status);
        Assert.Equal(match.Id, settled.MatchId);
        Assert.False(settled.IsExpired);
        Assert.Equal(Ladder.Ids[7], (await PublicOrderAsync())[4]); // the challenger took #5
    }

    [Fact]
    public async Task LoadingTheResult_OfADifferentPairOrRole_IsRejected_AndNothingIsSaved()
    {
        await Ladder.InitAsync(10);
        var challenge = await CreateAsync(Body(8, 5));

        var otherPair = await SettleAsync(challenge.Id, 9, 5);
        var swappedRoles = await SettleAsync(challenge.Id, 5, 8);

        foreach (var response in new[] { otherPair, swappedRoles })
        {
            Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
            Assert.Contains("PlayersDoNotMatch", (await ProblemAsync(response)).Errors["challengeId"]);
        }

        Assert.Equal(0, (await GetAsync<PagedDto<AdminMatchDto>>("/api/admin/matches")).Total);
        Assert.Equal(ChallengeStatus.Pending, (await GetAsync<AdminChallengeDto>($"/api/admin/challenges/{challenge.Id}")).Status);
    }

    [Fact]
    public async Task LoadingTheResult_OfAnInactiveOrUnknownChallenge_IsRejected()
    {
        await Ladder.InitAsync(10);
        var challenge = await CreateAsync(Body(8, 5));
        await PostAsync($"/api/admin/challenges/{challenge.Id}/cancel", new CancelChallengeRequest(null));

        var cancelled = await SettleAsync(challenge.Id, 8, 5);
        var unknown = await SettleAsync(98765, 8, 5);

        Assert.Contains("ChallengeNotActive", (await ProblemAsync(cancelled)).Errors["challengeId"]);
        Assert.Contains("ChallengeNotFound", (await ProblemAsync(unknown)).Errors["challengeId"]);
        Assert.Equal(0, (await GetAsync<PagedDto<AdminMatchDto>>("/api/admin/matches")).Total);
    }

    [Fact]
    public async Task LoadingTheResult_ThatNeedsConfirmation_LeavesTheChallengeUntouched()
    {
        await Ladder.InitAsync(12);
        var challenge = await CreateAsync(Body(12, 3, confirm: true));

        var refused = await SettleAsync(challenge.Id, 12, 3);

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(ChallengeStatus.Pending, (await GetAsync<AdminChallengeDto>($"/api/admin/challenges/{challenge.Id}")).Status);

        Assert.Equal(HttpStatusCode.Created, (await SettleAsync(challenge.Id, 12, 3, allowOutOfRange: true)).StatusCode);
        Assert.Equal(ChallengeStatus.Played, (await GetAsync<AdminChallengeDto>($"/api/admin/challenges/{challenge.Id}")).Status);
    }

    [Fact]
    public async Task Preview_WithAChallenge_ReportsTheMismatch()
    {
        await Ladder.InitAsync(10);
        var challenge = await CreateAsync(Body(8, 5));

        var response = await PostAsync("/api/admin/matches/preview", Input(9, 5) with { ChallengeId = challenge.Id });
        var preview = await ReadAsync<MatchPreviewDto>(response);

        Assert.False(preview.IsValid);
        Assert.Contains("PlayersDoNotMatch", preview.Errors["challengeId"]);
    }

    [Fact]
    public async Task VoidingTheMatch_OpensTheChallengeAgain()
    {
        await Ladder.InitAsync(10);
        var pending = await CreateAsync(Body(8, 5));
        var agreed = await CreateAsync(Body(9, 6, scheduledAt: Club(8, 19)));
        var first = await ReadAsync<MatchChangeResultDto>(await SettleAsync(pending.Id, 8, 5));
        var second = await ReadAsync<MatchChangeResultDto>(await SettleAsync(agreed.Id, 9, 6));

        await PostAsync($"/api/admin/matches/{first.Match.Id}/void");
        await PostAsync($"/api/admin/matches/{second.Match.Id}/void");

        var reopened = await GetAsync<AdminChallengeDto>($"/api/admin/challenges/{pending.Id}");
        Assert.Equal(ChallengeStatus.Pending, reopened.Status);
        Assert.Null(reopened.MatchId);
        Assert.True(reopened.IsExpired); // its week is over: the admin decides (e.g. a W.O.)
        Assert.Equal(ChallengeStatus.Scheduled, (await GetAsync<AdminChallengeDto>($"/api/admin/challenges/{agreed.Id}")).Status);
        Assert.Equal(Ladder.Ids, await PublicOrderAsync());

        // And it can be settled again with a new result.
        Assert.Equal(HttpStatusCode.Created, (await SettleAsync(pending.Id, 8, 5)).StatusCode);
    }

    [Fact]
    public async Task EditingASettlingMatch_CannotChangeItsPlayers()
    {
        await Ladder.InitAsync(10);
        var challenge = await CreateAsync(Body(8, 5));
        var match = (await ReadAsync<MatchChangeResultDto>(await SettleAsync(challenge.Id, 8, 5))).Match;

        var otherPair = await PutAsync($"/api/admin/matches/{match.Id}", Input(9, 5));
        var sameButNewScore = await PutAsync($"/api/admin/matches/{match.Id}", Input(8, 5, challengerWins: false));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, otherPair.StatusCode);
        Assert.Contains("LinkedChallengeMismatch", (await ProblemAsync(otherPair)).Errors["match"]);
        Assert.Equal(HttpStatusCode.OK, sameButNewScore.StatusCode);
        Assert.Equal(ChallengeStatus.Played, (await GetAsync<AdminChallengeDto>($"/api/admin/challenges/{challenge.Id}")).Status);
    }

    [Fact]
    public async Task Challenges_RequireAnAdminToken()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await Anonymous.GetAsync("/api/admin/challenges")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Anonymous.PostAsync("/api/admin/challenges/preview", null)).StatusCode);
    }
}
