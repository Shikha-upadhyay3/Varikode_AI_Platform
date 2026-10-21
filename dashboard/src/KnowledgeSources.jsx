import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";

const BUCKET = "knowledge-files";
const MAX_FILE_BYTES = 10 * 1024 * 1024; // bucket limit: 10 MB
const ALLOWED_EXTENSIONS = ["pdf", "txt"];
const SOURCE_COLUMNS =
  "id, chatbot_id, source_type, title, file_path, url, status, error_message, metadata, created_at";

const STATUS_LABELS = {
  pending: "Pending",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function SmallIcon({ name }) {
  const paths = {
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M8 13h8m-8 4h8" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v5M14 11v5" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m0 0-4 4m4-4 4 4" />
        <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      </>
    ),
    plus: <path d="M12 5v14m-7-7h14" />,
    refresh: (
      <>
        <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
        <path d="M21 3v5h-5" />
      </>
    ),
  };

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

const css = `
.ks-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 15px; margin-top: 16px; }
.ks-card { padding: 18px; }
.ks-card h2 { margin: 0 0 4px; color: #e5e4ec; font-size: 14px; font-weight: 600; }
.ks-card p { margin: 0 0 14px; color: #81828d; font-size: 11px; line-height: 1.6; }
.ks-card .primary-button { margin-top: 0; }
.ks-row { display: flex; gap: 10px; align-items: center; }
.ks-row .chatbot-input { flex: 1; min-width: 0; margin: 0; }
.ks-list { margin-top: 16px; overflow: hidden; }
.ks-list-head { padding: 15px 18px; border-bottom: 1px solid #25262e; color: #e5e4ec; font-size: 12px; font-weight: 600; }
.ks-item { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid #25262e; }
.ks-item:last-child { border-bottom: 0; }
.ks-icon { width: 34px; height: 34px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 9px; background: #202d42; color: #7baeff; }
.ks-icon.web { background: #1d352f; color: #72d9b4; }
.ks-meta { min-width: 0; flex: 1; }
.ks-meta strong { display: block; overflow: hidden; color: #e5e4ec; font-size: 12px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.ks-meta small { color: #81828d; font-size: 10px; }
.ks-error { display: block; margin-top: 3px; color: #f87171; font-size: 10px; }
.ks-badge { padding: 4px 9px; border-radius: 999px; font-size: 10px; white-space: nowrap; }
.ks-badge.pending { background: rgba(245, 166, 35, 0.15); color: #f5a623; }
.ks-badge.processing { background: rgba(30, 144, 255, 0.15); color: #60a5fa; }
.ks-badge.ready { background: rgba(52, 211, 153, 0.15); color: #34d399; }
.ks-badge.failed { background: rgba(248, 113, 113, 0.15); color: #f87171; }
.ks-hint { margin: 12px 2px 0; color: #81828d; font-size: 10px; line-height: 1.6; }
@media (max-width: 820px) { .ks-grid { grid-template-columns: 1fr; } }
`;

export default function KnowledgeSources({
  topbar,
  organization,
  role,
  orgError,
  loadingOrg,
}) {
  const canManage = role === "owner" || role === "admin";
  const fileInputRef = useRef(null);

  const [chatbots, setChatbots] = useState([]);
  const [loadingBots, setLoadingBots] = useState(false);
  const [chatbotId, setChatbotId] = useState("");
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploading, setUploading] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [addingSite, setAddingSite] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // 1. Organization ke chatbots laao
  useEffect(() => {
    if (!organization?.id) return;

    let cancelled = false;

    async function loadChatbots() {
      setLoadingBots(true);
      const { data, error: loadError } = await supabase
        .from("chatbots")
        .select("id, name")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (loadError) {
        setError(loadError.message);
        setChatbots([]);
      } else {
        setChatbots(data || []);
        setChatbotId((current) => current || data?.[0]?.id || "");
      }
      setLoadingBots(false);
    }

    loadChatbots();
    return () => {
      cancelled = true;
    };
  }, [organization?.id]);

  // 2. Selected chatbot ke knowledge sources laao
  useEffect(() => {
    if (!chatbotId) return;

    let cancelled = false;

    async function loadSources() {
      setLoadingSources(true);
      const { data, error: loadError } = await supabase
        .from("knowledge_sources")
        .select(SOURCE_COLUMNS)
        .eq("chatbot_id", chatbotId)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (loadError) {
        setError(loadError.message);
        setSources([]);
      } else {
        setSources(data || []);
      }
      setLoadingSources(false);
    }

    loadSources();
    return () => {
      cancelled = true;
    };
  }, [chatbotId]);

  const visibleSources = chatbotId ? sources : [];
  const hasProcessing = visibleSources.some((source) => source.status === "processing");

  // 3. Jab tak koi source "processing" hai, status har 5 second me refresh karo
  useEffect(() => {
    if (!hasProcessing || !chatbotId) return;

    const timer = setInterval(async () => {
      const { data } = await supabase
        .from("knowledge_sources")
        .select(SOURCE_COLUMNS)
        .eq("chatbot_id", chatbotId)
        .order("created_at", { ascending: false });
      if (data) setSources(data);
    }, 5000);

    return () => clearInterval(timer);
  }, [hasProcessing, chatbotId]);

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  async function refreshSource(sourceId) {
    const { data } = await supabase
      .from("knowledge_sources")
      .select(SOURCE_COLUMNS)
      .eq("id", sourceId)
      .maybeSingle();
    if (data) {
      setSources((current) => current.map((item) => (item.id === sourceId ? data : item)));
    }
    return data;
  }

  // Edge Function ko call karo: text nikalna, chunking, embeddings
  async function processSource(sourceId) {
    setSources((current) =>
      current.map((item) =>
        item.id === sourceId ? { ...item, status: "processing", error_message: null } : item
      )
    );

    const { error: invokeError } = await supabase.functions.invoke(
      "process-knowledge-source",
      { body: { source_id: sourceId } }
    );

    // Function khud DB me status (ready/failed) likhta hai, isliye wahi dobara padho
    const latest = await refreshSource(sourceId);
    if (!latest) return;

    if (latest.status === "ready") {
      setSuccess("Source processed and ready to use.");
    } else if (latest.status === "failed") {
      setError(latest.error_message || "Processing failed. Please try again.");
    } else if (invokeError) {
      setError(
        "Could not start processing. Check that the Edge Function is deployed, then use Process now."
      );
    }
  }

  async function handleRetry(source) {
    if (!canManage) return;
    clearMessages();
    await processSource(source.id);
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    clearMessages();

    if (!canManage || !chatbotId) {
      setError("Owner or admin permissions are required.");
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setError("Only PDF and TXT files are supported.");
      return;
    }
    if (file.size === 0) {
      setError("This file is empty.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("File is too large. The limit is 10 MB.");
      return;
    }

    setUploading(true);

    const path = `${chatbotId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });

    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("knowledge_sources")
      .insert({
        chatbot_id: chatbotId,
        source_type: "file",
        title: file.name,
        file_path: path,
        status: "pending",
        metadata: { size: file.size, mime_type: file.type || null },
      })
      .select(SOURCE_COLUMNS)
      .single();

    setUploading(false);

    if (insertError) {
      // If the 'raw' version wasn't created, then delete the uploaded file as well.
      await supabase.storage.from(BUCKET).remove([path]);
      setError(insertError.message);
      return;
    }

    setSources((current) => [data, ...current]);
    setSuccess("File uploaded. Processing...");
    processSource(data.id);
  }

  async function handleAddWebsite(event) {
    event.preventDefault();
    clearMessages();

    if (!canManage || !chatbotId) {
      setError("Owner or admin permissions are required.");
      return;
    }

    let parsed;
    try {
      parsed = new URL(websiteUrl.trim());
    } catch {
      setError("Enter a valid URL, for example https://example.com/help");
      return;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      setError("Only http and https links are supported.");
      return;
    }

    const url = parsed.toString();
    if (sources.some((source) => source.url === url)) {
      setError("This website is already added.");
      return;
    }

    setAddingSite(true);

    const { data, error: insertError } = await supabase
      .from("knowledge_sources")
      .insert({
        chatbot_id: chatbotId,
        source_type: "website",
        title: parsed.hostname,
        url,
        status: "pending",
      })
      .select(SOURCE_COLUMNS)
      .single();

    setAddingSite(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSources((current) => [data, ...current]);
    setWebsiteUrl("");
    setSuccess("Website added. Processing...");
    processSource(data.id);
  }

  async function handleDelete(source) {
    if (!canManage) return;

    const confirmed = window.confirm(`Delete "${source.title}"? This cannot be undone.`);
    if (!confirmed) return;

    clearMessages();
    setBusyId(source.id);
    // First, delete the row (chunks are deleted automatically)
    const { error: deleteError } = await supabase
      .from("knowledge_sources")
      .delete()
      .eq("id", source.id);

    if (deleteError) {
      setBusyId(null);
      setError(deleteError.message);
      return;
    }

    let storageNote = "";
    if (source.file_path) {
      const { error: removeError } = await supabase.storage
        .from(BUCKET)
        .remove([source.file_path]);
      if (removeError) {
        storageNote = " The stored file could not be removed.";
      }
    }

    setBusyId(null);
    setSources((current) => current.filter((item) => item.id !== source.id));
    setSuccess(`Source deleted.${storageNote}`);
  }

  const selectedBot = chatbots.find((bot) => bot.id === chatbotId);

  return (
    <>
      <style>{css}</style>
      {topbar}
      <main className="main-content">
        <section className="welcome-row chatbot-heading">
          <div>
            <div className="eyebrow">
              <span className="status-dot" /> KNOWLEDGE BASE
            </div>
            <h1>Knowledge sources</h1>
            <p className="welcome-subtitle">
              Add documents and websites so your assistant can answer with your content.
            </p>
          </div>
        </section>

        {(orgError || error || success || (!loadingOrg && organization && !canManage)) && (
          <div className="chatbot-notices" aria-live="polite">
            {orgError && <p className="notice error">{orgError}</p>}
            {error && <p className="notice error">{error}</p>}
            {success && <p className="notice success">{success}</p>}
            {!loadingOrg && organization && !canManage && (
              <p className="notice">
                You can view sources. Owner or admin permissions are required to make changes.
              </p>
            )}
          </div>
        )}

        {loadingOrg || loadingBots ? (
          <article className="panel chatbot-empty">
            <strong>Loading workspace</strong>
            <p>Checking your organization and chatbots.</p>
          </article>
        ) : !organization ? (
          <article className="panel chatbot-empty">
            <strong>Create an organization first</strong>
            <p>Knowledge sources belong to a chatbot inside your organization.</p>
          </article>
        ) : chatbots.length === 0 ? (
          <article className="panel chatbot-empty">
            <strong>Create a chatbot first</strong>
            <p>Open the Chatbots page and create a chatbot, then come back to add its knowledge.</p>
          </article>
        ) : (
          <>
            <section className="chatbot-toolbar">
              <label className="field-label" htmlFor="ks-chatbot" style={{ margin: 0 }}>
                Chatbot
              </label>
              <select
                id="ks-chatbot"
                className="chatbot-input"
                style={{ maxWidth: 320 }}
                value={chatbotId}
                onChange={(event) => {
                  clearMessages();
                  setChatbotId(event.target.value);
                }}
              >
                {chatbots.map((bot) => (
                  <option key={bot.id} value={bot.id}>
                    {bot.name}
                  </option>
                ))}
              </select>
            </section>

            <section className="ks-grid">
              <article className="panel ks-card">
                <h2>Upload a file</h2>
                <p>PDF or TXT, up to 10 MB. The file is stored privately for this chatbot.</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  className="primary-button"
                  disabled={!canManage || uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <SmallIcon name="upload" />
                  {uploading ? "Uploading..." : "Choose file"}
                </button>
              </article>

              <article className="panel ks-card">
                <h2>Add a website</h2>
                <p>Paste a public page link. We read the page and index its text for your assistant.</p>
                <form className="ks-row" onSubmit={handleAddWebsite}>
                  <input
                    className="chatbot-input"
                    type="url"
                    value={websiteUrl}
                    onChange={(event) => setWebsiteUrl(event.target.value)}
                    placeholder="https://example.com/help"
                    aria-label="Website URL"
                    disabled={!canManage || addingSite}
                    required
                  />
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={!canManage || addingSite}
                  >
                    <SmallIcon name="plus" />
                    {addingSite ? "Adding..." : "Add"}
                  </button>
                </form>
              </article>
            </section>

            <article className="panel ks-list">
              <div className="ks-list-head">
                Sources for {selectedBot?.name || "this chatbot"}
              </div>

              {loadingSources ? (
                <div className="ks-item">
                  <div className="ks-meta">
                    <small>Loading sources...</small>
                  </div>
                </div>
              ) : visibleSources.length === 0 ? (
                <div className="ks-item">
                  <div className="ks-meta">
                    <strong>No sources yet</strong>
                    <small>Upload a PDF or TXT file, or add a website above.</small>
                  </div>
                </div>
              ) : (
                visibleSources.map((source) => (
                  <div className="ks-item" key={source.id}>
                    <span className={`ks-icon ${source.source_type === "website" ? "web" : ""}`}>
                      <SmallIcon name={source.source_type === "website" ? "globe" : "file"} />
                    </span>
                    <div className="ks-meta">
                      <strong title={source.url || source.title}>{source.url || source.title}</strong>
                      <small>
                        {source.source_type === "website" ? "Website" : "File"}
                        {source.metadata?.size ? ` · ${formatSize(source.metadata.size)}` : ""}
                        {source.status === "ready" && source.metadata?.chunk_count
                          ? ` · ${source.metadata.chunk_count} chunks`
                          : ""}
                        {` · Added ${formatDate(source.created_at)}`}
                      </small>
                      {source.status === "ready" && source.metadata?.truncated && (
                        <span className="ks-error" style={{ color: "#f5a623" }}>
                          Very large source: only the first part was indexed.
                        </span>
                      )}
                      {source.status === "failed" && source.error_message && (
                        <span className="ks-error">{source.error_message}</span>
                      )}
                    </div>
                    <span className={`ks-badge ${source.status}`}>
                      {STATUS_LABELS[source.status] || source.status}
                    </span>
                    {(source.status === "failed" || source.status === "pending") && (
                      <button
                        type="button"
                        className="subtle-button"
                        onClick={() => handleRetry(source)}
                        disabled={!canManage || busyId === source.id}
                      >
                        <SmallIcon name="refresh" />
                        {source.status === "failed" ? "Retry" : "Process now"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="subtle-button danger"
                      onClick={() => handleDelete(source)}
                      disabled={!canManage || busyId === source.id}
                    >
                      <SmallIcon name="trash" />
                      Delete
                    </button>
                  </div>
                ))
              )}
            </article>

            <p className="ks-hint">
              Each source is read, split into chunks and indexed so your assistant can search it.
              This usually takes a few seconds.
            </p>
          </>
        )}
      </main>
    </>
  );
}
