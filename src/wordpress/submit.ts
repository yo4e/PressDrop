import path from "node:path";
import { PressDropError } from "../errors.ts";
import { generateGutenberg, type GutenbergMediaMap } from "../gutenberg.ts";
import type { NormalizedArticle } from "../model.ts";
import { inspectBundle } from "../pipeline.ts";
import { resolveBundlePath } from "../validation.ts";
import { WordPressClient, type CreatedDraft, type WordPressClientOptions, type WordPressCredentials } from "./client.ts";
import type { WordPressSiteProfile } from "./site-profile.ts";
import { submissionKey, type SubmissionStateRecord, type SubmissionStateStore } from "./state.ts";

export interface SubmissionResult {
  reused: boolean;
  submissionKey: string;
  sourceFingerprint: string;
  post: CreatedDraft;
  media: GutenbergMediaMap;
  categoryIds: number[];
  tagIds: number[];
  warnings: string[];
}

export interface SubmitBundleOptions {
  bundleDir: string;
  profile: WordPressSiteProfile;
  credentials: WordPressCredentials;
  stateStore: SubmissionStateStore;
  clientOptions?: WordPressClientOptions;
}

function imageMetadata(article: NormalizedArticle): Map<string, { alt: string; caption: string }> {
  const result = new Map<string, { alt: string; caption: string }>();
  for (const block of article.blocks) {
    if (block.type === "image") result.set(block.mediaRef, { alt: block.alt, caption: block.caption });
  }
  return result;
}

function completedResult(
  record: SubmissionStateRecord,
  categoryIds: number[],
  tagIds: number[],
  warnings: string[],
  reused: boolean,
): SubmissionResult {
  if (!record.post) throw new PressDropError("STATE_ERROR", "Completed submission state is missing post data");
  return {
    reused,
    submissionKey: record.key,
    sourceFingerprint: record.sourceFingerprint,
    post: record.post,
    media: record.media,
    categoryIds: record.categoryIds ?? categoryIds,
    tagIds: record.tagIds ?? tagIds,
    warnings,
  };
}

export async function submitBundle(options: SubmitBundleOptions): Promise<SubmissionResult> {
  const bundleDir = path.resolve(options.bundleDir);
  const { article, warnings } = await inspectBundle(bundleDir);
  const key = submissionKey(options.profile, article.source.fingerprint);
  let record = await options.stateStore.get(key);

  if (record?.phase === "completed") {
    return completedResult(record, [], [], warnings, true);
  }
  if (record?.phase === "creating_post" && !record.post) {
    throw new PressDropError(
      "DUPLICATE_CANDIDATE",
      "A previous attempt reached WordPress draft creation but its result is unknown; refusing to create a possible duplicate automatically",
      { submissionKey: key, profileId: options.profile.id, sourceFingerprint: article.source.fingerprint },
    );
  }

  if (record?.pendingMediaRef && !record.media[record.pendingMediaRef]) {
    throw new PressDropError(
      "DUPLICATE_CANDIDATE",
      "A previous media upload may have succeeded but its result is unknown; refusing to upload a possible duplicate automatically",
      { submissionKey: key, mediaRef: record.pendingMediaRef, profileId: options.profile.id },
    );
  }

  const client = new WordPressClient(options.profile, options.credentials, options.clientOptions);

  // Resolve every taxonomy before media upload so a typo cannot leave remote media side effects.
  const categoryIds = await client.resolveTerms("categories", article.categories);
  const tagIds = await client.resolveTerms("tags", article.tags);

  record ??= {
    version: 1,
    key,
    profileId: options.profile.id,
    baseUrl: options.profile.baseUrl,
    sourceFingerprint: article.source.fingerprint,
    phase: "uploading_media",
    media: {},
  };
  record.categoryIds = categoryIds;
  record.tagIds = tagIds;
  await options.stateStore.put(record);

  const metadata = imageMetadata(article);
  for (const media of article.media) {
    if (record.media[media.ref]) continue;
    const localPath = resolveBundlePath(bundleDir, media.path);
    const inlineMetadata = metadata.get(media.ref);
    record.pendingMediaRef = media.ref;
    record.phase = "uploading_media";
    await options.stateStore.put(record);
    const uploaded = await client.uploadMedia(localPath, inlineMetadata ?? {});
    record.media[media.ref] = uploaded;
    delete record.pendingMediaRef;
    await options.stateStore.put(record);
  }

  const content = generateGutenberg(article, record.media);
  const featuredMediaId = article.featuredMediaRef ? record.media[article.featuredMediaRef]?.id : undefined;
  if (article.featuredMediaRef && !featuredMediaId) {
    throw new PressDropError("STATE_ERROR", `Uploaded featured media is missing from submission state: ${article.featuredMediaRef}`);
  }

  record.phase = "creating_post";
  await options.stateStore.put(record);

  const post = await client.createDraft({
    title: article.title,
    ...(article.excerpt ? { excerpt: article.excerpt } : {}),
    content,
    categoryIds,
    tagIds,
    ...(featuredMediaId ? { featuredMediaId } : {}),
  });
  record.post = post;
  record.phase = "completed";
  await options.stateStore.put(record);
  return completedResult(record, categoryIds, tagIds, warnings, false);
}
