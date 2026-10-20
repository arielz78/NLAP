import { describe, expect, it, vi } from "vitest";

import type { SubmissionSnapshot } from "@/lib/contracts";
import { notifySubmission } from "@/lib/server/notify-submission";

const submission = {
  issueDate: "2026-10-22",
  submittedAt: "2026-10-21T14:00:00.000Z",
  buildVersion: 1,
  revision: 1,
  replacements: [{}, {}],
  selfFilledSlots: [{}],
} as unknown as SubmissionSnapshot;

const configured = { RESEND_API_KEY: "re_test", SUBMIT_NOTIFY_EMAIL: "me@example.com" };

describe("notifySubmission", () => {
  it("sends nothing unless both the key and the address are set", async () => {
    const fetchImpl = vi.fn();
    await notifySubmission(submission, {}, fetchImpl);
    await notifySubmission(submission, { RESEND_API_KEY: "re_test" }, fetchImpl);
    await notifySubmission(submission, { SUBMIT_NOTIFY_EMAIL: "me@example.com" }, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends one email naming the issue date", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await notifySubmission(submission, configured, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    const body = JSON.parse(init.body);
    expect(body.to).toEqual(["me@example.com"]);
    expect(body.subject).toBe("Editor submitted 2026-10-22");
    expect(body.text).toContain("Swaps: 2. Self-filled slots: 1.");
  });

  it("never throws when the request fails or is rejected", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      notifySubmission(submission, configured, vi.fn().mockRejectedValue(new Error("offline"))),
    ).resolves.toBeUndefined();
    await expect(
      notifySubmission(
        submission,
        configured,
        vi.fn().mockResolvedValue(new Response("{}", { status: 403 })),
      ),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });
});
