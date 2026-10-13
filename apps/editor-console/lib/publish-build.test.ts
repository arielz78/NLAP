import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import type { IssueBuild } from "@/lib/contracts";
import { mockIssueBuild } from "@/lib/mock-issue";

import {
  bundleSelfHash,
  canonicalJson,
  parseBundle,
  publishBuild,
  PublishRefusedError,
  type EditableDraftRef,
  type PublishStore,
} from "./publish-build";

/** The fixture with a real self-hash, as to-bundle.js would have written it. */
function bundle(change: (draft: IssueBuild) => void = () => {}): IssueBuild {
  const draft = structuredClone(mockIssueBuild);
  change(draft);
  return { ...draft, bundleHash: bundleSelfHash(draft) };
}

function memoryStore(
  seed: { builds?: IssueBuild[]; drafts?: EditableDraftRef[] } = {},
) {
  const builds = [...(seed.builds ?? [])];
  const drafts = [...(seed.drafts ?? [])];
  const ref = (build: IssueBuild) => ({
    id: build.id,
    issueKey: build.issueKey,
    buildVersion: build.buildVersion,
    bundleHash: build.bundleHash,
  });
  const store: PublishStore = {
    async findBuildByHash(hash) {
      const found = builds.find((build) => build.bundleHash === hash);
      return found ? ref(found) : null;
    },
    async findBuildByVersion(issueKey, buildVersion) {
      const found = builds.find(
        (build) => build.issueKey === issueKey && build.buildVersion === buildVersion,
      );
      return found ? ref(found) : null;
    },
    async editableDraftsForIssue(issueKey) {
      return drafts.filter((draft) =>
        builds.some(
          (build) => build.id === draft.buildId && build.issueKey === issueKey,
        ),
      );
    },
    async insertBuild(build) {
      builds.push(build);
      return true;
    },
  };
  return { store, builds };
}

async function refusal(run: Promise<unknown>) {
  const error = await run.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(PublishRefusedError);
  return (error as PublishRefusedError).message;
}

describe("publish-build: the bundle check", () => {
  it("accepts a complete bundle", () => {
    expect(parseBundle(bundle()).issueKey).toBe("vaughan-brief-2026-09-17");
  });

  it("refuses a bundle missing a section", () => {
    const input = bundle((draft) => {
      draft.sections = draft.sections.filter((section) => section.id !== "couples");
    });
    expect(() => parseBundle(input)).toThrow(/Missing section: couples/);
  });

  it("refuses an unclassified pick", () => {
    const input = bundle((draft) => {
      draft.sections[0].selected[0].classification = "unclassified";
    });
    expect(() => parseBundle(input)).toThrow(/sections\.0\.selected\.0\.classification/);
  });

  it("refuses an unclassified alternative", () => {
    const input = bundle((draft) => {
      draft.sections[2].alternatives[1].candidate.classification = "unclassified";
    });
    expect(() => parseBundle(input)).toThrow(
      /sections\.2\.alternatives\.1\.candidate\.classification/,
    );
  });

  it("refuses a section without exactly five picks", () => {
    const input = bundle((draft) => {
      draft.sections[1].selected.pop();
    });
    expect(() => parseBundle(input)).toThrow(/couples: 4 of 5 picks/);
  });

  it("refuses a bundle changed after it was built", () => {
    const input = bundle();
    input.sections[0].selected[0].title = "Edited by hand";
    expect(() => parseBundle(input)).toThrow(/bundleHash does not match/);
  });

  it("refuses a field the contract does not have", () => {
    const input = { ...bundle(), extra: true };
    expect(() => parseBundle(input)).toThrow(PublishRefusedError);
  });

  it("names every problem in one refusal", () => {
    const input = bundle((draft) => {
      draft.sections = draft.sections.slice(0, 2);
      draft.sections[0].selected.pop();
    });
    const message = (() => {
      try {
        parseBundle(input);
        return "";
      } catch (error) {
        return (error as Error).message;
      }
    })();
    expect(message).toMatch(/Missing section: golden-age/);
    expect(message).toMatch(/families: 4 of 5 picks/);
  });

  it("writes the same canonical form as to-bundle.js", () => {
    const require = createRequire(import.meta.url);
    const converter = require("../../../scripts/issue-build/to-bundle.js") as {
      canonicalJSON: (value: unknown) => string;
    };
    expect(canonicalJson(mockIssueBuild)).toBe(converter.canonicalJSON(mockIssueBuild));
  });
});

