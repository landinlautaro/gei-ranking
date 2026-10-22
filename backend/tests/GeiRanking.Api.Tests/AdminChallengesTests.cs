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

    private ChallengeInput Input(int challenger, int challenged, DateTimeOffset? issuedAt = null, DateTimeOffset? scheduledAt = null, bool confirm = false) =>
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

        var created = await CreateAsync(Input(8, 5));

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

        var created = await CreateAsync(Input(8, 5, scheduledAt: Club(9, 19)));

        Assert.Equal(ChallengeStatus.Scheduled, created.Status);
        Assert.Equal(Club(9, 19).ToUniversalTime(), created.ScheduledAt);
    }

    [Fact]
    public async Task Create_WithoutIssuedAt_UsesNowAndIsNotExpired()
    {
        await Ladder.InitAsync(10);

        var response = await PostAsync("/api/admin/challenges", Input(8, 5) with { IssuedAt = null, ConfirmWarnings = true });
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
        await CreateAsync(Input(8, 5));

        var outOfRange = await PreviewAsync(Input(12, 3, Club(6)));
        var lateInTheWeek = await PreviewAsync(Input(10, 9, Club(8))); // Thursday
        var secondThisWeek = await PreviewAsync(Input(8, 7, Club(6)));

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

        var refused = await PostAsync("/api/admin/challenges", Input(12, 3));
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("ChallengeWarningsRequireConfirmation", (await ProblemAsync(refused)).Code);
        Assert.Equal(0, (await GetAsync<PagedDto<AdminChallengeDto>>("/api/admin/challenges")).Total);

        var confirmed = await CreateAsync(Input(12, 3, confirm: true));
        Assert.Equal(ChallengeStatus.Pending, confirmed.Status);
    }

    [Fact]
    public async Task AWeekWarning_IgnoresCancelledChallenges_AndAppliesToBothPlayers()
    {
        await Ladder.InitAsync(10);
        var first = await CreateAsync(Input(8, 5));

        // Either player of the first challenge counts, in either role.
        Assert.Contains(ChallengeWarning.AlreadyChallengedThisWeek, (await PreviewAsync(Input(5, 3, Club(6)))).Warnings);
        Assert.Contains(ChallengeWarning.AlreadyChallengedThisWeek, (await PreviewAsync(Input(9, 8, Club(6)))).Warnings);

        Assert.Equal(HttpStatusCode.OK, (await PostAsync($"/api/admin/challenges/{first.Id}/cancel", new CancelChallengeRequest(null))).StatusCode);

        Assert.Empty((await PreviewAsync(Input(5, 3, Club(6)))).Warnings);
        // The following week is a different one.
        await CreateAsync(Input(8, 5));
        Assert.Empty((await PreviewAsync(Input(8, 7, Club(12)))).Warnings);
    }

    // ---- blocking errors ----

    [Fact]
    public async Task Create_SamePlayer_IsRejected()
    {
        await Ladder.InitAsync(5);

        var response = await PostAsync("/api/admin/challenges", Input(4, 4));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("SamePlayer", (await ProblemAsync(response)).Errors["challengedId"]);
    }

    [Fact]
    public async Task Create_WithAnInactivePlayer_IsRejected()
    {
        await Ladder.InitAsync(8);
        Assert.Equal(HttpStatusCode.OK, (await PostAsync($"/api/admin/players/{Ladder.Ids[2]}/deactivate")).StatusCode);

        var response = await PostAsync("/api/admin/challenges", Input(5, 3, confirm: true));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("PlayerNotRanked", (await ProblemAsync(response)).Errors["challengedId"]);
    }

    [Fact]
    public async Task Create_UnknownPlayer_IsRejected()
    {
        await Ladder.InitAsync(5);

        var response = await PostAsync("/api/admin/challenges", Input(4, 3) with { ChallengedId = 99999 });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("PlayerNotFound", (await ProblemAsync(response)).Errors["challengedId"]);
    }

    [Fact]
    public async Task Create_AgreedDateAfterTheDeadline_IsRejected()
    {
        await Ladder.InitAsync(8);

        var response = await PostAsync("/api/admin/challenges", Input(5, 3, scheduledAt: Club(12, 10)));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("AfterDeadline", (await ProblemAsync(response)).Errors["scheduledAt"]);
    }

    // ---- update / cancel ----

    [Fact]
    public async Task Update_ExtendsTheDeadline_AndSchedulesAndUnschedules()
    {
        await Ladder.InitAsync(10);
        var created = await CreateAsync(Input(8, 5));
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
        var created = await CreateAsync(Input(8, 5));

        var response = await PutAsync($"/api/admin/challenges/{created.Id}", new ChallengeUpdateRequest(created.IssuedAt, created.IssuedAt.AddDays(-1), null, null));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("BeforeIssuedAt", (await ProblemAsync(response)).Errors["deadlineAt"]);
    }

    [Fact]
    public async Task Cancel_KeepsTheHistory_IsIdempotent_AndLocksTheChallenge()
    {
        await Ladder.InitAsync(10);
        var created = await CreateAsync(Input(8, 5));

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
        var old = await CreateAsync(Input(8, 5));
        var current = (await ReadAsync<AdminChallengeDto>(
            await PostAsync("/api/admin/challenges", Input(10, 7) with { IssuedAt = null, ConfirmWarnings = true })));
        var cancelled = await CreateAsync(Input(9, 6, Club(12)));
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

    [Fact]
    public async Task Challenges_RequireAnAdminToken()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await Anonymous.GetAsync("/api/admin/challenges")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Anonymous.PostAsync("/api/admin/challenges/preview", null)).StatusCode);
    }
}
