using System.Net;
using GeiRanking.Api.Admin;
using GeiRanking.Api.Dtos;
using GeiRanking.Api.Tests.Support;
using GeiRanking.Domain.Matches;
using GeiRanking.Domain.Ranking;

namespace GeiRanking.Api.Tests;

public class AdminMatchesTests(PostgresFixture fixture) : AdminApiTestBase(fixture), IClassFixture<PostgresFixture>
{
    private async Task<MatchPreviewDto> PreviewAsync(MatchInput input, int? editing = null)
    {
        var url = editing is null ? "/api/admin/matches/preview" : $"/api/admin/matches/preview?editingMatchId={editing}";
        var response = await PostAsync(url, input);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await ReadAsync<MatchPreviewDto>(response);
    }

    // ---- preview ----

    [Fact]
    public async Task Preview_ShowsTheMovement_WithoutSavingAnything()
    {
        await Ladder.InitAsync(10);

        var preview = await PreviewAsync(Input(challenger: 8, challenged: 5));

        Assert.True(preview.IsValid);
        Assert.Equal(MatchSide.Challenger, preview.WinnerSide);
        Assert.Equal(Ladder.Ids[7], preview.WinnerId);
        Assert.Equal(MovementKind.ChallengerSwapped, preview.Movement);
        Assert.Equal((8, 5, 5, 8), (preview.ChallengerPositionBefore, preview.ChallengerPositionAfter, preview.ChallengedPositionBefore, preview.ChallengedPositionAfter));
        Assert.Equal("Player 08 pasa del #8 al #5; Player 05 baja del #5 al #8", preview.MovementText);
        Assert.False(preview.RequiresOutOfRangeConfirmation);

        Assert.Equal(Ladder.Ids, await PublicOrderAsync());
        Assert.Equal(0, (await GetAsync<PagedDto<AdminMatchDto>>("/api/admin/matches")).Total);
    }

    [Fact]
    public async Task Preview_DefenderWins_ShowsTheClimb()
    {
        await Ladder.InitAsync(10);

        var preview = await PreviewAsync(Input(challenger: 8, challenged: 5, challengerWins: false));

        Assert.Equal(MovementKind.DefenderMovedUp, preview.Movement);
        Assert.Equal(4, preview.ChallengedPositionAfter);
        Assert.Equal("Player 05 defiende y sube del #5 al #4; Player 04 baja al #5", preview.MovementText);
    }

    [Fact]
    public async Task Preview_OutOfRange_AsksForConfirmation_ButIsNotInvalid()
    {
        await Ladder.InitAsync(12);

        var preview = await PreviewAsync(Input(challenger: 12, challenged: 3));

        Assert.True(preview.IsValid);
        Assert.True(preview.RequiresOutOfRangeConfirmation);
        Assert.Equal(RankingWarningCode.OutOfRange, preview.Warning);
        Assert.NotNull(preview.MovementText);
    }

    [Fact]
    public async Task Preview_ReportsFieldErrors_LiveWithoutFailingTheRequest()
    {
        await Ladder.InitAsync(6);
        var badSet = Input(5, 3) with { Score = new MatchScore([new SetScore(6, 5), new SetScore(6, 3)]) };

        var preview = await PreviewAsync(badSet);

        Assert.False(preview.IsValid);
        Assert.Contains("InvalidSet", preview.Errors["score"]);
        Assert.Null(preview.Movement);
    }

    [Fact]
    public async Task Preview_WhenEditing_ComparesAgainstTheLadderWithoutThatMatch()
    {
        await Ladder.InitAsync(10);
        var created = await CreateMatchAsync(Input(challenger: 8, challenged: 5)); // 8 is now #5

        // Same players, same result: re-evaluated without the stored match it is the same movement.
        var preview = await PreviewAsync(Input(challenger: 8, challenged: 5), editing: created.Match.Id);

        Assert.True(preview.IsValid);
        Assert.Equal((8, 5), (preview.ChallengerPositionBefore, preview.ChallengerPositionAfter));
    }

    [Fact]
    public async Task Preview_ReportsLaterMatchesThatWouldFallOutOfRange()
    {
        await Ladder.InitAsync(12);
        var first = await CreateMatchAsync(Input(challenger: 10, challenged: 5, day: 1));   // 10 -> #5
        await CreateMatchAsync(Input(challenger: 10, challenged: 1, day: 2));               // valid only thanks to the first

        // Now the first match's winner changes: player 10 never climbs, so match 2 would be 9 places up.
        var preview = await PreviewAsync(Input(challenger: 10, challenged: 5, day: 1, challengerWins: false), editing: first.Match.Id);

        Assert.True(preview.IsValid);
        Assert.Single(preview.NewlyWarnedMatchIds);
    }

