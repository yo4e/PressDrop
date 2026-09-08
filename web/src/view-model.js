export function articleViewModel(article) {
  const mediaByRef = new Map(article.media.map((item) => [item.ref, item]));
  const images = article.blocks
    .filter((block) => block.type === "image")
    .map((block, index) => {
      const media = mediaByRef.get(block.mediaRef);
      return {
        index: index + 1,
        ref: block.mediaRef,
        filename: media?.path ?? block.mediaRef.replace(/^media:/, ""),
        role: media?.role ?? "inline",
        alt: block.alt,
        caption: block.caption,
        credit: block.credit,
      };
    });
  const featured = article.featuredMediaRef ? mediaByRef.get(article.featuredMediaRef) : undefined;
  const headings = article.blocks
    .filter((block) => block.type === "heading")
    .map((block) => ({ level: block.level, text: block.text }));
  return {
    title: article.title,
    excerpt: article.excerpt ?? "",
    hasExcerpt: Boolean(article.excerpt),
    blockCount: article.blocks.length,
    headings,
    blocks: article.blocks,
    images,
    media: article.media,
    categories: article.categories,
    tags: article.tags,
    featuredImage: featured?.path ?? "",
    meta: article.meta,
  };
}

export const progressPhases = ["resolving_taxonomy", "uploading_media", "creating_post"];

export function progressState(phase) {
  const index = progressPhases.indexOf(phase);
  return progressPhases.map((value, stepIndex) => ({
    phase: value,
    done: phase === "completed" || (index >= 0 && stepIndex < index),
    active: index === stepIndex,
  }));
}

export function remoteSafetyCopy(error) {
  if (!error) return "WordPressへの変更状態を確認できません。";
  if (error.remoteMutation === "none") return "WordPressへの変更はまだ行われていません。";
  if (error.remoteMutation === "media_may_have_changed") return "メディアのアップロードが成功している可能性があります。自動で同じ画像を再送しません。";
  if (error.remoteMutation === "media_changed_draft_may_exist") return "メディアはアップロード済みで、下書き作成も成功している可能性があります。自動で下書きを再作成しません。";
  return "WordPress側の結果を確認してください。";
}
