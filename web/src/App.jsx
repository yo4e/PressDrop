import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretUp } from "@phosphor-icons/react/CaretUp";
import { Check } from "@phosphor-icons/react/Check";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { Circle } from "@phosphor-icons/react/Circle";
import { CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { DotsThree } from "@phosphor-icons/react/DotsThree";
import { File } from "@phosphor-icons/react/File";
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
import { UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { Warning } from "@phosphor-icons/react/Warning";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { X } from "@phosphor-icons/react/X";
import { XCircle } from "@phosphor-icons/react/XCircle";

const scenarioItems = [
  ["empty", "初回 / 原稿未選択"],
  ["valid", "送信先未設定"],
  ["preview", "原稿プレビュー"],
  ["ready", "送信準備完了"],
  ["validationError", "原稿の検証エラー"],
  ["taxonomyError", "カテゴリ不一致"],
  ["authError", "認証 / RESTエラー"],
  ["duplicate", "重複候補"],
  ["reused", "前回結果の再利用"],
  ["success", "下書き作成成功"],
];

const sectionData = {
  manuscript: { label: "原稿", summary: "PressDropで、原稿からWordPress入稿をほどく" },
  images: { label: "画像", summary: "3点 / 代替テキスト・キャプション・クレジット確認済み" },
  metadata: { label: "メタデータ", summary: "カテゴリ 2 / タグ 2" },
  destination: { label: "送信先", summary: "example-publication" },
};

const assetUrl = (filename) => `${import.meta.env.BASE_URL}assets/${filename}`;

function StatusIcon({ tone = "success", size = 22 }) {
  if (tone === "error") return <XCircle size={size} weight="fill" aria-hidden="true" />;
  if (tone === "warning") return <WarningCircle size={size} weight="fill" aria-hidden="true" />;
  if (tone === "pending") return <CircleNotch size={size} weight="bold" aria-hidden="true" />;
  return <CheckCircle size={size} weight="fill" aria-hidden="true" />;
}

function Header({ screen, onReset, onScenario }) {
  const detailsRef = useRef(null);
  const label =
    screen === "empty"
      ? "原稿を選択"
      : screen === "preview"
        ? "原稿プレビュー"
      : screen === "success" || screen === "reused"
        ? "作成結果"
        : screen === "submitting"
          ? "下書き作成中"
          : "最終確認";

  return (
    <header className="app-header">
      <button className="brand" type="button" onClick={onReset} aria-label="PressDropの最初の画面へ">PressDrop</button>
      <div className="header-title">{label}</div>
      <details className="scenario-menu" ref={detailsRef}>
        <summary aria-label="プロトタイプの表示状態を切り替える">
          <span>状態を試す</span>
          <DotsThree size={24} weight="bold" aria-hidden="true" />
        </summary>
        <div className="scenario-popover">
          <p>プロトタイプ状態</p>
          {scenarioItems.map(([value, itemLabel]) => (
            <button
              type="button"
              key={value}
              aria-label={itemLabel}
              className={screen === value ? "is-active" : ""}
              onClick={() => {
                onScenario(value);
                detailsRef.current?.removeAttribute("open");
              }}
            >
              {screen === value ? <Check size={16} weight="bold" /> : <span className="menu-spacer" />}
              {itemLabel}
            </button>
          ))}
        </div>
      </details>
    </header>
  );
}

function EmptyState({ onSelect, onError }) {
  const fileInputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  return (
    <main className="page page-empty">
      <section className="empty-intro">
        <p className="eyebrow">新しい下書き</p>
        <h1>原稿セットを選んでください</h1>
        <p>article.md と画像をひとつのフォルダとして読み込みます。WordPressにはまだ何も送信されません。</p>
      </section>

      <button
        className={`drop-zone ${dragging ? "is-dragging" : ""}`}
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onSelect();
        }}
      >
        <span className="drop-icon"><FolderOpen size={34} weight="duotone" /></span>
        <strong>原稿フォルダをここにドロップ</strong>
        <span>またはクリックしてフォルダを選択</span>
        <span className="bundle-shape"><File size={16} /> article.md <i /> <ImageSquare size={16} /> images/</span>
      </button>
      <input ref={fileInputRef} className="visually-hidden" type="file" webkitdirectory="" multiple onChange={onSelect} aria-label="原稿フォルダを選択" />

      <div className="empty-actions">
        <button className="button primary" type="button" onClick={onSelect}><UploadSimple size={20} weight="bold" />サンプル原稿を選択</button>
        <button className="button quiet" type="button" onClick={onError}>エラーのある原稿を試す</button>
      </div>
      <div className="privacy-note"><LockKey size={18} weight="duotone" /><span>原稿はこの端末内で検査され、確認するまで外部には送信されません。</span></div>
    </main>
  );
}

