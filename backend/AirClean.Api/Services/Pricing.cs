using AirClean.Api.Models;
namespace AirClean.Api.Services;

/// <summary>A job as far as its price goes: the units by kind, a deep clean or not, and the hard-to-reach outdoor units.</summary>
public record JobSpec(IReadOnlyList<JobItem> Items, bool Deep, int HardAccessUnits)
{
    public int Units => Items.Sum(x => x.Count);
    public int LargeUnits => Items.Sum(x => Math.Min(x.Large, x.Count));
}

/// <summary>
/// How AirClean prices a cleaning. A customer cannot be expected to know prices, so they only describe what they can
/// see; each technician keeps a price list and every quote is worked out from it, line by line. The going rate for a job
/// comes from all approved technicians' lists, so a quote can be shown as low, typical or high.
/// </summary>
public static class Pricing
{
    /// <summary>
    /// AirClean's reference prices (baht per unit), used while there are too few technicians to say what the going
    /// rate is, and as the starting point for a technician's list. Kept close to what Bangkok technicians ask.
    /// </summary>
    public static readonly PriceSheet Reference = new() {
        Wall = 600, WallDeep = 1200, Hanging = 1000, HangingDeep = 1800, Cassette = 1200, CassetteDeep = 2200, Large = 200, HardAccess = 300,
    };
    /// <summary>Below this many technicians the going rate is AirClean's reference instead.</summary>
    public const int MinTechniciansForRange = 3;

    public static readonly string[] LastCleanedValues = ["under6m", "6to12m", "over1y", "unknown"];
    public static readonly string[] SymptomValues = ["drip", "warm", "smell", "noise"];

    public static string KindName(string kind) => kind switch { AcKinds.Hanging => "แขวน/ตั้งพื้น", AcKinds.Cassette => "ฝังฝ้า", _ => "ติดผนัง" };
    public static string CleanName(bool deep) => deep ? "ล้างใหญ่" : "ล้างธรรมดา";

    /// <summary>The list a technician quotes from: their own, or for older profiles one scaled from their single base price.</summary>
    public static PriceSheet SheetOf(TechnicianProfile technician) => technician.Prices ?? FromBase(technician.BasePrice);

    /// <summary>The reference list scaled so a standard wall-unit clean costs <paramref name="basePrice"/>, rounded to 50 baht.</summary>
    public static PriceSheet FromBase(decimal basePrice)
    {
        var ratio = basePrice > 0 ? basePrice / Reference.Wall : 1;
        decimal Scale(decimal value) => Math.Max(50, Math.Round(value * ratio / 50, MidpointRounding.AwayFromZero) * 50);
        return new PriceSheet {
            Wall = basePrice > 0 ? basePrice : Reference.Wall, WallDeep = Scale(Reference.WallDeep), Hanging = Scale(Reference.Hanging), HangingDeep = Scale(Reference.HangingDeep),
            Cassette = Scale(Reference.Cassette), CassetteDeep = Scale(Reference.CassetteDeep), Large = Scale(Reference.Large), HardAccess = Scale(Reference.HardAccess),
        };
    }

    public static decimal PerUnit(PriceSheet sheet, string kind, bool deep) => kind switch {
        AcKinds.Hanging => deep ? sheet.HangingDeep : sheet.Hanging,
        AcKinds.Cassette => deep ? sheet.CassetteDeep : sheet.Cassette,
        _ => deep ? sheet.WallDeep : sheet.Wall,
    };

