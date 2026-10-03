namespace GeiRanking.Domain.Players;

public enum Handedness
{
    RightHanded,
    LeftHanded,
}

public enum BackhandStyle
{
    OneHanded,
    TwoHanded,
}

/// <summary>Players are never deleted: leaving the club sets <see cref="IsActive"/> to false.</summary>
public class Player
{
    public int Id { get; set; }

    public required string FullName { get; set; }

    public string? Nickname { get; set; }

    /// <summary>Path of the stored photo (never the image bytes).</summary>
    public string? PhotoPath { get; set; }

    public Handedness? Hand { get; set; }

    public BackhandStyle? Backhand { get; set; }

    public DateTimeOffset JoinedAt { get; set; }

    public bool IsActive { get; set; } = true;
}
