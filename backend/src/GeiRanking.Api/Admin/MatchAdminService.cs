using GeiRanking.Api.Dtos;
using GeiRanking.Domain.Matches;
using GeiRanking.Domain.Ranking;
using GeiRanking.Infrastructure;
using GeiRanking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace GeiRanking.Api.Admin;

/// <summary>
/// Create, edit, void and preview matches. Every write goes through <see cref="RankingService.ExecuteAsync"/>, so the match,
/// its ranking event and the full recalculation commit together or not at all.
/// </summary>
public sealed class MatchAdminService(AppDbContext db, RankingService ranking, TimeProvider clock, ILogger<MatchAdminService> logger)
{
    private static readonly TimeSpan FutureTolerance = TimeSpan.FromDays(1);

    // ---- Queries ----

    public async Task<AdminMatchDto> GetAsync(int id, CancellationToken ct)
    {
        var match = await db.Matches.AsNoTracking().FirstOrDefaultAsync(m => m.Id == id, ct) ?? throw ApiProblemException.NotFound("Match");
        var players = await PublicRefsAsync(ct);
        return ToDto(match, players);
    }

    public async Task<MatchPreviewDto> PreviewAsync(MatchInput input, int? editingMatchId, CancellationToken ct)
    {
        if (editingMatchId is { } id)
        {
            await EnsureEditableAsync(id, ct);
        }

        var evaluation = await EvaluateAsync(input, editingMatchId, ct);
        var outcome = evaluation.Outcome;
        var notApplicable = outcome is { Movement: MovementKind.NotApplied };

        if (notApplicable)
        {
            evaluation.Errors["match"] = [outcome!.Warning!.Value.ToString()];
        }

        return new MatchPreviewDto(
            IsValid: evaluation.Errors.Count == 0,
            Errors: evaluation.Errors.ToDictionary(e => e.Key, e => e.Value),
            WinnerSide: evaluation.WinnerSide,
            WinnerId: evaluation.WinnerId,
            Movement: outcome?.Movement,
            MovementText: outcome is null || notApplicable ? null : outcome.Describe(id => evaluation.Names.GetValueOrDefault(id, $"#{id}")),
            ChallengerPositionBefore: outcome?.ChallengerPositionBefore,
            ChallengerPositionAfter: outcome?.ChallengerPositionAfter,
            ChallengedPositionBefore: outcome?.ChallengedPositionBefore,
            ChallengedPositionAfter: outcome?.ChallengedPositionAfter,
            Warning: outcome?.Warning,
            RequiresOutOfRangeConfirmation: outcome?.Warning == RankingWarningCode.OutOfRange,
            NewlyWarnedMatchIds: evaluation.NewlyWarned);
    }

    // ---- Commands ----

    public async Task<MatchChangeResultDto> CreateAsync(MatchInput input, CancellationToken ct)
    {
        var evaluation = await EvaluateAsync(input, editingMatchId: null, ct);
        ThrowUnlessSavable(evaluation, input.AllowOutOfRange);

        var warnedBefore = await WarnedMatchIdsAsync(ct);
        var now = clock.GetUtcNow();
        var id = 0;

        await ranking.ExecuteAsync(async (context, token) =>
        {
            var match = new Match
            {
                PlayedAt = evaluation.PlayedAt,
                ChallengerId = input.ChallengerId,
                ChallengedId = input.ChallengedId,
                WinnerId = evaluation.WinnerId!.Value,
                Score = input.Score ?? MatchScore.Empty,
                Completion = input.Completion,
                Notes = CleanNotes(input.Notes),
                CreatedAt = now,
                UpdatedAt = now,
            };
            context.Matches.Add(match);
            await context.SaveChangesAsync(token);

            context.RankingEvents.Add(new StoredRankingEvent
            {
                Kind = RankingEventKind.MatchPlayed, MatchId = match.Id, OccurredAt = match.PlayedAt, CreatedAt = now,
            });
            await context.SaveChangesAsync(token);
            id = match.Id;
        }, ct);

        var result = await ChangeResultAsync(id, warnedBefore, ct);
        logger.LogInformation("Match {MatchId} created: {Challenger} vs {Challenged}, result {Result}. {Movement}",
            id, result.Match.Challenger.FullName, result.Match.Challenged.FullName, result.Match.Result, result.Match.MovementText);
        LogNewWarnings(id, result);
        return result;
    }