    /// <summary>The price of a job from one list, as lines a customer can read (one per kind, then the additions).</summary>
    public static List<PriceLine> Lines(PriceSheet sheet, JobSpec job)
    {
        var lines = new List<PriceLine>();
        foreach (var kind in AcKinds.All)
        {
            var count = job.Items.Where(x => x.Kind == kind).Sum(x => x.Count);
            if (count == 0) continue;
            var each = PerUnit(sheet, kind, job.Deep);
            lines.Add(new PriceLine { Kind = "clean", Label = $"{CleanName(job.Deep)} · แอร์{KindName(kind)}", Quantity = count, UnitPrice = each, Amount = each * count });
        }
        // A technician who does not charge extra (0) gets no line for it.
        if (job.LargeUnits > 0 && sheet.Large > 0)
            lines.Add(new PriceLine { Kind = "large", Label = "เพิ่ม: แอร์ใหญ่กว่า 24,000 BTU", Quantity = job.LargeUnits, UnitPrice = sheet.Large, Amount = sheet.Large * job.LargeUnits });
        var hard = Math.Clamp(job.HardAccessUnits, 0, job.Units);
        if (hard > 0 && sheet.HardAccess > 0)
            lines.Add(new PriceLine { Kind = "access", Label = "เพิ่ม: คอยล์ร้อนอยู่ที่สูงหรือเข้าถึงยาก", Quantity = hard, UnitPrice = sheet.HardAccess, Amount = sheet.HardAccess * hard });
        return lines;
    }

    public static decimal Total(IEnumerable<PriceLine> lines) => lines.Sum(x => x.Amount);

    /// <summary>
    /// The going rate: most technicians (the middle 60%) charge between Low and High, and Mid is the job priced at the
    /// typical (median) price of each line. With fewer than three technicians, AirClean's reference stands in.
    /// </summary>
    public static PriceRange Range(IReadOnlyCollection<PriceSheet> sheets, JobSpec job)
    {
        if (sheets.Count < MinTechniciansForRange)
        {
            var reference = Total(Lines(Reference, job));
            return new PriceRange { Low = RoundTen(reference * 0.85m), Mid = reference, High = RoundTen(reference * 1.25m), Technicians = sheets.Count, Reference = true };
        }
        var totals = sheets.Select(x => Total(Lines(x, job))).Order().ToList();
        var mid = Total(Lines(Median(sheets), job));
        var low = Math.Min(RoundTen(Percentile(totals, 0.2)), mid);
        var high = Math.Max(RoundTen(Percentile(totals, 0.8)), mid);
        return new PriceRange { Low = low, Mid = mid, High = high, Technicians = sheets.Count };
    }

    /// <summary>The typical price of each line across technicians (also shown to technicians next to their own list).</summary>
    public static PriceSheet Median(IReadOnlyCollection<PriceSheet> sheets) => At(sheets, 0.5);

    /// <summary>Each line at percentile <paramref name="p"/> across technicians, rounded to whole baht.</summary>
    public static PriceSheet At(IReadOnlyCollection<PriceSheet> sheets, double p)
    {
        if (sheets.Count == 0) return Reference;
        decimal Line(Func<PriceSheet, decimal> field) => Math.Round(Percentile(sheets.Select(field).Order().ToList(), p), MidpointRounding.AwayFromZero);
        return new PriceSheet {
            Wall = Line(x => x.Wall), WallDeep = Line(x => x.WallDeep), Hanging = Line(x => x.Hanging), HangingDeep = Line(x => x.HangingDeep),
            Cassette = Line(x => x.Cassette), CassetteDeep = Line(x => x.CassetteDeep), Large = Line(x => x.Large), HardAccess = Line(x => x.HardAccess),
        };
    }

    /// <summary>"low", "typical" or "high" against the going rate.</summary>
    public static string Position(decimal quote, PriceRange range) => quote < range.Low ? "low" : quote > range.High ? "high" : "typical";

    /// <summary>A short name for the job, e.g. "ล้างธรรมดา แอร์ติดผนัง + ฝังฝ้า".</summary>
    public static string ServiceName(JobSpec job)
    {
        var kinds = AcKinds.All.Where(kind => job.Items.Any(x => x.Kind == kind && x.Count > 0)).Select(KindName).ToList();
        return $"{CleanName(job.Deep)} แอร์{string.Join(" + ", kinds.DefaultIfEmpty(KindName(AcKinds.Wall)))}";
    }