    [Fact]
    public async Task Preview_OfAnUnknownMatchToEdit_Is404()
    {
        await Ladder.InitAsync(5);

        var response = await PostAsync("/api/admin/matches/preview?editingMatchId=999", Input(3, 2));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- create ----

    [Fact]
    public async Task Create_SavesTheResult_MovesTheLadder_AndExposesItPublicly()
    {
        await Ladder.InitAsync(10);

        var result = await CreateMatchAsync(Input(challenger: 8, challenged: 5, notes: "  Cancha 2  "));

        var match = result.Match;
        Assert.Equal("6-4 6-3", match.Result);
        Assert.Equal(MatchStatus.Valid, match.Status);
        Assert.Equal(Ladder.Ids[7], match.Winner.Id);
        Assert.Equal((8, 5, 5, 8), (match.ChallengerPositionBefore, match.ChallengerPositionAfter, match.ChallengedPositionBefore, match.ChallengedPositionAfter));
        Assert.Equal("Cancha 2", match.Notes);
        Assert.Null(match.Warning);
        Assert.Empty(result.NewlyWarnedMatchIds);

        Assert.Equal(Ids(1, 2, 3, 4, 8, 6, 7, 5, 9, 10), await PublicOrderAsync());
        var publicMatches = await GetAsync<PagedDto<MatchDto>>("/api/matches", Anonymous);
        Assert.Equal(match.Id, Assert.Single(publicMatches.Items).Id);
    }

    [Fact]
    public async Task Create_NormalMatch_ComputesTheWinnerFromTheScore_IgnoringTheDeclaredOne()
    {
        await Ladder.InitAsync(10);
        var input = Input(challenger: 8, challenged: 5, challengerWins: false) with { Winner = MatchSide.Challenger };

        var result = await CreateMatchAsync(input);

        Assert.Equal(Ladder.Ids[4], result.Match.Winner.Id);
    }

    [Fact]
    public async Task Create_SuperTieBreak_Works()
    {
        await Ladder.InitAsync(10);
        var score = new MatchScore([new SetScore(6, 4), new SetScore(3, 6)], new TieBreakScore(8, 10));
        var input = Input(challenger: 7, challenged: 5) with { Score = score };

        var result = await CreateMatchAsync(input);

        Assert.Equal("6-4 3-6 8-10", result.Match.Result);
        Assert.Equal(Ladder.Ids[4], result.Match.Winner.Id);
    }

    [Fact]
    public async Task Create_Walkover_NeedsAWinner_AndMovesTheLadderLikeAPlayedMatch()
    {
        await Ladder.InitAsync(10);
        var withoutWinner = Input(7, 5) with { Completion = CompletionType.Walkover, Score = null };

        var rejected = await PostAsync("/api/admin/matches", withoutWinner);
        var created = await CreateMatchAsync(withoutWinner with { Winner = MatchSide.Challenger });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, rejected.StatusCode);
        Assert.Contains("WinnerRequired", (await ProblemAsync(rejected)).Errors["winner"]);
        Assert.Equal("W.O.", created.Match.Result);
        Assert.Equal(Ladder.Ids[6], (await PublicOrderAsync())[4]);
    }

    [Fact]
    public async Task Create_Retirement_KeepsThePartialScore_AndTheDeclaredWinner()
    {
        await Ladder.InitAsync(10);
        var input = Input(7, 5) with
        {
            Completion = CompletionType.Retirement,
            Score = new MatchScore([new SetScore(2, 6), new SetScore(1, 3)]),
            Winner = MatchSide.Challenger,
        };

        var result = await CreateMatchAsync(input);

        Assert.Equal("2-6 1-3 (ab.)", result.Match.Result);
        Assert.Equal(Ladder.Ids[6], result.Match.Winner.Id);
        Assert.Equal(CompletionType.Retirement, result.Match.Completion);
    }

    [Fact]
    public async Task Create_AcceptsDatesWithAnOffset()
    {
        await Ladder.InitAsync(10);
        var local = new DateTimeOffset(2026, 3, 10, 22, 30, 0, TimeSpan.FromHours(-3));

        var result = await CreateMatchAsync(Input(7, 5) with { PlayedAt = local });

        Assert.Equal(local.ToUniversalTime(), result.Match.PlayedAt);
    }

