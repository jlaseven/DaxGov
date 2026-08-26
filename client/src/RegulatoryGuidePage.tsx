import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Download, Send, X } from "lucide-react";
import {
  regulatoryGuide,
  searchClauses,
  type RegulatoryClause,
} from "./regulatoryGuide";

type ChatMessage = {
  role: "bot" | "user";
  text: string;
  hits?: RegulatoryClause[];
};

const DAXON = "/assets/daxon-comic.png";

const welcome =
  "I'm Daxon. Ask about a topic — outsourcing, board duties, incident response — or type a clause number such as 3.1. I'll take you to the post.";

function communityName(area: string) {
  if (area === "IT Audit") return "r/ITAudit";
  if (area === "Information Security") return "r/InfoSec";
  if (area === "IT Operations") return "r/ITOperations";
  if (area === "IT Outsourcing / Vendor Management") return "r/VendorRisk";
  if (area.startsWith("Project Management")) return "r/ChangeManagement";
  if (area.startsWith("Electronic")) return "r/EBanking";
  return `r/${area.replace(/[^A-Za-z]/g, "")}`;
}

function areaTone(area: string) {
  if (area === "IT Audit") return "audit";
  if (area === "Information Security") return "sec";
  if (area === "IT Operations") return "ops";
  if (area === "IT Outsourcing / Vendor Management") return "vendor";
  if (area.startsWith("Project Management")) return "change";
  return "ebank";
}