function ReadinessStrip({ mode }) {
  const localTone = mode === "validationError" ? "error" : "success";
  const remoteTone = mode === "success" || mode === "reused" ? "success" : "pending";
  const remoteText = mode === "success" ? "WordPressへの変更 完了" : mode === "reused" ? "WordPressへの変更 なし" : "WordPressへの変更 未実行";

  return (
    <div className="readiness-strip" aria-label="処理状態">
      <div className={`readiness-item ${localTone}`}>
        <StatusIcon tone={localTone} size={25} />
        <span><strong>ローカル検査</strong> {localTone === "error" ? "要修正" : "完了"}</span>
      </div>
      <div className={`readiness-item ${remoteTone}`}>
        <StatusIcon tone={remoteTone} size={25} />
        <span><strong>{remoteText.split(" ")[0]}</strong> {remoteText.split(" ").slice(1).join(" ")}</span>
      </div>
    </div>
  );
}

function ManuscriptDetail() {
  return (
    <div className="manuscript-detail">
      <div className="manuscript-copy">
        <div className="detail-label"><FileText size={20} /> 本文 6ブロック</div>
        <p>PressDropを使えば、原稿バンドルを安全に検査し、WordPressの下書きとして構造化して送信できます。カテゴリやタグは既存のものと正確に照合され、画像やメタ情報もまとめて確認できます。</p>
        <div className="detail-label image-count"><ImageSquare size={20} /> 画像 2 / 3</div>
        <div className="thumbnail-strip">
          <img src={assetUrl("forest-editorial.jpg")} alt="柔らかな光が差し込む緑の森" />
          <img src={assetUrl("desk-editorial.jpg")} alt="ノートとペン、コーヒーカップが置かれた机" />
        </div>
        <p className="detail-footnote">すべての画像の代替テキスト・キャプション・クレジットを確認済み</p>
      </div>
      <div className="heading-outline">
        <div className="detail-label"><ListBullets size={20} /> 見出し構成</div>
        {[["H2", "PressDropとは"], ["H2", "主な特長"], ["H3", "ローカルで安全に検査"], ["H3", "正確な照合と透明性"], ["H2", "使い方の流れ"], ["H2", "まとめ"]].map(([level, text]) => (
          <div className="heading-row" key={text}><span>{level}</span><p>{text}</p></div>
        ))}
      </div>
    </div>
  );
}

function ImagesDetail({ hasError = false }) {
  return (
    <div className="section-detail compact-detail">
      {[["cover.png", "アイキャッチ", "確認済み"], ["photo-01.png", "本文画像", "確認済み"], ["photo-02.png", "本文画像", hasError ? "要修正" : "確認済み"]].map(([name, role, status]) => (
        <div className="detail-row" key={name}>
          <span><ImageSquare size={18} /> {name}</span><span>{role}</span>
          <span className={status === "要修正" ? "status-text error" : "status-text success"}>{status}</span>
        </div>
      ))}
    </div>
  );
}

function MetadataDetail({ taxonomyError = false }) {
  return (
    <div className="section-detail metadata-detail">
      <div><span className="detail-label"><Tag size={18} /> カテゴリ</span><span className="meta-value">Workflow</span><span className={`meta-value ${taxonomyError ? "invalid" : ""}`}>WordPress</span></div>
      <div><span className="detail-label"><Tag size={18} /> タグ</span><span className="meta-value">Markdown</span><span className="meta-value">Gutenberg</span></div>
    </div>
  );
}

function DestinationDetail({ configured, onConfigure }) {
  if (!configured) {
    return (
      <div className="section-detail destination-empty">
        <p>WordPressサイトを接続すると、カテゴリとタグを照合できます。</p>
        <button className="button secondary small" type="button" onClick={onConfigure}><PlugsConnected size={18} /> 送信先を設定</button>
      </div>
    );
  }
  return (
    <div className="section-detail destination-detail">
      <div><Globe size={19} /><span>https://wordpress.example.com</span></div>
      <div><ShieldCheck size={19} /><span>Application Passwordで接続</span></div>
      <p>認証情報は原稿フォルダやサイト設定ファイルには保存されません。</p>
      <button className="text-button" type="button" onClick={onConfigure}>接続情報を確認</button>
    </div>
  );
}

