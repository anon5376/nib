import { Fragment, useEffect, useRef, useState } from "react";
import { explain, type PyError } from "./explain";
import type { Item, Status } from "./useRun";
import { mod } from "./keys";

export function Output({
  items,
  status,
  running,
  onAnswer,
  onClear,
  onLine,
}: {
  items: Item[];
  status: Status;
  running: boolean;
  onAnswer: (text: string) => void;
  onClear: () => void;
  onLine: (line: number) => void;
}) {
  const [answer, setAnswer] = useState("");
  const output = useRef<HTMLDivElement>(null);
  const answerField = useRef<HTMLInputElement>(null);
  const asking = status.kind === "asking";

  useEffect(() => {
    output.current?.scrollTo({ top: output.current.scrollHeight });
  }, [items, status.kind]);

  // The Mac web view ignores focus() during the same frame the field appears, so wait one.
  useEffect(() => {
    if (!asking) return;
    const frame = requestAnimationFrame(() => answerField.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [asking]);

  // Text runs are grouped into one block each so the answer field can sit on the prompt's line.
  const groups: (Item[] | Item)[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (item.kind === "error" || item.kind === "note") groups.push(item);
    else if (Array.isArray(last)) last.push(item);
    else groups.push([item]);
  }
  if (asking && !Array.isArray(groups[groups.length - 1])) groups.push([]);

  return (
    <section className="panel output-panel" aria-label="Output">
      <div className="panel-head">
        <h2>Output</h2>
        <button className="ghost" onClick={onClear} disabled={!items.length}>
          Clear
        </button>
      </div>
      <div className="output" ref={output}>
        {!items.length && !running && (
          <div className="empty">
            <p>Press Run to start your program. Whatever it prints shows up here, and if it asks a question, you answer here too.</p>
            <dl className="keys">
              <div>
                <dt>Run</dt>
                <dd>{mod}R</dd>
              </div>
              <div>
                <dt>Stop</dt>
                <dd>{mod}.</dd>
              </div>
              <div>
                <dt>New file</dt>
                <dd>{mod}N</dd>
              </div>
            </dl>
          </div>
        )}
        {groups.map((group, i) =>
          Array.isArray(group) ? (
            <pre className="stream" key={i}>
              {group.map((item, j) => (
                <span key={j} className={item.kind}>
                  {"text" in item ? item.text : ""}
                </span>
              ))}
              {asking && i === groups.length - 1 && (
                <input
                  className="answer"
                  ref={answerField}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    onAnswer(answer);
                    setAnswer("");
                  }}
                  aria-label="Your answer"
                  spellCheck={false}
                  autoComplete="off"
                />
              )}
            </pre>
          ) : group.kind === "error" ? (
            <ErrorCard key={i} error={group.error} onLine={onLine} />
          ) : group.kind === "note" ? (
            <p className="note" key={i}>
              {group.text}
            </p>
          ) : (
            <Fragment key={i} />
          ),
        )}
      </div>
    </section>
  );
}

function ErrorCard({ error, onLine }: { error: PyError; onLine: (line: number) => void }) {
  const { title, detail } = explain(error);
  return (
    <div className="error-card" role="alert">
      <p className="error-title">{title}</p>
      <p className="error-detail">{detail}</p>
      <div className="error-foot">
        {error.line && (
          <button className="line-button" onClick={() => onLine(error.line!)}>
            Go to line {error.line}
          </button>
        )}
        <details>
          <summary>Python's message</summary>
          <pre>{error.text}</pre>
        </details>
      </div>
    </div>
  );
}