    /// <summary>The job as described, or for jobs posted before units were described, read back from the service name.</summary>
    public static JobSpec JobOf(Booking booking)
    {
        if (booking.Items is { Count: > 0 }) return new JobSpec(booking.Items, booking.Deep, booking.HardAccessUnits);
        var kind = booking.Service.Contains("ฝังฝ้า") ? AcKinds.Cassette : booking.Service.Contains("แขวน") ? AcKinds.Hanging : AcKinds.Wall;
        return new JobSpec([new JobItem { Kind = kind, Count = Math.Max(1, booking.UnitCount) }], booking.Deep, booking.HardAccessUnits);
    }

    /// <summary>The agreed price as lines: the stored ones, or one line for jobs agreed before prices had lines.</summary>
    public static List<PriceLine> AgreedLines(Booking booking)
    {
        var lines = booking.PriceLines is { Count: > 0 } ? [.. booking.PriceLines]
            : new List<PriceLine> { new() { Kind = "clean", Label = booking.Service, Quantity = Math.Max(1, booking.UnitCount),
                UnitPrice = Math.Round((booking.Price - Total(booking.Extras ?? [])) / Math.Max(1, booking.UnitCount), 2), Amount = booking.Price - Total(booking.Extras ?? []) } };
        return [.. lines, .. booking.Extras ?? []];
    }

    /// <summary>Checks what the customer or technician described; null when it is fine, otherwise the message to show.</summary>
    public static string? Invalid(IReadOnlyList<JobItem>? items, int hardAccessUnits, int maxUnits = 300)
    {
        if (items is null || items.Count == 0) return "เลือกแอร์ที่จะล้างอย่างน้อย 1 เครื่อง";
        if (items.Count > 10) return "ระบุแอร์ได้ไม่เกิน 10 แบบ";
        if (items.Any(x => !AcKinds.All.Contains(x.Kind))) return "แบบแอร์ไม่ถูกต้อง";
        if (items.Any(x => x.Count < 1 || x.Count > maxUnits || x.Large < 0 || x.Large > x.Count)) return "จำนวนแอร์ไม่ถูกต้อง";
        var units = items.Sum(x => x.Count);
        if (units > maxUnits) return $"จองได้ไม่เกิน {maxUnits} เครื่องต่องาน แบ่งเป็นหลายงานได้";
        if (hardAccessUnits < 0 || hardAccessUnits > units) return "จำนวนคอยล์ร้อนที่เข้าถึงยากต้องไม่เกินจำนวนแอร์";
        return null;
    }

    /// <summary>Items of the same kind merged into one, so a job reads the same however it was entered.</summary>
    public static List<JobItem> Tidy(IEnumerable<JobItem> items) => AcKinds.All
        .Select(kind => items.Where(x => x.Kind == kind).ToList())
        .Where(group => group.Count > 0)
        .Select(group => new JobItem { Kind = group[0].Kind, Count = group.Sum(x => x.Count), Large = group.Sum(x => Math.Min(x.Large, x.Count)) })
        .ToList();

    /// <summary>Whether a technician does this job: every kind of unit in it, and a deep clean if it is one.</summary>
    public static bool Takes(TechnicianProfile technician, JobSpec job) =>
        job.Items.All(x => technician.Kinds is null || technician.Kinds.Contains(x.Kind)) && (!job.Deep || technician.OffersDeep != false);

    /// <summary>Linear-interpolated percentile of sorted values.</summary>
    private static decimal Percentile(IReadOnlyList<decimal> sorted, double p)
    {
        if (sorted.Count == 0) return 0;
        var position = (sorted.Count - 1) * (decimal)p;
        var below = (int)Math.Floor(position);
        var above = Math.Min(below + 1, sorted.Count - 1);
        return sorted[below] + (sorted[above] - sorted[below]) * (position - below);
    }

    private static decimal RoundTen(decimal value) => Math.Round(value / 10, MidpointRounding.AwayFromZero) * 10;
}