    public async Task<MatchChangeResultDto> UpdateAsync(int id, MatchInput input, CancellationToken ct)
    {
        await EnsureEditableAsync(id, ct);
        var evaluation = await EvaluateAsync(input, id, ct);
        ThrowUnlessSavable(evaluation, input.AllowOutOfRange);

        var warnedBefore = await WarnedMatchIdsAsync(ct);
        var now = clock.GetUtcNow();

        await ranking.ExecuteAsync(async (context, token) =>
        {
            var match = await context.Matches.SingleAsync(m => m.Id == id, token);
            match.PlayedAt = evaluation.PlayedAt;
            match.ChallengerId = input.ChallengerId;
            match.ChallengedId = input.ChallengedId;
            match.WinnerId = evaluation.WinnerId!.Value;
            match.Score = input.Score ?? MatchScore.Empty;
            match.Completion = input.Completion;
            match.Notes = CleanNotes(input.Notes);
            match.UpdatedAt = now;
            await context.SaveChangesAsync(token);
        }, ct);

        var result = await ChangeResultAsync(id, warnedBefore, ct);
        logger.LogInformation("Match {MatchId} updated: {Challenger} vs {Challenged}, result {Result}. {Movement}",
            id, result.Match.Challenger.FullName, result.Match.Challenged.FullName, result.Match.Result, result.Match.MovementText);
        LogNewWarnings(id, result);
        return result;
    }

    /// <summary>Voids a match (it stays in the history but no longer counts). Voiding twice is a no-op.</summary>
    public async Task<MatchChangeResultDto> VoidAsync(int id, CancellationToken ct)
    {
        var existing = await db.Matches.AsNoTracking().FirstOrDefaultAsync(m => m.Id == id, ct) ?? throw ApiProblemException.NotFound("Match");
        var warnedBefore = await WarnedMatchIdsAsync(ct);

        var alreadyVoided = existing.Status == MatchStatus.Voided;
        if (!alreadyVoided)
        {
            var now = clock.GetUtcNow();
            await ranking.ExecuteAsync(async (context, token) =>
            {
                var match = await context.Matches.SingleAsync(m => m.Id == id, token);
                match.Status = MatchStatus.Voided;
                match.UpdatedAt = now;
                await context.SaveChangesAsync(token);
            }, ct);
        }

        var result = await ChangeResultAsync(id, warnedBefore, ct);
        if (!alreadyVoided)
        {
            logger.LogInformation("Match {MatchId} voided: {Challenger} vs {Challenged}", id, result.Match.Challenger.FullName, result.Match.Challenged.FullName);
            LogNewWarnings(id, result);
        }

        return result;
    }

    private void LogNewWarnings(int matchId, MatchChangeResultDto result)
    {
        if (result.NewlyWarnedMatchIds.Count > 0)
        {
            logger.LogWarning("Change to match {MatchId} left {Count} later match(es) out of range: {MatchIds}",
                matchId, result.NewlyWarnedMatchIds.Count, result.NewlyWarnedMatchIds);
        }
    }

    // ---- Evaluation: validation + in-memory replay ----

    private sealed class Evaluation
    {
        public Dictionary<string, string[]> Errors { get; } = [];

        public DateTimeOffset PlayedAt { get; init; }

        public MatchSide? WinnerSide { get; set; }

        public int? WinnerId { get; set; }

        public MatchOutcome? Outcome { get; set; }

        public IReadOnlyList<int> NewlyWarned { get; set; } = [];

        public Dictionary<int, string> Names { get; set; } = [];
    }