function AccordionRow({ id, open, onToggle, mode, configured, onConfigure }) {
  const data = sectionData[id];
  const validationError = mode === "validationError";
  const taxonomyError = mode === "taxonomyError";
  let tone = "success";
  let iconTone = "success";
  let status = "";
  if (id === "images" && validationError) { tone = "error"; iconTone = "error"; status = "エラー 1"; }
  else if (id === "metadata" && taxonomyError) { tone = "error"; iconTone = "error"; status = "不一致 1"; }
  else if (id === "images") { tone = "warning"; status = "警告 1"; }
  else if (id === "destination" && !configured) { tone = "warning"; iconTone = "warning"; status = "未設定"; }
  else if (id === "destination") status = "接続済み";
  const summary = id === "destination" && !configured ? "WordPressサイトを選択してください" : data.summary;

  return (
    <div className={`accordion-row ${open ? "is-open" : ""}`}>
      <button className="accordion-trigger" type="button" onClick={onToggle} aria-expanded={open}>
        <span className={`row-icon ${iconTone}`}><StatusIcon tone={iconTone} size={22} /></span>
        <span className="row-label">{data.label}</span>
        <span className="row-summary">{summary}</span>
        {status && <span className={`row-status ${tone}`}>{status}</span>}
        {open ? <CaretUp size={19} weight="bold" /> : <CaretDown size={19} weight="bold" />}
      </button>
      {open && (
        <div className="accordion-panel">
          {id === "manuscript" && <ManuscriptDetail />}
          {id === "images" && <ImagesDetail hasError={validationError} />}
          {id === "metadata" && <MetadataDetail taxonomyError={taxonomyError} />}
          {id === "destination" && <DestinationDetail configured={configured} onConfigure={onConfigure} />}
        </div>
      )}
    </div>
  );
}

function MessageBanner({ mode }) {
  const content = {
    ready: ["warning", "抜粋が設定されていません", "この警告は下書き作成を妨げません。"],
    valid: ["warning", "WordPressサイトが設定されていません", "送信先を選ぶまで外部への変更は行われません。"],
    validationError: ["error", "画像のメタデータが不足しています", "photo-02.png のクレジットを原稿に追加してください。"],
    taxonomyError: ["error", "カテゴリ「WordPress」が見つかりません", "画像をアップロードする前に処理を停止しました。"],
  }[mode];
  if (!content) return null;
  const [tone, title, detail] = content;
  return (
    <div className={`message-banner ${tone}`} role={tone === "error" ? "alert" : "status"}>
      {tone === "error" ? <XCircle size={23} weight="fill" /> : <Warning size={23} weight="fill" />}
      <div><strong>{title}</strong><span>{detail}</span></div>
    </div>
  );
}

function ExecutionPlan({ mode }) {
  const blocked = mode === "validationError" || mode === "taxonomyError";
  return (
    <div className={`execution-plan ${blocked ? "blocked" : ""}`}>
      <span className="plan-number">{blocked ? <X size={15} weight="bold" /> : "1"}</span>
      <strong>{blocked ? "実行は停止中" : "実行内容"}</strong>
      <p>{blocked ? "問題が解決されるまで、WordPressには何も送信しません。" : "カテゴリとタグを照合し、画像3点をアップロードして、WordPress下書き1件を作成します。"}</p>
      <span className="draft-chip">公開はされません</span>
    </div>
  );
}

function Preflight({ mode, onSubmit, onReset, onConfigure, onBack, onContinue }) {
  const [openSection, setOpenSection] = useState("manuscript");
  const configured = mode !== "valid";
  const blocked = mode === "validationError" || mode === "taxonomyError";
  const title = blocked ? "修正が必要です" : mode === "preview" ? "原稿プレビュー" : configured ? "下書き作成の準備ができました" : "原稿を確認しました";

  useEffect(() => {
    if (mode === "validationError") setOpenSection("images");
    else if (mode === "taxonomyError") setOpenSection("metadata");
    else if (mode === "valid") setOpenSection("destination");
    else setOpenSection("manuscript");
  }, [mode]);

  return (
    <main className="page preflight-page">
      <section className="preflight-intro"><p className="eyebrow">最終確認</p><h1>{title}</h1></section>
      <ReadinessStrip mode={mode} />
      <section className="checklist" aria-label="下書き作成前の確認項目">
        {Object.keys(sectionData).map((id) => (
          <AccordionRow key={id} id={id} open={openSection === id} onToggle={() => setOpenSection(openSection === id ? "" : id)} mode={mode} configured={configured} onConfigure={onConfigure} />
        ))}
      </section>
      <MessageBanner mode={mode === "preview" ? "ready" : mode} />
      {configured && mode !== "preview" && <ExecutionPlan mode={mode} />}
      <div className="primary-action-wrap">
        {!configured ? (
          <button className="button primary wide" type="button" onClick={onConfigure}><PlugsConnected size={23} weight="bold" /> 送信先を設定</button>
        ) : mode === "preview" ? (
          <button className="button primary wide" type="button" onClick={onContinue}><CheckCircle size={23} weight="bold" /> 最終確認へ</button>
        ) : (
          <button className="button primary wide" type="button" onClick={onSubmit} disabled={blocked}><FileText size={23} weight="bold" />{blocked ? "下書きを作成できません" : "下書きを作成"}</button>
        )}
        <div className="secondary-actions">
          <button className="text-button with-icon" type="button" onClick={mode === "ready" ? onBack : onReset}><ArrowLeft size={19} /> {mode === "ready" ? "プレビューに戻る" : "原稿を選び直す"}</button>
          {configured && <button className="text-button" type="button" onClick={onConfigure}>接続情報を確認</button>}
        </div>
      </div>
    </main>
  );
}

