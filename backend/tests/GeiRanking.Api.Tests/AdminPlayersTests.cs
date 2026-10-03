using System.Net;
using System.Net.Http.Headers;
using GeiRanking.Api.Admin;
using GeiRanking.Api.Tests.Support;
using GeiRanking.Domain.Players;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace GeiRanking.Api.Tests;

public class AdminPlayersTests(PostgresFixture fixture) : AdminApiTestBase(fixture), IClassFixture<PostgresFixture>
{
    private static CreatePlayerRequest NewPlayer(string name = "Nuevo Jugador", int? position = null) =>
        new(name, "Nuevo", Handedness.LeftHanded, BackhandStyle.TwoHanded, null, position);

    private async Task<AdminPlayerDto> CreateAsync(CreatePlayerRequest request)
    {
        var response = await PostAsync("/api/admin/players", request);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await ReadAsync<AdminPlayerDto>(response);
    }

    private static byte[] Png(int width, int height)
    {
        using var image = new Image<Rgba32>(width, height, new Rgba32(30, 120, 200));
        using var stream = new MemoryStream();
        image.SaveAsPng(stream);
        return stream.ToArray();
    }

    private Task<HttpResponseMessage> UploadAsync(int playerId, byte[] bytes, string fileName = "foto.png", string contentType = "image/png")
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        content.Add(file, "file", fileName);
        return Admin.PutAsync($"/api/admin/players/{playerId}/photo", content);
    }

    // ---- create ----

    [Fact]
    public async Task Create_GoesLast_ByDefault_AndShowsUpInThePublicRanking()
    {
        await Ladder.InitAsync(5);

        var created = await CreateAsync(NewPlayer());

        Assert.Equal(6, created.Position);
        Assert.True(created.IsActive);
        Assert.Equal(Handedness.LeftHanded, created.Hand);
        Assert.Equal(Ladder.Ids.Append(created.Id), await PublicOrderAsync());
    }

    [Fact]
    public async Task Create_AtAGivenPosition_ShiftsTheOthersDown()
    {
        await Ladder.InitAsync(5);

        var created = await CreateAsync(NewPlayer(position: 2));

        Assert.Equal(2, created.Position);
        Assert.Equal([Ladder.Ids[0], created.Id, Ladder.Ids[1], Ladder.Ids[2], Ladder.Ids[3], Ladder.Ids[4]], await PublicOrderAsync());
    }

    [Fact]
    public async Task Create_TrimsNames_AndStoresBlankNicknameAsNull()
    {
        await Ladder.InitAsync(2);

        var created = await CreateAsync(new CreatePlayerRequest("  Ana Gómez  ", "   ", null, null, null, null));

        Assert.Equal("Ana Gómez", created.FullName);
        Assert.Null(created.Nickname);
    }

    [Fact]
    public async Task Create_AcceptsDatesWithAnyOffset()
    {
        await Ladder.InitAsync(2);
        var joined = new DateTimeOffset(2026, 3, 10, 9, 0, 0, TimeSpan.FromHours(-3));

        var created = await CreateAsync(new CreatePlayerRequest("Ana", null, null, null, joined, null));

        Assert.Equal(joined.ToUniversalTime(), created.JoinedAt);
    }

    [Theory]
    [InlineData(null, "fullName", "Required")]
    [InlineData("   ", "fullName", "Required")]
    public async Task Create_RequiresAName(string? name, string field, string code)
    {
        var response = await PostAsync("/api/admin/players", new CreatePlayerRequest(name, null, null, null, null, null));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var problem = await ProblemAsync(response);
        Assert.Equal("ValidationFailed", problem.Code);
        Assert.Contains(code, problem.Errors[field]);
    }

    [Fact]
    public async Task Create_RejectsTooLongNamesAndBadPositions()
    {
        var response = await PostAsync("/api/admin/players", new CreatePlayerRequest(new string('x', 121), new string('y', 61), null, null, null, 0));

        var problem = await ProblemAsync(response);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("TooLong", problem.Errors["fullName"]);
        Assert.Contains("TooLong", problem.Errors["nickname"]);
        Assert.Contains("MustBePositive", problem.Errors["position"]);
    }

    [Fact]
    public async Task Create_WithoutAnyoneInTheLadder_Works()
    {
        var created = await CreateAsync(NewPlayer());

        Assert.Equal(1, created.Position);
    }

    // ---- update / get / list ----

    [Fact]
    public async Task Update_ChangesData_ButNotPosition()
    {
        await Ladder.InitAsync(4);
        var id = Ladder.Ids[2];

        var response = await PutAsync($"/api/admin/players/{id}", new UpdatePlayerRequest("Nombre Nuevo", "Apodo", Handedness.RightHanded, BackhandStyle.OneHanded, null));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await ReadAsync<AdminPlayerDto>(response);
        Assert.Equal(("Nombre Nuevo", "Apodo", 3), (updated.FullName, updated.Nickname, updated.Position));
        Assert.Equal(Handedness.RightHanded, updated.Hand);
        Assert.Equal(BackhandStyle.OneHanded, updated.Backhand);
    }

    [Fact]
    public async Task Update_RefreshesTheMovementTextOfHisMatches()
    {
        await Ladder.InitAsync(8);
        var match = await CreateMatchAsync(Input(challenger: 6, challenged: 4));
        Assert.Contains("Player 06", match.Match.MovementText);

        await PutAsync($"/api/admin/players/{Ladder.Ids[5]}", new UpdatePlayerRequest("Renombrado", null, null, null, null));

        var reloaded = await GetAsync<AdminMatchDto>($"/api/admin/matches/{match.Match.Id}");
        Assert.StartsWith("Renombrado pasa del #6 al #4", reloaded.MovementText);
    }

    [Fact]
    public async Task Update_Validates_AndReturns404ForUnknownPlayers()
    {
        await Ladder.InitAsync(2);

        var blank = await PutAsync($"/api/admin/players/{Ladder.Ids[0]}", new UpdatePlayerRequest(" ", null, null, null, null));
        var missing = await PutAsync("/api/admin/players/9999", new UpdatePlayerRequest("Alguien", null, null, null, null));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, blank.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task List_ShowsEveryone_WithPositions_AndCanHideInactive()
    {
        await Ladder.InitAsync(3);
        await PostAsync($"/api/admin/players/{Ladder.Ids[1]}/deactivate");

        var all = await GetAsync<List<AdminPlayerDto>>("/api/admin/players");
        var active = await GetAsync<List<AdminPlayerDto>>("/api/admin/players?includeInactive=false");

        Assert.Equal(3, all.Count);
        Assert.Null(all.Single(p => p.Id == Ladder.Ids[1]).Position);
        Assert.Equal(2, active.Count);
    }

    [Fact]
    public async Task Get_UnknownPlayer_Is404()
    {
        var response = await Admin.GetAsync("/api/admin/players/9999");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("NotFound", (await ProblemAsync(response)).Code);
    }

    // ---- deactivate / reactivate ----

    [Fact]
    public async Task Deactivate_RemovesFromTheRanking_AndEveryoneBelowMovesUp_KeepingHistory()
    {
        await Ladder.InitAsync(6);
        var matchId = (await CreateMatchAsync(Input(challenger: 5, challenged: 3))).Match.Id; // 5 -> #3, 3 -> #5
        var leaving = Ladder.Ids[2];

        var response = await PostAsync($"/api/admin/players/{leaving}/deactivate");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var dto = await ReadAsync<AdminPlayerDto>(response);
        Assert.False(dto.IsActive);
        Assert.Null(dto.Position);
        Assert.Equal(Ids(1, 2, 5, 4, 6), await PublicOrderAsync());

        // The player and his match remain.
        var profile = await Anonymous.GetAsync($"/api/players/{leaving}");
        Assert.Equal(HttpStatusCode.OK, profile.StatusCode);
        var history = await GetAsync<GeiRanking.Api.Dtos.PagedDto<GeiRanking.Api.Dtos.MatchDto>>($"/api/matches?playerId={leaving}", Anonymous);
        Assert.Equal(matchId, Assert.Single(history.Items).Id);
    }

    [Fact]
    public async Task Deactivate_Twice_Is409()
    {
        await Ladder.InitAsync(3);
        await PostAsync($"/api/admin/players/{Ladder.Ids[0]}/deactivate");

        var again = await PostAsync($"/api/admin/players/{Ladder.Ids[0]}/deactivate");

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal("AlreadyInactive", (await ProblemAsync(again)).Code);
    }

    [Fact]
    public async Task Deactivate_UnknownPlayer_Is404()
    {
        var response = await PostAsync("/api/admin/players/9999/deactivate");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Reactivate_PutsThePlayerBack_LastOrWhereAsked()
    {
        await Ladder.InitAsync(5);
        await PostAsync($"/api/admin/players/{Ladder.Ids[1]}/deactivate");

        var response = await PostAsync($"/api/admin/players/{Ladder.Ids[1]}/reactivate", new ReactivatePlayerRequest(2));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var dto = await ReadAsync<AdminPlayerDto>(response);
        Assert.True(dto.IsActive);
        Assert.Equal(2, dto.Position);
        Assert.Equal(Ladder.Ids, await PublicOrderAsync());

        await PostAsync($"/api/admin/players/{Ladder.Ids[0]}/deactivate");
        var last = await ReadAsync<AdminPlayerDto>(await PostAsync($"/api/admin/players/{Ladder.Ids[0]}/reactivate", new ReactivatePlayerRequest(null)));
        Assert.Equal(5, last.Position);
    }

    [Fact]
    public async Task Reactivate_AnActivePlayer_Is409()
    {
        await Ladder.InitAsync(3);

        var response = await PostAsync($"/api/admin/players/{Ladder.Ids[0]}/reactivate", new ReactivatePlayerRequest(null));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("AlreadyActive", (await ProblemAsync(response)).Code);
    }

    // ---- photo ----

    [Fact]
    public async Task Photo_IsCropped_To400Square_StoredAsJpeg_AndServed()
    {
        await Ladder.InitAsync(2);
        var id = Ladder.Ids[0];

        var response = await UploadAsync(id, Png(900, 500));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var dto = await ReadAsync<AdminPlayerDto>(response);
        Assert.StartsWith("/photos/player-", dto.PhotoPath);
        Assert.EndsWith(".jpg", dto.PhotoPath);

        var file = Path.Combine(PhotosDirectory, Path.GetFileName(dto.PhotoPath!));
        Assert.True(File.Exists(file));
        var info = await Image.IdentifyAsync(file);
        Assert.Equal((400, 400), (info.Width, info.Height));

        var served = await Anonymous.GetAsync(dto.PhotoPath);
        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal("image/jpeg", served.Content.Headers.ContentType?.MediaType);

        // Public API exposes the path, never the bytes.
        var profile = await GetAsync<GeiRanking.Api.Dtos.PlayerProfileDto>($"/api/players/{id}", Anonymous);
        Assert.Equal(dto.PhotoPath, profile.PhotoPath);
    }

    [Fact]
    public async Task Photo_Replacing_DeletesTheOldFile()
    {
        await Ladder.InitAsync(2);
        var id = Ladder.Ids[0];
        var first = await ReadAsync<AdminPlayerDto>(await UploadAsync(id, Png(500, 500)));
        var second = await ReadAsync<AdminPlayerDto>(await UploadAsync(id, Png(450, 600)));

        Assert.NotEqual(first.PhotoPath, second.PhotoPath);
        Assert.False(File.Exists(Path.Combine(PhotosDirectory, Path.GetFileName(first.PhotoPath!))));
        Assert.True(File.Exists(Path.Combine(PhotosDirectory, Path.GetFileName(second.PhotoPath!))));
    }

    [Fact]
    public async Task Photo_Delete_RemovesTheFile_AndIsIdempotent()
    {
        await Ladder.InitAsync(2);
        var id = Ladder.Ids[0];
        var uploaded = await ReadAsync<AdminPlayerDto>(await UploadAsync(id, Png(500, 500)));

        var deleted = await Admin.DeleteAsync($"/api/admin/players/{id}/photo");
        var again = await Admin.DeleteAsync($"/api/admin/players/{id}/photo");

        Assert.Equal(HttpStatusCode.OK, deleted.StatusCode);
        Assert.Null((await ReadAsync<AdminPlayerDto>(deleted)).PhotoPath);
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.False(File.Exists(Path.Combine(PhotosDirectory, Path.GetFileName(uploaded.PhotoPath!))));
    }

    [Fact]
    public async Task Photo_RejectsFilesThatAreNotSupportedImages()
    {
        await Ladder.InitAsync(2);

        var text = await UploadAsync(Ladder.Ids[0], "this is not an image"u8.ToArray(), "foto.png");
        var truncated = await UploadAsync(Ladder.Ids[0], Png(300, 300)[..40]);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, text.StatusCode);
        Assert.Contains("UnsupportedFormat", (await ProblemAsync(text)).Errors["photo"]);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, truncated.StatusCode);
        Assert.False(Directory.Exists(PhotosDirectory) && Directory.GetFiles(PhotosDirectory).Length > 0);
    }

    [Fact]
    public async Task Photo_RejectsGifBecauseOnlyJpegPngAndWebpAreAllowed()
    {
        await Ladder.InitAsync(2);
        using var image = new Image<Rgba32>(50, 50);
        using var stream = new MemoryStream();
        image.SaveAsGif(stream);

        var response = await UploadAsync(Ladder.Ids[0], stream.ToArray(), "foto.gif", "image/gif");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task Photo_RejectsFilesOverFiveMegabytes()
    {
        await Ladder.InitAsync(2);

        var response = await UploadAsync(Ladder.Ids[0], new byte[5 * 1024 * 1024 + 1]);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("TooLarge", (await ProblemAsync(response)).Errors["photo"]);
    }

    [Fact]
    public async Task Photo_ForUnknownPlayer_Is404()
    {
        var response = await UploadAsync(9999, Png(100, 100));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Photos_CannotEscapeTheStorageDirectory()
    {
        var response = await Anonymous.GetAsync("/photos/..%2f..%2fappsettings.json");

        Assert.NotEqual(HttpStatusCode.OK, response.StatusCode);
    }
}
