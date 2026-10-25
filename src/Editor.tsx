import { useEffect, useRef } from "react";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

// Calm colours with no blue: keywords in rose, text in green, numbers in ochre, comments in grey.
const colours = HighlightStyle.define([
  { tag: [t.keyword, t.bool, t.null, t.self], color: "var(--code-keyword)" },
  { tag: [t.string, t.special(t.string)], color: "var(--code-string)" },
  { tag: [t.number], color: "var(--code-number)" },
  { tag: [t.comment], color: "var(--secondary)", fontStyle: "italic" },
  { tag: [t.definition(t.variableName), t.function(t.definition(t.variableName))], fontWeight: "600" },
]);

/** The line Python stopped on, tinted until the code changes. */
const markError = StateEffect.define<number | null>();
const errorLine = StateField.define({
  create: () => Decoration.none,
  update(marks, tr) {
    if (tr.docChanged) return Decoration.none;
    for (const effect of tr.effects) {
      if (!effect.is(markError)) continue;
      const n = effect.value;
      if (n === null || n < 1 || n > tr.state.doc.lines) return Decoration.none;
      return Decoration.set([Decoration.line({ class: "cm-error-line" }).range(tr.state.doc.line(n).from)]);
    }
    return marks;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export interface EditorHandle {
  /** Shows another file, with its own undo history. */
  load(doc: string): void;
  text(): string;
  showError(line: number | null): void;
  focusLine(line: number): void;
}

export interface Cursor {
  line: number;
  column: number;
}

export function Editor({
  onChange,
  onCursor,
  handle,
}: {
  onChange: (code: string) => void;
  onCursor: (cursor: Cursor) => void;
  handle: React.RefObject<EditorHandle | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const changed = useRef(onChange);
  changed.current = onChange;
  const moved = useRef(onCursor);
  moved.current = onCursor;

  useEffect(() => {
    const extensions = [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      drawSelection(),
      indentUnit.of("    "),
      EditorState.tabSize.of(4),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
      python(),
      syntaxHighlighting(colours),
      placeholder("Type your Python here, then press Run."),
      errorLine,
      EditorView.contentAttributes.of({ "aria-label": "Code", spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) changed.current(update.state.doc.toString());
        if (update.docChanged || update.selectionSet) {
          const head = update.state.selection.main.head;
          const line = update.state.doc.lineAt(head);
          moved.current({ line: line.number, column: head - line.from + 1 });
        }
      }),
    ];
    const view = new EditorView({ parent: host.current!, state: EditorState.create({ doc: "", extensions }) });
    handle.current = {
      load(doc) {
        view.setState(EditorState.create({ doc, extensions }));
        moved.current({ line: 1, column: 1 });
        view.focus();
      },
      text: () => view.state.doc.toString(),
      showError: (line) => view.dispatch({ effects: markError.of(line) }),
      focusLine(line) {
        if (line < 1 || line > view.state.doc.lines) return;
        const at = view.state.doc.line(line);
        view.dispatch({ selection: { anchor: at.to }, effects: EditorView.scrollIntoView(at.from, { y: "center" }) });
        view.focus();
      },
    };
    return () => view.destroy();
    // The editor owns its text; files come in through handle.load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="editor" ref={host} />;
}