    private async Task<Evaluation> EvaluateAsync(MatchInput input, int? editingMatchId, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var evaluation = new Evaluation { PlayedAt = input.PlayedAt.ToUniversalTime() };
        var errors = evaluation.Errors;

        if (input.ChallengerId == input.ChallengedId)
        {
            errors["challengedId"] = ["SamePlayer"];
        }

        // All names: the movement text can mention a third player (the one displaced by a successful defense).
        var players = await db.Players.AsNoTracking().ToDictionaryAsync(p => p.Id, p => p.FullName, ct);
        evaluation.Names = players;
        if (!players.ContainsKey(input.ChallengerId))
        {
            errors["challengerId"] = ["PlayerNotFound"];
        }

        if (!errors.ContainsKey("challengedId") && !players.ContainsKey(input.ChallengedId))
        {
            errors["challengedId"] = ["PlayerNotFound"];
        }

        if (evaluation.PlayedAt > now + FutureTolerance)
        {
            errors["playedAt"] = ["DateInFuture"];
        }

        if (input.Notes?.Trim().Length > 1000)
        {
            errors["notes"] = ["TooLong"];
        }

        var score = ScoreValidator.Validate(input.Score, input.Completion, input.Winner);
        var scoreErrors = score.Errors.Where(e => e != ScoreError.WinnerRequired).Select(e => e.ToString()).ToArray();
        if (scoreErrors.Length > 0)
        {
            errors["score"] = scoreErrors;
        }

        if (score.Errors.Contains(ScoreError.WinnerRequired))
        {
            errors["winner"] = [nameof(ScoreError.WinnerRequired)];
        }

        if (errors.Count > 0)
        {
            return evaluation;
        }

        evaluation.WinnerSide = score.Winner;
        evaluation.WinnerId = score.Winner == MatchSide.Challenger ? input.ChallengerId : input.ChallengedId;

        var events = await ranking.LoadDomainEventsAsync(ct);
        var baseline = RankingEngine.Replay(events);

        var matchId = editingMatchId ?? -1;
        var modified = events.ToList();
        if (editingMatchId is not null)
        {
            var index = modified.FindIndex(e => e is MatchPlayed mp && mp.MatchId == editingMatchId);
            if (index < 0)
            {
                throw ApiProblemException.NotFound("Match");
            }

            modified[index] = ((MatchPlayed)modified[index]) with
            {
                OccurredAt = evaluation.PlayedAt,
                ChallengerId = input.ChallengerId,
                ChallengedId = input.ChallengedId,
                WinnerId = evaluation.WinnerId.Value,
                IsVoided = false,
            };
        }
        else
        {
            modified.Add(new MatchPlayed(long.MaxValue, evaluation.PlayedAt, now, matchId, input.ChallengerId, input.ChallengedId, evaluation.WinnerId.Value));
        }

        var after = RankingEngine.Replay(modified);
        evaluation.Outcome = after.Outcomes[matchId];
        evaluation.NewlyWarned = after.Outcomes
            .Where(o => o.Key != matchId && o.Value.Warning is not null
                && !(baseline.Outcomes.TryGetValue(o.Key, out var before) && before.Warning is not null))
            .Select(o => o.Key)
            .Order()
            .ToList();

        return evaluation;
    }

    private static void ThrowUnlessSavable(Evaluation evaluation, bool allowOutOfRange)
    {
        if (evaluation.Errors.Count > 0)
        {
            throw new ApiProblemException(
                StatusCodes.Status422UnprocessableEntity, "ValidationFailed", "One or more fields are invalid.", evaluation.Errors);
        }

        var outcome = evaluation.Outcome!;
        if (outcome.Movement == MovementKind.NotApplied)
        {
            throw new ApiProblemException(
                StatusCodes.Status422UnprocessableEntity, "MatchNotApplicable", "The match cannot be applied to the ranking.",
                new Dictionary<string, string[]> { ["match"] = [outcome.Warning!.Value.ToString()] });
        }

        if (outcome.Warning == RankingWarningCode.OutOfRange && !allowOutOfRange)
        {
            throw ApiProblemException.Conflict(
                "OutOfRangeConfirmationRequired", "The challenge is outside the allowed range. Send allowOutOfRange=true to save it anyway.");
        }
    }

    // ---- Helpers ----

    private async Task EnsureEditableAsync(int id, CancellationToken ct)
    {
        var status = await db.Matches.AsNoTracking().Where(m => m.Id == id).Select(m => (MatchStatus?)m.Status).FirstOrDefaultAsync(ct)
            ?? throw ApiProblemException.NotFound("Match");
        if (status == MatchStatus.Voided)
        {
            throw ApiProblemException.Conflict("MatchVoided", "A voided match cannot be edited.");
        }
    }

    private Task<HashSet<int>> WarnedMatchIdsAsync(CancellationToken ct) =>
        db.Matches.AsNoTracking().Where(m => m.Warning != null).Select(m => m.Id).ToHashSetAsync(ct);

    private async Task<MatchChangeResultDto> ChangeResultAsync(int id, HashSet<int> warnedBefore, CancellationToken ct)
    {
        var dto = await GetAsync(id, ct);
        var warnedAfter = await WarnedMatchIdsAsync(ct);
        var newly = warnedAfter.Where(m => m != id && !warnedBefore.Contains(m)).Order().ToList();
        return new MatchChangeResultDto(dto, newly);
    }

    private async Task<Dictionary<int, PlayerRefDto>> PublicRefsAsync(CancellationToken ct) =>
        await db.Players.AsNoTracking().ToDictionaryAsync(p => p.Id, p => new PlayerRefDto(p.Id, p.FullName, p.Nickname, p.PhotoPath), ct);

    private static string? CleanNotes(string? notes) => string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();

    public static AdminMatchDto ToDto(Match m, IReadOnlyDictionary<int, PlayerRefDto> players) => new(
        m.Id, m.PlayedAt, players[m.ChallengerId], players[m.ChallengedId], players[m.WinnerId],
        m.FormatResult(), m.Score, m.Completion, m.Status,
        m.ChallengerPositionBefore, m.ChallengerPositionAfter, m.ChallengedPositionBefore, m.ChallengedPositionAfter,
        m.MovementText, m.Warning, m.Notes, m.CreatedAt, m.UpdatedAt);
}