    [Fact]
    public async Task Create_OutOfRange_IsRefusedUntilConfirmed()
    {
        await Ladder.InitAsync(12);

        var refused = await PostAsync("/api/admin/matches", Input(challenger: 12, challenged: 3));

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("OutOfRangeConfirmationRequired", (await ProblemAsync(refused)).Code);
        Assert.Equal(Ladder.Ids, await PublicOrderAsync());

        var confirmed = await CreateMatchAsync(Input(challenger: 12, challenged: 3, allowOutOfRange: true));

        Assert.Equal(RankingWarningCode.OutOfRange, confirmed.Match.Warning);
        Assert.Equal(3, (await PublicOrderAsync()).IndexOf(Ladder.Ids[11]) + 1);
    }

    [Fact]
    public async Task Create_ChallengingDownwards_IsOutOfRangeToo()
    {
        await Ladder.InitAsync(10);

        var refused = await PostAsync("/api/admin/matches", Input(challenger: 3, challenged: 6));

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
    }

    [Fact]
    public async Task Create_RangeBoundary_FiveIsFine_SixNeedsConfirmation()
    {
        await Ladder.InitAsync(12);

        var five = await PostAsync("/api/admin/matches", Input(challenger: 10, challenged: 5));
        Assert.Equal(HttpStatusCode.Created, five.StatusCode);

        var six = await PostAsync("/api/admin/matches", Input(challenger: 12, challenged: 6, day: 2));
        Assert.Equal(HttpStatusCode.Conflict, six.StatusCode);
    }

