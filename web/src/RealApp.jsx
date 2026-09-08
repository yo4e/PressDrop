import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretUp } from "@phosphor-icons/react/CaretUp";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { Circle } from "@phosphor-icons/react/Circle";
import { CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { FileText } from "@phosphor-icons/react/FileText";
import { FolderOpen } from "@phosphor-icons/react/FolderOpen";
import { Globe } from "@phosphor-icons/react/Globe";
import { ImageSquare } from "@phosphor-icons/react/ImageSquare";
import { Info } from "@phosphor-icons/react/Info";
import { LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { ListBullets } from "@phosphor-icons/react/ListBullets";
import { LockKey } from "@phosphor-icons/react/LockKey";
import { PlugsConnected } from "@phosphor-icons/react/PlugsConnected";
import { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { Tag } from "@phosphor-icons/react/Tag";
import { Warning } from "@phosphor-icons/react/Warning";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { X } from "@phosphor-icons/react/X";
import { XCircle } from "@phosphor-icons/react/XCircle";
import { pressDropApi } from "./api.js";
import { articleViewModel, progressState, remoteSafetyCopy } from "./view-model.js";

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

function StatusIcon({ tone = "success", size = 22 }) {
  if (tone === "error") return <XCircle size={size} weight="fill" aria-hidden="true" />;
  if (tone === "warning") return <WarningCircle size={size} weight="fill" aria-hidden="true" />;
  if (tone === "pending") return <CircleNotch size={size} weight="bold" aria-hidden="true" />;
  return <CheckCircle size={size} weight="fill" aria-hidden="true" />;
}

function Header({ screen, onReset }) {
  const label = screen === "empty" ? "原稿を選択" : screen === "submitting" ? "下書き作成中" : screen === "success" ? "作成結果" : screen === "error" ? "処理結果" : screen === "preview" ? "原稿プレビュー" : "最終確認";
  return (
    <header className="app-header">
      <button className="brand" type="button" onClick={onReset} aria-label="PressDropの最初の画面へ">PressDrop</button>
      <div className="header-title">{label}</div>
      <a className="text-button" href="?demo=1">UIデモ</a>
    </header>
  );
}

function EmptyState({ onChoose }) {
  return (
    <main className="page page-empty">
      <section className="empty-intro">
        <p className="eyebrow">新しい下書き</p>
        <h1>原稿セットを選んでください</h1>
        <p>ローカルの article.md と画像をPressDrop coreで検査します。WordPressにはまだ何も送信されません。</p>
      </section>
      <button className="drop-zone" type="button" onClick={onChoose}>
        <span className="drop-icon"><FolderOpen size={34} weight="duotone" /></span>
        <strong>ローカル原稿フォルダを選択</strong>
        <span>PressDropを起動している端末上のフォルダパスを指定します</span>
        <span className="bundle-shape"><FileText size={16} /> article.md <i /> <ImageSquare size={16} /> 画像ファイル</span>
      </button>
      <div className="privacy-note"><LockKey size={18} weight="duotone" /><span>この段階ではローカル検査だけを行い、外部サービスへの通信はしません。</span></div>
    </main>
  );
}

function BundleDialog({ open, initialValue, busy, onClose, onInspect }) {
  const [bundleDir, setBundleDir] = useState(initialValue);
  useEffect(() => { if (open) setBundleDir(initialValue); }, [open, initialValue]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="site-dialog" role="dialog" aria-modal="true" aria-labelledby="bundle-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="dialog-close" type="button" onClick={onClose} aria-label="閉じる"><X size={22} /></button>
        <p className="eyebrow">ローカル原稿</p><h2 id="bundle-dialog-title">原稿フォルダを指定</h2>
        <p className="dialog-lead">ブラウザから絶対パスは取得できないため、最小のlocalhost bridgeではPressDropを起動した端末上のパスを指定します。</p>
        <label><span>原稿フォルダ</span><div className="field-with-icon"><FolderOpen size={19} /><input value={bundleDir} onChange={(event) => setBundleDir(event.target.value)} placeholder="examples/basic" /></div></label>
        <div className="credential-note"><Info size={18} /><span>指定先は既存の inspectBundle / validation をそのまま通ります。</span></div>
        <div className="dialog-actions"><button className="button quiet" type="button" onClick={onClose}>キャンセル</button><button className="button primary" type="button" disabled={busy || !bundleDir.trim()} onClick={() => onInspect(bundleDir.trim())}>{busy ? <CircleNotch className="spin" size={19} /> : <FileText size={19} />} 検査する</button></div>
      </section>
    </div>
  );
}

function ReadinessStrip({ connected }) {
  return (
    <div className="readiness-strip" aria-label="処理状態">
      <div className="readiness-item success"><StatusIcon tone="success" size={25} /><span><strong>ローカル検査</strong> 完了</span></div>
      <div className={`readiness-item ${connected ? "success" : "pending"}`}><StatusIcon tone={connected ? "success" : "pending"} size={25} /><span><strong>WordPress照合</strong> {connected ? "完了" : "未実行"}</span></div>
    </div>
  );
}

function ManuscriptDetail({ view }) {
  return (
    <div className="manuscript-detail">
      <div className="manuscript-copy">
        <div className="detail-label"><FileText size={20} /> 本文 {view.blockCount}ブロック</div>
        <p>{view.excerpt || "抜粋は設定されていません。"}</p>
        <div className="section-detail compact-detail">
          {view.blocks.map((block, index) => (
            <div className="detail-row" key={`${block.type}-${index}`}>
              <span>{index + 1}. {block.type === "heading" ? `H${block.level}` : block.type === "image" ? "画像" : "本文"}</span>
              <span>{block.type === "image" ? block.mediaRef.replace(/^media:/, "") : block.text}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="heading-outline">
        <div className="detail-label"><ListBullets size={20} /> 見出し構成</div>
        {view.headings.length ? view.headings.map((heading, index) => <div className="heading-row" key={`${heading.level}-${index}`}><span>H{heading.level}</span><p>{heading.text}</p></div>) : <p>H2/H3見出しはありません。</p>}
      </div>
    </div>
  );
}

function ImagesDetail({ view }) {
  return (
    <div className="section-detail compact-detail">
      {view.media.map((media) => {
        const inline = view.images.find((image) => image.ref === media.ref);
        return (
          <div className="detail-row" key={media.ref}>
            <span><ImageSquare size={18} /> {media.path}</span>
            <span>{media.role}{view.featuredImage === media.path ? " / featured" : ""}</span>
            <span>{inline ? `${inline.alt} / ${inline.caption} / ${inline.credit}` : "本文外メディア"}</span>
          </div>
        );
      })}
    </div>
  );
}

function MetadataDetail({ view, preflight }) {
  return (
    <div className="section-detail metadata-detail">
      <div><span className="detail-label"><Tag size={18} /> カテゴリ</span>{view.categories.map((value) => <span className="meta-value" key={value}>{value}</span>)}{preflight && <span className="status-text success">照合済み: {preflight.categoryIds.join(", ") || "なし"}</span>}</div>
      <div><span className="detail-label"><Tag size={18} /> タグ</span>{view.tags.map((value) => <span className="meta-value" key={value}>{value}</span>)}{preflight && <span className="status-text success">照合済み: {preflight.tagIds.join(", ") || "なし"}</span>}</div>
      {Object.keys(view.meta).length > 0 && <div><span className="detail-label"><Info size={18} /> meta</span><span>{JSON.stringify(view.meta)}</span></div>}
    </div>
  );
}

function DestinationDetail({ preflight, onConfigure }) {
  if (!preflight) {
    return <div className="section-detail destination-empty"><p>サイトプロファイルと実行時認証情報を指定すると、カテゴリとタグをWordPress REST APIで照合します。</p><button className="button secondary small" type="button" onClick={onConfigure}><PlugsConnected size={18} /> 送信先を設定</button></div>;
  }
  return (
    <div className="section-detail destination-detail">
      <div><Globe size={19} /><span>{preflight.profile.baseUrl}</span></div>
      <div><ShieldCheck size={19} /><span>{preflight.profile.id} / Application Password</span></div>
      <p>照合は完了しています。メディアアップロードや下書き作成はまだ行っていません。</p>
      <button className="text-button" type="button" onClick={onConfigure}>接続情報を変更</button>
    </div>
  );
}

const sections = [
  ["manuscript", "原稿"],
  ["images", "画像"],
  ["metadata", "メタデータ"],
  ["destination", "送信先"],
];

function AccordionRow({ id, label, open, onToggle, view, preflight, onConfigure }) {
  const summary = id === "manuscript" ? view.title : id === "images" ? `${view.media.length}点 / featured: ${view.featuredImage || "なし"}` : id === "metadata" ? `カテゴリ ${view.categories.length} / タグ ${view.tags.length}` : preflight ? preflight.profile.id : "未設定";
  const tone = id === "destination" && !preflight ? "warning" : "success";
  return (
    <div className={`accordion-row ${open ? "is-open" : ""}`}>
      <button className="accordion-trigger" type="button" onClick={onToggle} aria-expanded={open}>
        <span className={`row-icon ${tone}`}><StatusIcon tone={tone} size={22} /></span><span className="row-label">{label}</span><span className="row-summary">{summary}</span>{open ? <CaretUp size={19} weight="bold" /> : <CaretDown size={19} weight="bold" />}
      </button>
      {open && <div className="accordion-panel">{id === "manuscript" ? <ManuscriptDetail view={view} /> : id === "images" ? <ImagesDetail view={view} /> : id === "metadata" ? <MetadataDetail view={view} preflight={preflight} /> : <DestinationDetail preflight={preflight} onConfigure={onConfigure} />}</div>}
    </div>
  );
}

function WarningBanner({ warnings, hasExcerpt }) {
  const items = [...warnings];
  if (!hasExcerpt && !items.some((warning) => /excerpt/i.test(warning))) items.unshift("抜粋が設定されていません");
  if (!items.length) return null;
  return (
    <div className="message-banner warning" role="status"><Warning size={23} weight="fill" /><div><strong>警告 {items.length}件</strong><span>{items.join(" / ")}</span></div></div>
  );
}

function ExecutionPlan({ view }) {
  return (
    <div className="execution-plan"><span className="plan-number">1</span><strong>実行内容</strong><p>カテゴリとタグを再確認し、未送信の画像{view.media.length}点を必要に応じてアップロードして、WordPress下書き1件を作成します。</p><span className="draft-chip">公開はされません</span></div>
  );
}

function Preflight({ inspection, preflight, onConfigure, onSubmit, onReset }) {
  const [openSection, setOpenSection] = useState("manuscript");
  const view = useMemo(() => articleViewModel(inspection.article), [inspection.article]);
  return (
    <main className="page preflight-page">
      <section className="preflight-intro"><p className="eyebrow">{preflight ? "最終確認" : "ローカル検査"}</p><h1>{preflight ? "下書き作成の準備ができました" : "原稿プレビュー"}</h1></section>
      <ReadinessStrip connected={Boolean(preflight)} />
      <section className="checklist" aria-label="下書き作成前の確認項目">
        {sections.map(([id, label]) => <AccordionRow key={id} id={id} label={label} open={openSection === id} onToggle={() => setOpenSection(openSection === id ? "" : id)} view={view} preflight={preflight} onConfigure={onConfigure} />)}
      </section>
      <WarningBanner warnings={inspection.warnings} hasExcerpt={view.hasExcerpt} />
      {preflight && <ExecutionPlan view={view} />}
      <div className="primary-action-wrap">
        {preflight ? <button className="button primary wide" type="button" onClick={onSubmit}><FileText size={23} weight="bold" /> 下書きを作成</button> : <button className="button primary wide" type="button" onClick={onConfigure}><PlugsConnected size={23} weight="bold" /> 送信先を設定して照合</button>}
        <div className="secondary-actions"><button className="text-button with-icon" type="button" onClick={onReset}><ArrowLeft size={19} /> 原稿を選び直す</button>{preflight && <button className="text-button" type="button" onClick={onConfigure}>接続情報を変更</button>}</div>
      </div>
    </main>
  );
}

function SubmittingState({ job }) {
  const phase = job?.phase ?? "local_validation";
  const states = progressState(phase);
  const labels = { resolving_taxonomy: "カテゴリとタグを照合", uploading_media: "メディアをアップロード", creating_post: "WordPress下書きを作成" };
  return (
    <main className="page process-page">
      <CircleNotch className="spin process-icon" size={42} weight="bold" /><p className="eyebrow">送信中</p><h1>下書きを安全に作成しています</h1><p className="process-lead">実coreの進捗を表示しています。公開操作は行いません。</p>
      <div className="process-list">
        {states.map(({ phase: stepPhase, done, active }) => <div className={`process-row ${done ? "done" : active ? "active" : ""}`} key={stepPhase}>{done ? <CheckCircle size={24} weight="fill" /> : active ? <CircleNotch className="spin" size={24} weight="bold" /> : <Circle size={24} />}<span>{labels[stepPhase]}</span><span>{done ? "完了" : active ? "処理中" : "待機中"}</span></div>)}
      </div>
      <div className="process-safety"><LockKey size={19} /> Application Passwordは永続化しません</div>
    </main>
  );
}

function ResultState({ inspection, preflight, result, onReset }) {
  return (
    <main className="page result-page">
      <div className="result-icon"><CheckCircle size={54} weight="fill" /></div><p className="eyebrow">{result.reused ? "安全な再試行" : "作成完了"}</p><h1>{result.reused ? "前回の下書きを再利用しました" : "WordPress下書きを作成しました"}</h1>
      <p className="result-lead">{result.reused ? "同一の完了済み結果を返したため、新しいREST副作用は発生していません。" : "実WordPress coreが返した下書き結果です。公開はされていません。"}</p>
      <section className="result-summary"><div><span>タイトル</span><strong>{inspection.article.title}</strong></div><div><span>送信先</span><strong>{preflight.profile.id}</strong></div><div><span>WordPress ID</span><strong>#{result.post.id}</strong></div><div><span>状態</span><strong className="draft-state">下書き</strong></div></section>
      {result.reused && <div className="reuse-note"><ShieldCheck size={21} weight="fill" /> リモートへの追加変更はありませんでした</div>}
      <a className="button primary wide result-button" href={result.post.editUrl} target="_blank" rel="noreferrer"><ArrowSquareOut size={22} weight="bold" /> WordPressで下書きを開く</a><button className="text-button with-icon result-reset" type="button" onClick={onReset}><ArrowLeft size={19} /> 別の原稿を選ぶ</button>
    </main>
  );
}

function ErrorState({ error, preflight, onReset, onConfigure }) {
  const duplicate = error?.code === "DUPLICATE_CANDIDATE";
  const taxonomy = error?.code === "TAXONOMY_RESOLUTION_ERROR";
  const title = duplicate ? "重複の可能性を確認してください" : taxonomy ? "カテゴリ / タグを照合できません" : error?.code === "AUTH_ERROR" ? "WordPressに接続できませんでした" : "処理を完了できませんでした";
  const duplicateText = error?.duplicateKind === "media_result_unknown" ? "前回のメディアアップロード結果が不明です。" : "前回の下書き作成結果が不明です。";
  return (
    <main className="page exception-page">
      <div className={`exception-icon ${duplicate ? "warning" : "error"}`}>{duplicate ? <WarningCircle size={48} weight="fill" /> : <XCircle size={48} weight="fill" />}</div><p className="eyebrow">{error?.code ?? "ERROR"}</p><h1>{title}</h1><p>{duplicate ? duplicateText : error?.message}</p>
      <div className={`exception-detail ${duplicate ? "warning" : ""}`}><strong>最後に確認できた安全状態</strong><span>{remoteSafetyCopy(error)}</span></div>
      {duplicate && <div className="exception-detail warning"><strong>自動再試行は停止中</strong><span>{error.duplicateKind === "media_result_unknown" ? "同じメディアを自動再送しません。WordPressのメディアライブラリを確認してください。" : "同じ下書きを自動再作成しません。WordPressの下書き一覧を確認してください。"}</span></div>}
      <div className="exception-actions">{preflight?.profile?.baseUrl && <a className="button primary" href={`${preflight.profile.baseUrl}/wp-admin/edit.php?post_status=draft&post_type=post`} target="_blank" rel="noreferrer"><ArrowSquareOut size={20} /> WordPressで確認</a>}<button className="button secondary" type="button" onClick={onConfigure}>接続情報を確認</button><button className="button quiet" type="button" onClick={onReset}>原稿選択へ戻る</button></div>
    </main>
  );
}

function SiteDialog({ open, initial, busy, onClose, onConnect }) {
  const [profilePath, setProfilePath] = useState(initial.profilePath);
  const [username, setUsername] = useState(initial.username);
  const [applicationPassword, setApplicationPassword] = useState(initial.applicationPassword);
  useEffect(() => {
    if (!open) return;
    setProfilePath(initial.profilePath);
    setUsername(initial.username);
    setApplicationPassword(initial.applicationPassword);
  }, [open, initial.profilePath, initial.username, initial.applicationPassword]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="site-dialog" role="dialog" aria-modal="true" aria-labelledby="site-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="dialog-close" type="button" onClick={onClose} aria-label="閉じる"><X size={22} /></button><p className="eyebrow">送信先</p><h2 id="site-dialog-title">WordPressサイトを照合</h2><p className="dialog-lead">サイトプロファイルは非秘密設定です。Application Passwordはこの実行中だけ使用し、stateや原稿には保存しません。</p>
        <label><span>サイトプロファイル</span><div className="field-with-icon"><Globe size={19} /><input value={profilePath} onChange={(event) => setProfilePath(event.target.value)} placeholder="config/site.json" /></div></label>
        <label><span>ユーザー名</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
        <label><span>Application Password</span><div className="field-with-icon"><LockKey size={19} /><input type="password" value={applicationPassword} onChange={(event) => setApplicationPassword(event.target.value)} autoComplete="current-password" /></div></label>
        <div className="credential-note"><Info size={18} /><span>この操作はtaxonomyのGET照合までです。メディアや下書きは作成しません。</span></div>
        <div className="dialog-actions"><button className="button quiet" type="button" onClick={onClose}>キャンセル</button><button className="button primary" type="button" disabled={busy || !profilePath.trim() || !username.trim() || !applicationPassword} onClick={() => onConnect({ profilePath: profilePath.trim(), username: username.trim(), applicationPassword })}>{busy ? <CircleNotch className="spin" size={19} /> : <LinkSimple size={19} />} 照合する</button></div>
      </section>
    </div>
  );
}

export function RealApp() {
  const [screen, setScreen] = useState("empty");
  const [bundleDialogOpen, setBundleDialogOpen] = useState(false);
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bundleDir, setBundleDir] = useState("examples/basic");
  const [inspection, setInspection] = useState(null);
  const [preflight, setPreflight] = useState(null);
  const [connection, setConnection] = useState({ profilePath: "config/site.example.json", username: "", applicationPassword: "" });
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const reset = () => {
    setScreen("empty");
    setBundleDialogOpen(false);
    setSiteDialogOpen(false);
    setInspection(null);
    setPreflight(null);
    setJob(null);
    setResult(null);
    setError(null);
    setConnection((value) => ({ ...value, applicationPassword: "" }));
  };

  const inspect = async (nextBundleDir) => {
    setBusy(true);
    try {
      const data = await pressDropApi.inspect(nextBundleDir);
      setBundleDir(nextBundleDir);
      setInspection(data);
      setPreflight(null);
      setError(null);
      setBundleDialogOpen(false);
      setScreen("preview");
    } catch (requestError) {
      setError(requestError.data);
      setBundleDialogOpen(false);
      setScreen("error");
    } finally {
      setBusy(false);
    }
  };

  const connect = async (nextConnection) => {
    if (!inspection) return;
    setBusy(true);
    try {
      const data = await pressDropApi.preflight({ bundleDir, ...nextConnection });
      setConnection(nextConnection);
      setPreflight(data);
      setError(null);
      setSiteDialogOpen(false);
      setScreen("ready");
    } catch (requestError) {
      setConnection(nextConnection);
      setError(requestError.data);
      setSiteDialogOpen(false);
      setScreen("error");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!preflight || !connection.applicationPassword) {
      setSiteDialogOpen(true);
      return;
    }
    setBusy(true);
    try {
      const started = await pressDropApi.startSubmission({ bundleDir, ...connection });
      setConnection((value) => ({ ...value, applicationPassword: "" }));
      setJob({ id: started.jobId, status: started.status, phase: started.phase });
      setScreen("submitting");
    } catch (requestError) {
      setError(requestError.data);
      setScreen("error");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (screen !== "submitting" || !job?.id) return undefined;
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const latest = await pressDropApi.getSubmission(job.id);
          if (cancelled) return;
          setJob(latest);
          if (latest.status === "completed") {
            setResult(latest.result);
            setScreen("success");
            return;
          }
          if (latest.status === "failed") {
            setError(latest.error);
            setScreen("error");
            return;
          }
        } catch (requestError) {
          if (!cancelled) {
            setError(requestError.data);
            setScreen("error");
          }
          return;
        }
        await sleep(400);
      }
    };
    void poll();
    return () => { cancelled = true; };
  }, [screen, job?.id]);

  return (
    <div className="app-shell">
      <Header screen={screen} onReset={reset} />
      {screen === "empty" && <EmptyState onChoose={() => setBundleDialogOpen(true)} />}
      {(screen === "preview" || screen === "ready") && inspection && <Preflight inspection={inspection} preflight={preflight} onConfigure={() => setSiteDialogOpen(true)} onSubmit={submit} onReset={reset} />}
      {screen === "submitting" && <SubmittingState job={job} />}
      {screen === "success" && inspection && preflight && result && <ResultState inspection={inspection} preflight={preflight} result={result} onReset={reset} />}
      {screen === "error" && <ErrorState error={error} preflight={preflight} onReset={reset} onConfigure={() => setSiteDialogOpen(true)} />}
      <BundleDialog open={bundleDialogOpen} initialValue={bundleDir} busy={busy} onClose={() => setBundleDialogOpen(false)} onInspect={inspect} />
      <SiteDialog open={siteDialogOpen} initial={connection} busy={busy} onClose={() => setSiteDialogOpen(false)} onConnect={connect} />
    </div>
  );
}
