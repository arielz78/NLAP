import type { SubmissionSnapshot } from "@/lib/contracts";

/**
 * Emails the operator that the editor submitted, so the write-back can start without waiting.
 * Sends nothing unless both RESEND_API_KEY and SUBMIT_NOTIFY_EMAIL are set. Never throws:
 * a failed notification must not affect a submission that has already been saved.
 */
export async function notifySubmission(
  submission: SubmissionSnapshot,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  const to = env.SUBMIT_NOTIFY_EMAIL;
  if (!apiKey || !to) return;

  const selfFilled = submission.selfFilledSlots?.length ?? 0;
  const text = [
    `Issue ${submission.issueDate} was submitted at ${submission.submittedAt}.`,
    `Build version ${submission.buildVersion}, submission revision ${submission.revision}.`,
    `Swaps: ${submission.replacements.length}. Self-filled slots: ${selfFilled}.`,
    "",
    `Next: node scripts/applySubmission.js --issue ${submission.issueDate} --build <bundle.json>`,
  ].join("\n");

  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.SUBMIT_NOTIFY_FROM ?? "Editor Console <onboarding@resend.dev>",
        to: [to],
        subject: `Editor submitted ${submission.issueDate}`,
        text,
      }),
    });
    if (!response.ok) {
      console.error(`Submit notification failed: HTTP ${response.status}`);
    }
  } catch (error) {
    console.error("Submit notification failed:", error);
  }
}
