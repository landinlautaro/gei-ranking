using GeiRanking.Api.Dtos;
using GeiRanking.Domain;
using GeiRanking.Domain.Challenges;
using GeiRanking.Domain.Ranking;
using GeiRanking.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace GeiRanking.Api.Admin;

/// <summary>
/// Register, edit and cancel challenges. They are not ranking events, so nothing here recalculates the ranking; the
/// link with a match is made by <see cref="MatchAdminService"/> when the result is loaded.
/// </summary>
public sealed class ChallengeAdminService(AppDbContext db, TimeProvider clock, ILogger<ChallengeAdminService> logger)
{
    private static readonly TimeSpan FutureTolerance = TimeSpan.FromDays(1);

    private static readonly ChallengeRules Rules = ChallengeRules.Default;

    // ---- Queries ----

    public async Task<AdminChallengeDto> GetAsync(int id, CancellationToken ct)
    {
        var challenge = await db.Challenges.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id, ct) ?? throw ApiProblemException.NotFound("Challenge");
        return (await ToDtosAsync([challenge], ct))[0];
    }

    public async Task<PagedDto<AdminChallengeDto>> ListAsync(
        ChallengeFilter? filter, int? playerId, DateOnly? weekOf, int page, int pageSize, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var query = db.Challenges.AsNoTracking().AsQueryable();

        query = filter switch
        {
            ChallengeFilter.Active => query.Where(c => c.Status == ChallengeStatus.Pending || c.Status == ChallengeStatus.Scheduled),
            ChallengeFilter.Expired => query.Where(c => (c.Status == ChallengeStatus.Pending || c.Status == ChallengeStatus.Scheduled) && c.DeadlineAt < now),
            ChallengeFilter.Pending => query.Where(c => c.Status == ChallengeStatus.Pending),
            ChallengeFilter.Scheduled => query.Where(c => c.Status == ChallengeStatus.Scheduled),
            ChallengeFilter.Played => query.Where(c => c.Status == ChallengeStatus.Played),
            ChallengeFilter.Cancelled => query.Where(c => c.Status == ChallengeStatus.Cancelled),
            _ => query,
        };

        if (playerId is { } pid)
        {
            query = query.Where(c => c.ChallengerId == pid || c.ChallengedId == pid);
        }

        if (weekOf is { } day)
        {
            var (start, end) = WeekBounds(ClubClock.StartOfDayUtc(day));
            query = query.Where(c => c.IssuedAt >= start && c.IssuedAt < end);
        }

        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(c => c.IssuedAt).ThenByDescending(c => c.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return new PagedDto<AdminChallengeDto>(await ToDtosAsync(items, ct), total, page, pageSize);
    }

    public async Task<ChallengePreviewDto> PreviewAsync(ChallengeInput input, CancellationToken ct)
    {
        var evaluation = await EvaluateAsync(input, ct);
        return new ChallengePreviewDto(
            evaluation.Errors.Count == 0, evaluation.Errors.ToDictionary(e => e.Key, e => e.Value),
            evaluation.ChallengerPosition, evaluation.ChallengedPosition,
            evaluation.Errors.Count == 0 ? evaluation.DeadlineAt : null, evaluation.Warnings);
    }

    // ---- Commands ----

    public async Task<AdminChallengeDto> CreateAsync(ChallengeInput input, CancellationToken ct)
    {
        var evaluation = await EvaluateAsync(input, ct);
        if (evaluation.Errors.Count > 0)
        {
            throw Invalid(evaluation.Errors);
        }

        if (evaluation.Warnings.Count > 0 && !input.ConfirmWarnings)
        {
            throw ApiProblemException.Conflict(
                "ChallengeWarningsRequireConfirmation",
                $"The challenge breaks: {string.Join(", ", evaluation.Warnings)}. Send confirmWarnings=true to save it anyway.");
        }

        var now = clock.GetUtcNow();
        var challenge = new Challenge
        {
            ChallengerId = input.ChallengerId,
            ChallengedId = input.ChallengedId,
            IssuedAt = evaluation.IssuedAt,
            DeadlineAt = evaluation.DeadlineAt,
            ScheduledAt = input.ScheduledAt?.ToUniversalTime(),
            Status = input.ScheduledAt is null ? ChallengeStatus.Pending : ChallengeStatus.Scheduled,
            Notes = CleanNotes(input.Notes),
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Challenges.Add(challenge);
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Challenge {ChallengeId} created: player {ChallengerId} vs {ChallengedId}, deadline {Deadline}. Warnings: {Warnings}",
            challenge.Id, challenge.ChallengerId, challenge.ChallengedId, challenge.DeadlineAt, evaluation.Warnings);
        return await GetAsync(challenge.Id, ct);
    }

    public async Task<AdminChallengeDto> UpdateAsync(int id, ChallengeUpdateRequest request, CancellationToken ct)
    {
        var challenge = await db.Challenges.FirstOrDefaultAsync(c => c.Id == id, ct) ?? throw ApiProblemException.NotFound("Challenge");
        EnsureActive(challenge);

        var now = clock.GetUtcNow();
        var errors = new Dictionary<string, string[]>();
        if (request.IssuedAt.ToUniversalTime() > now + FutureTolerance)
        {
            errors["issuedAt"] = ["DateInFuture"];
        }

        if (request.DeadlineAt <= request.IssuedAt)
        {
            errors["deadlineAt"] = ["BeforeIssuedAt"];
        }

        if (request.Notes?.Trim().Length > 1000)
        {
            errors["notes"] = ["TooLong"];
        }

        if (errors.Count > 0)
        {
            throw Invalid(errors);
        }

        challenge.IssuedAt = request.IssuedAt.ToUniversalTime();
        challenge.DeadlineAt = request.DeadlineAt.ToUniversalTime();
        challenge.ScheduledAt = request.ScheduledAt?.ToUniversalTime();
        challenge.Status = request.ScheduledAt is null ? ChallengeStatus.Pending : ChallengeStatus.Scheduled;
        challenge.Notes = CleanNotes(request.Notes);
        challenge.UpdatedAt = now;
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Challenge {ChallengeId} updated: deadline {Deadline}, scheduled {ScheduledAt}", id, challenge.DeadlineAt, challenge.ScheduledAt);
        return await GetAsync(id, ct);
    }

    /// <summary>Logical removal: the challenge stays in the history. Cancelling twice is a no-op; a played one cannot be cancelled.</summary>
    public async Task<AdminChallengeDto> CancelAsync(int id, CancelChallengeRequest request, CancellationToken ct)
    {
        var challenge = await db.Challenges.FirstOrDefaultAsync(c => c.Id == id, ct) ?? throw ApiProblemException.NotFound("Challenge");
        if (challenge.Status == ChallengeStatus.Cancelled)
        {
            return await GetAsync(id, ct);
        }

        EnsureActive(challenge);

        var reason = request.Reason?.Trim();
        if (reason?.Length > 500)
        {
            throw ApiProblemException.Invalid("reason", "TooLong");
        }

        challenge.Status = ChallengeStatus.Cancelled;
        challenge.Notes = CleanNotes(string.IsNullOrEmpty(reason) ? challenge.Notes : $"{challenge.Notes}\nCancelado: {reason}");
        challenge.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);

        logger.LogInformation("Challenge {ChallengeId} cancelled. Reason: {Reason}", id, reason);
        return await GetAsync(id, ct);
    }

    // ---- Evaluation ----

    private sealed class Evaluation
    {
        public Dictionary<string, string[]> Errors { get; } = [];

        public DateTimeOffset IssuedAt { get; init; }

        public DateTimeOffset DeadlineAt { get; init; }

        public int? ChallengerPosition { get; set; }

        public int? ChallengedPosition { get; set; }

        public List<ChallengeWarning> Warnings { get; } = [];
    }

    private async Task<Evaluation> EvaluateAsync(ChallengeInput input, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var issuedAt = (input.IssuedAt ?? now).ToUniversalTime();
        var evaluation = new Evaluation { IssuedAt = issuedAt, DeadlineAt = Rules.DeadlineFor(issuedAt) };
        var errors = evaluation.Errors;

        if (input.ChallengerId == input.ChallengedId)
        {
            errors["challengedId"] = ["SamePlayer"];
        }

        var positions = await db.RankingSnapshot.AsNoTracking()
            .Where(s => s.PlayerId == input.ChallengerId || s.PlayerId == input.ChallengedId)
            .ToDictionaryAsync(s => s.PlayerId, s => s.Position, ct);
        var known = await db.Players.AsNoTracking()
            .Where(p => p.Id == input.ChallengerId || p.Id == input.ChallengedId)
            .Select(p => p.Id).ToListAsync(ct);

        // Not ranked (inactive or removed) blocks: the ladder has no place for them.
        if (!errors.ContainsKey("challengerId"))
        {
            CheckPlayer("challengerId", input.ChallengerId);
        }

        if (!errors.ContainsKey("challengedId"))
        {
            CheckPlayer("challengedId", input.ChallengedId);
        }

        if (issuedAt > now + FutureTolerance)
        {
            errors["issuedAt"] = ["DateInFuture"];
        }

        if (input.Notes?.Trim().Length > 1000)
        {
            errors["notes"] = ["TooLong"];
        }

        if (input.ScheduledAt is { } scheduled && (scheduled < issuedAt || scheduled > evaluation.DeadlineAt))
        {
            errors["scheduledAt"] = [scheduled < issuedAt ? "BeforeIssuedAt" : "AfterDeadline"];
        }

        if (errors.Count > 0)
        {
            return evaluation;
        }

        evaluation.ChallengerPosition = positions[input.ChallengerId];
        evaluation.ChallengedPosition = positions[input.ChallengedId];

        if (!RankingRules.Default.IsChallengeInRange(evaluation.ChallengerPosition.Value, evaluation.ChallengedPosition.Value))
        {
            evaluation.Warnings.Add(ChallengeWarning.OutOfRange);
        }

        if (!Rules.IsWithinChallengeWindow(issuedAt))
        {
            evaluation.Warnings.Add(ChallengeWarning.OutsideChallengeWindow);
        }

        var (weekStart, weekEnd) = WeekBounds(issuedAt);
        var alreadyThisWeek = await db.Challenges.AsNoTracking().AnyAsync(c =>
            c.Status != ChallengeStatus.Cancelled && c.IssuedAt >= weekStart && c.IssuedAt < weekEnd
            && (c.ChallengerId == input.ChallengerId || c.ChallengedId == input.ChallengerId
                || c.ChallengerId == input.ChallengedId || c.ChallengedId == input.ChallengedId), ct);
        if (alreadyThisWeek)
        {
            evaluation.Warnings.Add(ChallengeWarning.AlreadyChallengedThisWeek);
        }

        return evaluation;

        void CheckPlayer(string field, int playerId)
        {
            if (!known.Contains(playerId))
            {
                errors[field] = ["PlayerNotFound"];
            }
            else if (!positions.ContainsKey(playerId))
            {
                errors[field] = ["PlayerNotRanked"];
            }
        }
    }

    // ---- Helpers ----

    /// <summary>UTC bounds [start, end) of the club week the instant falls in.</summary>
    private static (DateTimeOffset Start, DateTimeOffset End) WeekBounds(DateTimeOffset instant)
    {
        var monday = ClubClock.WeekStart(instant);
        return (ClubClock.StartOfDayUtc(monday), ClubClock.StartOfDayUtc(monday.AddDays(7)));
    }

    private static void EnsureActive(Challenge challenge)
    {
        if (!challenge.IsActive)
        {
            throw ApiProblemException.Conflict("ChallengeNotActive", $"The challenge is {challenge.Status} and can no longer be changed.");
        }
    }

    private static ApiProblemException Invalid(IDictionary<string, string[]> errors) =>
        new(StatusCodes.Status422UnprocessableEntity, "ValidationFailed", "One or more fields are invalid.", errors);

    private static string? CleanNotes(string? notes) => string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();

    private async Task<List<AdminChallengeDto>> ToDtosAsync(IReadOnlyList<Challenge> challenges, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var players = await db.Players.AsNoTracking()
            .ToDictionaryAsync(p => p.Id, p => new PlayerRefDto(p.Id, p.FullName, p.Nickname, p.PhotoPath), ct);
        var positions = await db.RankingSnapshot.AsNoTracking().ToDictionaryAsync(s => s.PlayerId, s => s.Position, ct);

        return challenges.Select(c => new AdminChallengeDto(
            c.Id, players[c.ChallengerId], players[c.ChallengedId],
            positions.TryGetValue(c.ChallengerId, out var cp) ? cp : null,
            positions.TryGetValue(c.ChallengedId, out var dp) ? dp : null,
            c.IssuedAt, c.DeadlineAt, c.Status, c.IsExpired(now), c.ScheduledAt, c.MatchId, c.Notes, c.CreatedAt, c.UpdatedAt)).ToList();
    }
}
