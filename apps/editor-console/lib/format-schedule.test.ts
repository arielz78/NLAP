import { afterEach, describe, expect, it } from "vitest";

import { formatSchedule } from "./format-schedule";

const originalTimeZone = process.env.TZ;

/** Pins the process timezone and proves the pin took effect. */
function useTimeZone(timeZone: string, expectedOffsetMinutes: number) {
  process.env.TZ = timeZone;
  expect(new Date(2026, 9, 17).getTimezoneOffset()).toBe(expectedOffsetMinutes);
}

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

describe("formatSchedule", () => {
  it("renders a date-only event on its own calendar day with no time in Toronto", () => {
    useTimeZone("America/Toronto", 240);

    expect(formatSchedule("2026-10-17")).toBe("Sat, Oct 17");
  });

  it("does not shift a date-only event under a UTC process timezone", () => {
    useTimeZone("UTC", 0);

    expect(formatSchedule("2026-10-17")).toBe("Sat, Oct 17");
  });

  it("does not shift a date-only event east of UTC either", () => {
    useTimeZone("Pacific/Kiritimati", -840);

    expect(formatSchedule("2026-10-17")).toBe("Sat, Oct 17");
  });

  it.each([
    ["America/Toronto", 240],
    ["UTC", 0],
  ])("renders a timed event in Toronto time when the process runs in %s", (timeZone, offset) => {
    useTimeZone(timeZone, offset);

    expect(formatSchedule("2026-09-12T19:30:00-04:00")).toBe(
      "Sat, Sep 12 · 7:30 p.m.",
    );
    // 01:30 UTC on the 18th is still the evening of the 17th in Toronto.
    expect(formatSchedule("2026-10-18T01:30:00Z")).toBe(
      "Sat, Oct 17 · 9:30 p.m.",
    );
  });
});