function SubmittingState() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const first = window.setTimeout(() => setStep(1), 650);
    const second = window.setTimeout(() => setStep(2), 1350);
    const third = window.setTimeout(() => setStep(3), 2050);
    return () => [first, second, third].forEach(window.clearTimeout);
  }, []);
  const tasks = ["カテゴリとタグを照合", "画像3点をアップロード", "WordPress下書きを作成"];
  return (
    <main className="page process-page">
      <CircleNotch className="spin process-icon" size={42} weight="bold" />
      <p className="eyebrow">送信中</p><h1>下書きを安全に作成しています</h1>
      <p className="process-lead">この画面を閉じずにお待ちください。公開はされません。</p>
      <div className="process-list">
        {tasks.map((task, index) => {
          const done = step > index;
          const active = step === index;
          return (
            <div className={`process-row ${done ? "done" : active ? "active" : ""}`} key={task}>
              {done ? <CheckCircle size={24} weight="fill" /> : active ? <CircleNotch className="spin" size={24} weight="bold" /> : <Circle size={24} />}
              <span>{task}</span><span>{done ? "完了" : active ? "処理中" : "待機中"}</span>
            </div>
          );
        })}
      </div>
      <div className="process-safety"><LockKey size={19} /> 認証情報は保存していません</div>
    </main>
  );
}

function ResultState({ reused = false, onReset }) {
  return (
    <main className="page result-page">
      <div className="result-icon"><CheckCircle size={54} weight="fill" /></div>
      <p className="eyebrow">{reused ? "安全な再試行" : "作成完了"}</p>
      <h1>{reused ? "前回の下書きを再利用しました" : "WordPress下書きを作成しました"}</h1>
      <p className="result-lead">{reused ? "同じ原稿と送信先の完了済み結果が見つかったため、新しいアップロードや下書き作成は行っていません。" : "下書きはWordPressに保存されました。公開前の最終確認をWordPressで続けられます。"}</p>
      <section className="result-summary">
        <div><span>タイトル</span><strong>PressDropで、原稿からWordPress入稿をほどく</strong></div>
        <div><span>送信先</span><strong>example-publication</strong></div>
        <div><span>WordPress ID</span><strong>#248</strong></div>
        <div><span>状態</span><strong className="draft-state">下書き</strong></div>
      </section>
      {reused && <div className="reuse-note"><ShieldCheck size={21} weight="fill" /> リモートへの追加変更はありませんでした</div>}
      <a className="button primary wide result-button" href="https://wordpress.example.com/wp-admin/post.php?post=248&action=edit" target="_blank" rel="noreferrer"><ArrowSquareOut size={22} weight="bold" /> WordPressで下書きを開く</a>
      <button className="text-button with-icon result-reset" type="button" onClick={onReset}><ArrowLeft size={19} /> 別の原稿を選ぶ</button>
    </main>
  );
}

function AuthErrorState({ onRetry, onConfigure }) {
  return (
    <main className="page exception-page">
      <div className="exception-icon error"><XCircle size={48} weight="fill" /></div>
      <p className="eyebrow">AUTH_ERROR</p><h1>WordPressに接続できませんでした</h1>
      <p>認証情報が拒否されたか、REST APIに到達できませんでした。下書きは作成されていません。</p>
      <div className="exception-detail"><strong>安全に停止しました</strong><span>画像のアップロードと下書き作成は行われていません。パスワードは表示・保存しません。</span></div>
      <div className="exception-actions"><button className="button primary" type="button" onClick={onRetry}>もう一度試す</button><button className="button secondary" type="button" onClick={onConfigure}>接続情報を確認</button></div>
    </main>
  );
}