describe("publish-build: publishing", () => {
  it("inserts a new build", async () => {
    const { store, builds } = memoryStore();
    const result = await publishBuild(bundle(), store, { apply: true });
    expect(result.status).toBe("published");
    expect(builds).toHaveLength(1);
  });

  it("writes nothing on a dry run", async () => {
    const { store, builds } = memoryStore();
    const result = await publishBuild(bundle(), store, { apply: false });
    expect(result.status).toBe("would_publish");
    expect(builds).toHaveLength(0);
  });

  it("treats a repeat of the same bundle as already published", async () => {
    const { store, builds } = memoryStore();
    await publishBuild(bundle(), store, { apply: true });
    const repeat = await publishBuild(bundle(), store, { apply: true });
    expect(repeat.status).toBe("already_published");
    expect(builds).toHaveLength(1);
  });

  it("refuses the same content under another build id", async () => {
    const published = bundle();
    const { store } = memoryStore({
      builds: [{ ...published, id: "30000000-0000-4000-8000-000000000009" }],
    });
    expect(await refusal(publishBuild(published, store, { apply: true }))).toMatch(
      /already published under another identity/,
    );
  });

  it("refuses different content for a version already published", async () => {
    const { store, builds } = memoryStore({ builds: [bundle()] });
    const changed = bundle((draft) => {
      draft.id = "30000000-0000-4000-8000-000000000003";
      draft.sections[0].selected[0].title = "A different lineup";
    });
    expect(await refusal(publishBuild(changed, store, { apply: true }))).toMatch(
      /version 2 is already published with different content/,
    );
    expect(builds).toHaveLength(1);
  });

  it("refuses while another build of the issue has a draft open", async () => {
    const earlier = bundle();
    const { store, builds } = memoryStore({
      builds: [earlier],
      drafts: [
        { draftId: "draft-1", buildId: earlier.id, buildVersion: earlier.buildVersion },
      ],
    });
    const next = bundle((draft) => {
      draft.id = "30000000-0000-4000-8000-000000000003";
      draft.buildVersion = 3;
    });
    expect(await refusal(publishBuild(next, store, { apply: true }))).toMatch(
      /version 2 has a draft still open for editing \(draft draft-1\)/,
    );
    expect(builds).toHaveLength(1);
  });

  it("publishes a next version once the earlier build has no open draft", async () => {
    const { store, builds } = memoryStore({ builds: [bundle()] });
    const next = bundle((draft) => {
      draft.id = "30000000-0000-4000-8000-000000000003";
      draft.buildVersion = 3;
    });
    expect((await publishBuild(next, store, { apply: true })).status).toBe("published");
    expect(builds).toHaveLength(2);
  });

  it("is not blocked by an open draft on a different issue", async () => {
    const other = bundle((draft) => {
      draft.id = "30000000-0000-4000-8000-000000000004";
      draft.issueKey = "vaughan-brief-2026-09-10";
      draft.issueDate = "2026-09-10";
    });
    const { store } = memoryStore({
      builds: [other],
      drafts: [{ draftId: "draft-2", buildId: other.id, buildVersion: 2 }],
    });
    expect((await publishBuild(bundle(), store, { apply: true })).status).toBe(
      "published",
    );
  });

  it("settles an insert that lost to an identical publish", async () => {
    const { store, builds } = memoryStore();
    const input = bundle();
    store.insertBuild = async (build) => {
      builds.push(build);
      return false;
    };
    expect((await publishBuild(input, store, { apply: true })).status).toBe(
      "already_published",
    );
  });

  it("refuses an invalid bundle before any database read", async () => {
    const store = new Proxy({} as PublishStore, {
      get() {
        throw new Error("the store must not be read for an invalid bundle");
      },
    });
    const input = bundle((draft) => {
      draft.sections.pop();
    });
    expect(await refusal(publishBuild(input, store, { apply: true }))).toMatch(
      /Missing section: golden-age/,
    );
  });
});