    [Fact]
    public async Task Create_RangeUsesThePositionsOfThatMomentInTime()
    {
        await Ladder.InitAsync(12);
        await CreateMatchAsync(Input(challenger: 10, challenged: 5, day: 1)); // 10 climbs to #5

        // Player 10 sits at #5 on day 2, so challenging #1 (4 places up) is fine without confirmation.
        var response = await PostAsync("/api/admin/matches", Input(challenger: 10, challenged: 1, day: 2));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Create_WithAnInvalidScore_Is422_AndSavesNothing()
    {
        await Ladder.InitAsync(10);
        var input = Input(8, 5) with { Score = new MatchScore([new SetScore(6, 4), new SetScore(7, 4)]) };

        var response = await PostAsync("/api/admin/matches", input);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var problem = await ProblemAsync(response);
        Assert.Equal("ValidationFailed", problem.Code);
        Assert.Contains("InvalidSet", problem.Errors["score"]);
        Assert.Equal(0, (await GetAsync<PagedDto<AdminMatchDto>>("/api/admin/matches")).Total);
        Assert.Equal(Ladder.Ids, await PublicOrderAsync());
    }

    [Fact]
    public async Task Create_RejectsSamePlayerUnknownPlayersAndFutureDates()
    {
        await Ladder.InitAsync(10);

        var same = await PostAsync("/api/admin/matches", Input(5, 5));
        var unknown = await PostAsync("/api/admin/matches", Input(8, 5) with { ChallengedId = 9999 });
        var future = await PostAsync("/api/admin/matches", Input(8, 5) with { PlayedAt = DateTimeOffset.UtcNow.AddDays(10) });

        Assert.Contains("SamePlayer", (await ProblemAsync(same)).Errors["challengedId"]);
        Assert.Contains("PlayerNotFound", (await ProblemAsync(unknown)).Errors["challengedId"]);
        Assert.Contains("DateInFuture", (await ProblemAsync(future)).Errors["playedAt"]);
    }

    [Fact]
    public async Task Create_WithAPlayerWhoLeftTheRanking_CannotBeApplied()
    {
        await Ladder.InitAsync(10);
        await PostAsync($"/api/admin/players/{Ladder.Ids[4]}/deactivate");

        var response = await PostAsync("/api/admin/matches", Input(8, 5) with { PlayedAt = DateTimeOffset.UtcNow.AddHours(1) });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var problem = await ProblemAsync(response);
        Assert.Equal("MatchNotApplicable", problem.Code);
        Assert.Contains("PlayerNotRanked", problem.Errors["match"]);
    }

    [Fact]
    public async Task Create_BackdatedBeforeThePlayerLeft_IsApplied()
    {
        await Ladder.InitAsync(10);
        await PostAsync($"/api/admin/players/{Ladder.Ids[4]}/deactivate"); // leaves "now"

        // A match played in March, before the player left: it counts, and everything is replayed in order.
        var response = await PostAsync("/api/admin/matches", Input(8, 5, day: 60));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.DoesNotContain(Ladder.Ids[4], await PublicOrderAsync());
    }

    [Fact]
    public async Task Create_BackdatedMatchThatDoesNotAffectLaterOnes_ReportsNoWarnings()
    {
        await Ladder.InitAsync(12);
        await CreateMatchAsync(Input(challenger: 10, challenged: 5, day: 5));                // day 5: 10 -> #5
        await CreateMatchAsync(Input(challenger: 10, challenged: 1, day: 10));               // fine thanks to day 5

        // Backdate a defense at the top of the ladder (day 1): it does not touch players 5, 10 or 1 after day 5.
        var backdated = await CreateMatchAsync(Input(challenger: 4, challenged: 3, day: 1, challengerWins: false));

        Assert.Empty(backdated.NewlyWarnedMatchIds);
    }

    // ---- edit ----

    [Fact]
    public async Task Update_Recalculates_AndFlagsLaterMatchesLeftOutOfRange()
    {
        await Ladder.InitAsync(12);
        var first = await CreateMatchAsync(Input(challenger: 10, challenged: 5, day: 1));
        var second = await CreateMatchAsync(Input(challenger: 10, challenged: 1, day: 2));
        Assert.Null(second.Match.Warning);

        // The defender actually won the first match.
        var response = await PutAsync($"/api/admin/matches/{first.Match.Id}", Input(challenger: 10, challenged: 5, day: 1, challengerWins: false));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await ReadAsync<MatchChangeResultDto>(response);
        Assert.Equal(Ladder.Ids[4], result.Match.Winner.Id);
        Assert.Equal("Player 05 defiende y sube del #5 al #4; Player 04 baja al #5", result.Match.MovementText);
        Assert.Equal([second.Match.Id], result.NewlyWarnedMatchIds);

        var stored = await GetAsync<AdminMatchDto>($"/api/admin/matches/{second.Match.Id}");
        Assert.Equal(RankingWarningCode.OutOfRange, stored.Warning);
        Assert.True(stored.UpdatedAt == second.Match.UpdatedAt);
    }

    [Fact]
    public async Task Update_OutOfRangeNeedsConfirmation()
    {
        await Ladder.InitAsync(12);
        var created = await CreateMatchAsync(Input(challenger: 8, challenged: 5));

        var refused = await PutAsync($"/api/admin/matches/{created.Match.Id}", Input(challenger: 12, challenged: 2));
        var confirmed = await PutAsync($"/api/admin/matches/{created.Match.Id}", Input(challenger: 12, challenged: 2, allowOutOfRange: true));

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal(HttpStatusCode.OK, confirmed.StatusCode);
    }

    [Fact]
    public async Task Update_ChangesDateAndNotes_AndTouchesUpdatedAt()
    {
        await Ladder.InitAsync(10);
        var created = await CreateMatchAsync(Input(challenger: 8, challenged: 5, day: 1));

        var response = await PutAsync($"/api/admin/matches/{created.Match.Id}", Input(8, 5, day: 3, notes: "Reprogramado"));

        var updated = (await ReadAsync<MatchChangeResultDto>(response)).Match;
        Assert.Equal(Ladder.Start.AddDays(3), updated.PlayedAt);
        Assert.Equal("Reprogramado", updated.Notes);
        Assert.True(updated.UpdatedAt >= created.Match.UpdatedAt);
        Assert.Equal(created.Match.CreatedAt, updated.CreatedAt);
    }

    [Fact]
    public async Task Update_WithAnInvalidScore_Is422_AndKeepsTheMatchUntouched()
    {
        await Ladder.InitAsync(10);
        var created = await CreateMatchAsync(Input(8, 5));

        var response = await PutAsync($"/api/admin/matches/{created.Match.Id}", Input(8, 5) with { Score = StraightSets() with { Sets = [new SetScore(9, 1), new SetScore(6, 3)] } });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("6-4 6-3", (await GetAsync<AdminMatchDto>($"/api/admin/matches/{created.Match.Id}")).Result);
    }

    [Fact]
    public async Task Update_Unknown_Is404_AndVoided_Is409()
    {
        await Ladder.InitAsync(10);
        var created = await CreateMatchAsync(Input(8, 5));
        await PostAsync($"/api/admin/matches/{created.Match.Id}/void");

        var unknown = await PutAsync("/api/admin/matches/9999", Input(8, 5));
        var voided = await PutAsync($"/api/admin/matches/{created.Match.Id}", Input(8, 5));

        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, voided.StatusCode);
        Assert.Equal("MatchVoided", (await ProblemAsync(voided)).Code);
    }