function DuplicateState({ onResolve }) {
  return (
    <main className="page exception-page">
      <div className="exception-icon warning"><WarningCircle size={48} weight="fill" /></div>
      <p className="eyebrow">DUPLICATE_CANDIDATE</p><h1>重複の可能性を確認してください</h1>
      <p>前回の処理はWordPress下書きの作成直前まで進みましたが、結果を受け取れませんでした。</p>
      <div className="duplicate-flow">
        <div className="done"><CheckCircle size={22} weight="fill" /><span>画像3点のアップロード</span><strong>完了</strong></div>
        <div className="uncertain"><WarningCircle size={22} weight="fill" /><span>WordPress下書き</span><strong>結果不明</strong></div>
        <div><Circle size={22} /><span>自動再試行</span><strong>停止</strong></div>
      </div>
      <div className="exception-detail warning"><strong>自動では再作成しません</strong><span>WordPressで既存の下書きを確認してから、結果を関連付けてください。</span></div>
      <div className="exception-actions"><a className="button primary" href="https://wordpress.example.com/wp-admin/edit.php?post_status=draft&post_type=post" target="_blank" rel="noreferrer"><ArrowSquareOut size={20} /> WordPressで確認</a><button className="button secondary" type="button" onClick={onResolve}>既存結果に関連付ける</button></div>
    </main>
  );
}

function SiteDialog({ open, onClose, onConnect }) {
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="site-dialog" role="dialog" aria-modal="true" aria-labelledby="site-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="dialog-close" type="button" onClick={onClose} aria-label="閉じる"><X size={22} /></button>
        <p className="eyebrow">送信先</p><h2 id="site-dialog-title">WordPressサイトを接続</h2>
        <p className="dialog-lead">接続の確認にだけ使用します。認証情報は原稿フォルダやサイト設定ファイルには書き込みません。</p>
        <label><span>サイトURL</span><div className="field-with-icon"><Globe size={19} /><input defaultValue="https://wordpress.example.com" /></div></label>
        <label><span>ユーザー名</span><input defaultValue="pressdrop-editor" /></label>
        <label><span>Application Password</span><div className="field-with-icon"><LockKey size={19} /><input type="password" defaultValue="demo-application-password" /></div></label>
        <div className="credential-note"><Info size={18} /><span>HTTPS接続を使用し、パスワードをログや原稿に含めません。</span></div>
        <div className="dialog-actions"><button className="button quiet" type="button" onClick={onClose}>キャンセル</button><button className="button primary" type="button" onClick={onConnect}><LinkSimple size={19} /> 接続を確認</button></div>
      </section>
    </div>
  );
}

export function App() {
  const [screen, setScreen] = useState("empty");
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (screen !== "submitting") return undefined;
    const timer = window.setTimeout(() => setScreen("success"), 2850);
    return () => window.clearTimeout(timer);
  }, [screen]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const reset = () => { setScreen("empty"); setSiteDialogOpen(false); };
  const connect = () => { setSiteDialogOpen(false); setScreen("ready"); setToast("example-publication に接続しました"); };

  return (
    <div className="app-shell">
      <Header screen={screen} onReset={reset} onScenario={setScreen} />
      {screen === "empty" && <EmptyState onSelect={() => setScreen("valid")} onError={() => setScreen("validationError")} />}
      {["valid", "preview", "ready", "validationError", "taxonomyError"].includes(screen) && <Preflight mode={screen} onSubmit={() => setScreen("submitting")} onReset={reset} onConfigure={() => setSiteDialogOpen(true)} onBack={() => setScreen("preview")} onContinue={() => setScreen("ready")} />}
      {screen === "submitting" && <SubmittingState />}
      {screen === "success" && <ResultState onReset={reset} />}
      {screen === "reused" && <ResultState reused onReset={reset} />}
      {screen === "authError" && <AuthErrorState onRetry={() => setScreen("submitting")} onConfigure={() => setSiteDialogOpen(true)} />}
      {screen === "duplicate" && <DuplicateState onResolve={() => setScreen("reused")} />}
      <SiteDialog open={siteDialogOpen} onClose={() => setSiteDialogOpen(false)} onConnect={connect} />
      {toast && <div className="toast" role="status"><CheckCircle size={20} weight="fill" /> {toast}</div>}
    </div>
  );
}
