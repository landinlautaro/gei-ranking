using System.Net;
using GeiRanking.Api.Admin;
using GeiRanking.Api.Tests.Support;

namespace GeiRanking.Api.Tests;

public class AdminAdjustmentTests(PostgresFixture fixture) : AdminApiTestBase(fixture), IClassFixture<PostgresFixture>
{
    private Task<HttpResponseMessage> AdjustAsync(int playerIndex, int newPosition, string? reason = "Corrección de resultado") =>
        PostAsync("/api/admin/ranking/adjustments", new ManualAdjustmentRequest(Ladder.Ids[playerIndex - 1], newPosition, reason));

    [Fact]
    public async Task MovesThePlayerUp_AndShiftsTheOthers()
    {
        await Ladder.InitAsync(6);

        var response = await AdjustAsync(playerIndex: 5, newPosition: 2);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await ReadAsync<ManualAdjustmentResultDto>(response);
        Assert.Equal((5, 2), (result.FromPosition, result.ToPosition));
        Assert.Equal(Ids(1, 5, 2, 3, 4, 6), await PublicOrderAsync());
    }

    [Fact]
    public async Task MovesThePlayerDown()
    {
        await Ladder.InitAsync(6);

        await AdjustAsync(playerIndex: 1, newPosition: 6);

        Assert.Equal(Ids(2, 3, 4, 5, 6, 1), await PublicOrderAsync());
    }

    [Fact]
    public async Task ShowsInThePlayersPositionHistory()
    {
        await Ladder.InitAsync(6);
        await AdjustAsync(playerIndex: 6, newPosition: 1);

        var profile = await GetAsync<GeiRanking.Api.Dtos.PlayerProfileDto>($"/api/players/{Ladder.Ids[5]}", Anonymous);

        Assert.Equal(1, profile.Position);
        Assert.Equal(1, profile.BestPosition);
        Assert.Equal(6, profile.PreviousPosition);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task ReasonIsMandatory(string? reason)
    {
        await Ladder.InitAsync(4);

        var response = await AdjustAsync(2, 1, reason);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("Required", (await ProblemAsync(response)).Errors["reason"]);
        Assert.Equal(Ladder.Ids, await PublicOrderAsync());
    }

    [Fact]
    public async Task RejectsTooLongReasons_BadPositions_AndNoOps()
    {
        await Ladder.InitAsync(4);

        var longReason = await ProblemAsync(await AdjustAsync(2, 1, new string('x', 501)));
        var zero = await ProblemAsync(await AdjustAsync(2, 0));
        var beyond = await ProblemAsync(await AdjustAsync(2, 5));
        var same = await ProblemAsync(await AdjustAsync(2, 2));

        Assert.Contains("TooLong", longReason.Errors["reason"]);
        Assert.Contains("OutOfBounds", zero.Errors["newPosition"]);
        Assert.Contains("OutOfBounds", beyond.Errors["newPosition"]);
        Assert.Contains("SamePosition", same.Errors["newPosition"]);
        Assert.Equal(Ladder.Ids, await PublicOrderAsync());
    }

    [Fact]
    public async Task UnknownPlayer_Is404_AndPlayerOutsideTheRanking_Is409()
    {
        await Ladder.InitAsync(4);
        await PostAsync($"/api/admin/players/{Ladder.Ids[3]}/deactivate");

        var unknown = await PostAsync("/api/admin/ranking/adjustments", new ManualAdjustmentRequest(9999, 1, "x"));
        var inactive = await AdjustAsync(4, 1);

        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, inactive.StatusCode);
        Assert.Equal("PlayerNotInRanking", (await ProblemAsync(inactive)).Code);
    }
}