    // ---- void ----

    [Fact]
    public async Task Void_RestoresTheLadder_AndHidesTheMatchPublicly_ButKeepsItForTheAdmin()
    {
        await Ladder.InitAsync(10);
        var created = await CreateMatchAsync(Input(challenger: 8, challenged: 5));
        Assert.NotEqual(Ladder.Ids, await PublicOrderAsync());

        var response = await PostAsync($"/api/admin/matches/{created.Match.Id}/void");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var voided = (await ReadAsync<MatchChangeResultDto>(response)).Match;
        Assert.Equal(MatchStatus.Voided, voided.Status);
        Assert.Null(voided.MovementText);
        Assert.Null(voided.ChallengerPositionBefore);

        Assert.Equal(Ladder.Ids, await PublicOrderAsync());
        Assert.Empty((await GetAsync<PagedDto<MatchDto>>("/api/matches", Anonymous)).Items);
        var adminList = await GetAsync<PagedDto<AdminMatchDto>>("/api/admin/matches");
        Assert.Equal(MatchStatus.Voided, Assert.Single(adminList.Items).Status);
        Assert.All(await PublicRankingAsync(), r => Assert.Equal(0, r.Played));
    }

    [Fact]
    public async Task Void_FlagsLaterMatchesThatFallOutOfRange()
    {
        await Ladder.InitAsync(12);
        var first = await CreateMatchAsync(Input(challenger: 10, challenged: 5, day: 1));
        var second = await CreateMatchAsync(Input(challenger: 10, challenged: 1, day: 2));

        var result = await ReadAsync<MatchChangeResultDto>(await PostAsync($"/api/admin/matches/{first.Match.Id}/void"));

        Assert.Equal([second.Match.Id], result.NewlyWarnedMatchIds);
        var flagged = await GetAsync<PagedDto<AdminMatchDto>>("/api/admin/matches?withWarnings=true");
        Assert.Equal(second.Match.Id, Assert.Single(flagged.Items).Id);
        // Not blocked: the second match is still applied.
        Assert.Equal(Ladder.Ids[9], (await PublicOrderAsync())[0]);
    }

    [Fact]
    public async Task Void_IsIdempotent_AndUnknownIs404()
    {
        await Ladder.InitAsync(10);
        var created = await CreateMatchAsync(Input(8, 5));

        var first = await PostAsync($"/api/admin/matches/{created.Match.Id}/void");
        var second = await PostAsync($"/api/admin/matches/{created.Match.Id}/void");
        var unknown = await PostAsync("/api/admin/matches/9999/void");

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
    }

    // ---- list / get ----

    [Fact]
    public async Task List_FiltersByStatusPlayerAndDates_AndPages()
    {
        await Ladder.InitAsync(12);
        var a = await CreateMatchAsync(Input(8, 5, day: 1));
        await CreateMatchAsync(Input(9, 7, day: 5));
        await CreateMatchAsync(Input(11, 10, day: 9));
        await PostAsync($"/api/admin/matches/{a.Match.Id}/void");

        var voided = await GetAsync<PagedDto<AdminMatchDto>>("/api/admin/matches?status=Voided");
        var valid = await GetAsync<PagedDto<AdminMatchDto>>("/api/admin/matches?status=Valid");
        var byPlayer = await GetAsync<PagedDto<AdminMatchDto>>($"/api/admin/matches?playerId={Ladder.Ids[8]}");
        var byDate = await GetAsync<PagedDto<AdminMatchDto>>("/api/admin/matches?from=2026-01-04&to=2026-01-08");
        var paged = await GetAsync<PagedDto<AdminMatchDto>>("/api/admin/matches?page=2&pageSize=2");

        Assert.Equal(1, voided.Total);
        Assert.Equal(2, valid.Total);
        Assert.Equal(1, byPlayer.Total);
        Assert.Equal(1, byDate.Total);
        Assert.Equal((3, 1), (paged.Total, paged.Items.Count));
        Assert.Equal(HttpStatusCode.BadRequest, (await Admin.GetAsync("/api/admin/matches?pageSize=0")).StatusCode);
    }

    [Fact]
    public async Task Get_UnknownMatch_Is404()
    {
        var response = await Admin.GetAsync("/api/admin/matches/9999");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
