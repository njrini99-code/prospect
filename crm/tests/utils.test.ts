import { describe, expect, it } from "vitest";
import {
  scoreColor,
  triggerColor,
  statusColor,
  channelLabel,
  num,
  initials,
  estAnnualRev,
  getWeekStart,
  formatDate,
  timeAgo,
} from "@/lib/utils";

describe("scoreColor", () => {
  it("returns emerald for high scores", () => {
    expect(scoreColor(90)).toContain("emerald");
  });
  it("returns amber for mid scores", () => {
    expect(scoreColor(50)).toContain("amber");
  });
  it("returns rose for low scores", () => {
    expect(scoreColor(20)).toContain("rose");
  });
  it("handles null gracefully", () => {
    expect(scoreColor(null)).toContain("zinc");
  });
  it("respects boundary at 80", () => {
    expect(scoreColor(80)).toContain("emerald-500/15");
  });
  it("respects boundary at 65", () => {
    expect(scoreColor(65)).toContain("emerald");
  });
});

describe("triggerColor", () => {
  it("maps displacement to blue", () => {
    expect(triggerColor("displacement_trinet")).toContain("blue");
  });
  it("maps tech to violet", () => {
    expect(triggerColor("tech_growth")).toContain("violet");
  });
  it("maps osha/compliance to orange", () => {
    expect(triggerColor("osha")).toContain("orange");
    expect(triggerColor("compliance_5500")).toContain("orange");
  });
  it("maps wc renewal to emerald", () => {
    expect(triggerColor("wc_renewal")).toContain("emerald");
  });
  it("falls back to zinc", () => {
    expect(triggerColor(undefined)).toContain("zinc");
  });
});

describe("statusColor", () => {
  it("won is emerald", () => {
    expect(statusColor("Closed-Won")).toContain("emerald");
  });
  it("lost/disqualified is rose", () => {
    expect(statusColor("DISQUALIFIED")).toContain("rose");
  });
  it("warm is amber", () => {
    expect(statusColor("WARM")).toContain("amber");
  });
});

describe("channelLabel", () => {
  it("normalizes email", () => {
    expect(channelLabel("email")).toBe("Email");
    expect(channelLabel("e")).toBe("Email");
  });
  it("normalizes call", () => {
    expect(channelLabel("phone")).toBe("Call");
  });
  it("normalizes drop", () => {
    expect(channelLabel("field")).toBe("Drop");
  });
  it("returns em-dash for null", () => {
    expect(channelLabel(null)).toBe("—");
  });
});

describe("num", () => {
  it("formats integers", () => {
    expect(num(1234)).toBe("1,234");
  });
  it("returns em-dash for null", () => {
    expect(num(null)).toBe("—");
  });
  it("handles strings", () => {
    expect(num("42")).toBe("42");
  });
});

describe("initials", () => {
  it("first two words", () => {
    expect(initials("Nick Rini")).toBe("NR");
  });
  it("single word", () => {
    expect(initials("Aida")).toBe("A");
  });
  it("em-dash for null", () => {
    expect(initials(null)).toBe("—");
  });
});

describe("estAnnualRev", () => {
  it("computes 1500/EE", () => {
    expect(estAnnualRev(30)).toBe(45000);
  });
  it("handles null", () => {
    expect(estAnnualRev(null)).toBe(0);
  });
});

describe("getWeekStart", () => {
  it("returns a Monday-start ISO date", () => {
    const d = new Date(2026, 4, 14); // Thursday May 14 2026
    const ws = getWeekStart(d);
    expect(ws).toBe("2026-05-11");
  });
  it("rolls back from Sunday", () => {
    const d = new Date(2026, 4, 17); // Sunday May 17 2026
    const ws = getWeekStart(d);
    expect(ws).toBe("2026-05-11");
  });
});

describe("formatDate", () => {
  it("formats short date", () => {
    expect(formatDate("2026-05-11")).toMatch(/May/);
  });
  it("handles null", () => {
    expect(formatDate(null)).toBe("—");
  });
});

describe("timeAgo", () => {
  it("returns a string", () => {
    const r = timeAgo(new Date(Date.now() - 60_000));
    expect(typeof r).toBe("string");
  });
});