function bodyLines(text: string) {
  const marked = text
    .replace(/\s+([a-h]\.)\s+/gi, "\n$1 ")
    .replace(/\s+(\d+\))\s+/g, "\n$1 ");
  return marked
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function RegulatoryGuidePage() {
  const [area, setArea] = useState("All");
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [botOpen, setBotOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "bot", text: welcome },
  ]);
  const feed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return regulatoryGuide.clauses.filter((clause) => {
      if (area !== "All" && clause.area !== area) return false;
      if (!q) return true;
      return `${clause.ref} ${clause.title} ${clause.summary} ${clause.text}`
        .toLowerCase()
        .includes(q);
    });
  }, [area, query]);
  const groups = useMemo(() => {
    const map = new Map<string, RegulatoryClause[]>();
    for (const clause of feed) {
      const list = map.get(clause.area) || [];
      list.push(clause);
      map.set(clause.area, list);
    }
    return [...map.entries()];
  }, [feed]);

  const jump = (id: string) => {
    setFocusId(id);
    setArea("All");
    setOpenIds((current) => ({ ...current, [id]: true }));
    requestAnimationFrame(() => {
      document.getElementById(`clause-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const ask = (text: string) => {
    const value = text.trim();
    if (!value) return;
    const hits = searchClauses(value);
    const reply = hits.length
      ? `I found these clauses for “${value}”. Open a post to read the full text.`
      : `I could not match “${value}” to a clause. Try a number like 4.1, or words such as audit, vendor, access, incident, or continuity.`;
    setMessages((current) => [
      ...current,
      { role: "user", text: value },
      { role: "bot", text: reply, hits },
    ]);
    setDraft("");
  };

  return (
    <div className="reg-page">
      <section className="reg-banner">
        <img src={DAXON} alt="" className="reg-banner-mascot" />
        <div className="reg-banner-copy">
          <p className="reg-kicker">r/DaxGov · Regulatory Guide</p>
          <h1>IT Risk Management Standards</h1>
          <p className="reg-banner-lead">
            BSP IT risk management as a feed. Open a post to read the full
            clause.
          </p>
          <div className="reg-banner-meta">
            <span>{regulatoryGuide.clauses.length} posts</span>
            <span>Sec. 147-Q / 145-S / 142-P / 126-N</span>
            <span>BSP MORNBFI</span>
          </div>
        </div>
        <a
          className="reg-download"
          href={`/docs/${regulatoryGuide.fileName}`}
          download={regulatoryGuide.fileName}
        >
          <Download size={18} />
          <span>
            <strong>Download PDF</strong>
            <em>Official regulation file</em>
          </span>
        </a>
      </section>

      <div className="reg-toolbar">
        <div className="reg-communities">
          <button
            type="button"
            className={area === "All" ? "active" : ""}
            onClick={() => setArea("All")}
          >
            r/All
          </button>
          {regulatoryGuide.areas.map((name) => (
            <button
              key={name}
              type="button"
              className={area === name ? "active" : ""}
              onClick={() => setArea(name)}
            >
              {communityName(name)}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search posts…"
          aria-label="Search posts"
        />
      </div>

      <div className="reg-board">
        {groups.map(([name, clauses]) => (
          <section key={name} className={`reg-chapter tone-${areaTone(name)}`}>
            <div className="reg-chapter-head">
              <img src={DAXON} alt="" />
              <div>
                <p>{communityName(name)}</p>
                <h2>{name}</h2>
              </div>
              <span>{clauses.length} clauses</span>
            </div>
            <div className="reg-feed" role="feed" aria-label={name}>
              {clauses.map((clause) => {
                const open = Boolean(openIds[clause.id] || focusId === clause.id);
                const lines = bodyLines(clause.text);
                return (
                  <article
                    key={clause.id}
                    id={`clause-${clause.id}`}
                    className={`reg-post ${focusId === clause.id ? "focus" : ""} ${open ? "open" : ""}`}
                  >
                    <div className="reg-votes" aria-hidden="true">
                      <ChevronUp size={18} />
                      <strong>{clause.ref}</strong>
                      <ChevronDown size={18} />
                    </div>
                    <div className="reg-post-body">
                      <p className="reg-post-meta">
                        <b>{communityName(clause.area)}</b>
                        <span>· clause {clause.ref}</span>
                      </p>
                      <h3>{clause.title}</h3>
                      <p className="reg-summary">{clause.summary}</p>
                      {open && (
                        <div className="reg-full">
                          {lines.map((line, index) => (
                            <p key={index}>{line}</p>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        className="reg-more"
                        onClick={() =>
                          setOpenIds((current) => ({
                            ...current,
                            [clause.id]: !open,
                          }))
                        }
                      >
                        {open ? "Hide full clause" : "Read full clause"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
        {!feed.length && (
          <p className="empty-state">No posts match that filter.</p>
        )}
      </div>

      <GuideBot
        open={botOpen}
        onOpen={() => setBotOpen(true)}
        onClose={() => setBotOpen(false)}
        draft={draft}
        setDraft={setDraft}
        messages={messages}
        onAsk={ask}
        onJump={(id) => {
          jump(id);
          setBotOpen(false);
        }}
      />
    </div>
  );
}

function GuideBot({
  open,
  onOpen,
  onClose,
  draft,
  setDraft,
  messages,
  onAsk,
  onJump,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  draft: string;
  setDraft: (value: string) => void;
  messages: ChatMessage[];
  onAsk: (value: string) => void;
  onJump: (id: string) => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  return (
    <div className="reg-bot">
      {open && (
        <section className="reg-bot-panel" aria-label="Daxon regulation guide">
          <header>
            <img src={DAXON} alt="" />
            <div>
              <strong>Daxon</strong>
              <span>Regulation guide</span>
            </div>
            <button type="button" className="icon" onClick={onClose} aria-label="Close Daxon">
              <X size={16} />
            </button>
          </header>
          <div className="reg-bot-thread">
            {messages.map((message, index) => (
              <div key={index} className={`reg-bot-msg ${message.role}`}>
                {message.role === "bot" && <img src={DAXON} alt="" />}
                <div>
                  <p>{message.text}</p>
                  {message.hits?.map((hit) => (
                    <button
                      key={hit.id}
                      type="button"
                      className="reg-bot-hit"
                      onClick={() => onJump(hit.id)}
                    >
                      <b>
                        {communityName(hit.area)} · {hit.ref}
                      </b>
                      <span>{hit.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div ref={end} />
          </div>
          <form
            className="reg-bot-form"
            onSubmit={(event) => {
              event.preventDefault();
              onAsk(draft);
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask Daxon about a clause…"
              aria-label="Ask Daxon about a clause"
            />
            <button className="primary" type="submit" aria-label="Send">
              <Send size={16} />
            </button>
          </form>
        </section>
      )}
      {!open && (
        <button
          type="button"
          className="reg-bot-launch"
          onClick={onOpen}
          aria-label="Hi, I'm Daxon. Ask me."
        >
          <span className="reg-bot-bubble">Hi, I&apos;m Daxon. Ask me.</span>
          <span className="reg-bot-fab">
            <img src={DAXON} alt="" />
          </span>
        </button>
      )}
    </div>
  );
}
