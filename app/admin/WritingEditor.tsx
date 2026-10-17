"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  undo,
} from "@codemirror/commands";
import { EditorView, keymap } from "@codemirror/view";

export type WritingEditorHandle = {
  insertText: (text: string) => void;
  focus: () => void;
  getSelection: () => { from: number; to: number };
  replaceRange: (from: number, to: number, text: string) => void;
};

export type WritingEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  id?: string;
};

type LinkRange = { from: number; to: number; text: string };

const EMPTY_SELECTION = { from: 0, to: 0 };
const EMPTY_LINK_RANGE: LinkRange = { from: 0, to: 0, text: "" };

function isImageFile(file: File): boolean {
  return file.type.toLowerCase().startsWith("image/");
}

function safeLink(value: string): boolean {
  const candidate = value.trim();
  if (!candidate || /[\s\u0000-\u001f\u007f-\u009f]/.test(candidate)) return false;
  if (/^(?:javascript|vbscript|data):/i.test(candidate)) return false;
  if (candidate.startsWith("//")) return false;
  if (candidate.startsWith("/")) return true;
  if (candidate.startsWith("#")) return true;
  if (!/^https?:\/\//i.test(candidate)) return false;

  try {
    const url = new URL(candidate);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function normalizeLinkUrl(value: string): string {
  return value.trim().replace(/[ ()]/g, (character) => {
    if (character === " ") return "%20";
    return character === "(" ? "%28" : "%29";
  });
}

function countMatches(value: string, query: string): number {
  if (!query) return 0;
  const haystack = value.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  let count = 0;
  let index = 0;
  while ((index = haystack.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }
  return count;
}

const WritingEditor = forwardRef<WritingEditorHandle, WritingEditorProps>(function WritingEditor(
  {
    value,
    onChange,
    onFiles,
    disabled = false,
    invalid = false,
    describedBy,
    id = "post-body",
  },
  ref,
) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onFilesRef = useRef(onFiles);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [linkError, setLinkError] = useState("");
  const [linkRange, setLinkRange] = useState<LinkRange>(EMPTY_LINK_RANGE);
  const [draggingImage, setDraggingImage] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onFilesRef.current = onFiles;
  }, [onFiles]);

  useEffect(() => {
    if (!searchOpen) return;
    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [searchOpen]);

  useEffect(() => {
    if (!linkOpen) return;
    const focusTimer = window.setTimeout(() => linkInputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [linkOpen]);

  const handleFiles = useCallback(
    (files: File[]) => {
      setDraggingImage(false);
      if (disabled) return;
      const images = files.filter(isImageFile);
      if (images.length > 0) onFilesRef.current(images);
    },
    [disabled],
  );

  const handleFileInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleFiles(Array.from(event.target.files ?? []));
      event.target.value = "";
    },
    [handleFiles],
  );

  const replaceSelection = useCallback(
    (before: string, after = "", placeholder = "내용") => {
      const currentView = editorRef.current?.view;
      if (!currentView || disabled) return;
      const selection = currentView.state.selection.main;
      const selected = currentView.state.sliceDoc(selection.from, selection.to);
      const content = selected || placeholder;
      const replacement = `${before}${content}${after}`;
      const selectionFrom = selection.from + before.length;
      const selectionTo = selectionFrom + content.length;
      currentView.dispatch({
        changes: { from: selection.from, to: selection.to, insert: replacement },
        selection: { anchor: selectionFrom, head: selectionTo },
      });
      currentView.focus();
    },
    [disabled],
  );

  const openLinkDialog = useCallback(() => {
    const currentView = editorRef.current?.view;
    if (!currentView || disabled) return;
    const selection = currentView.state.selection.main;
    const selected = currentView.state.sliceDoc(selection.from, selection.to);
    setLinkRange({ from: selection.from, to: selection.to, text: selected });
    setLinkText(selected || "링크");
    setLinkUrl("");
    setLinkError("");
    setLinkOpen(true);
  }, [disabled]);

  const extensions = useMemo(() => {
    const contentAttributes: Record<string, string> = {
      id,
      role: "textbox",
      "aria-label": "본문",
      "aria-multiline": "true",
      "aria-invalid": String(invalid),
    };
    if (describedBy) contentAttributes["aria-describedby"] = describedBy;

    return [
      markdown({ base: markdownLanguage }),
      history(),
      EditorView.lineWrapping,
      EditorView.editable.of(!disabled),
      EditorView.contentAttributes.of(contentAttributes),
      keymap.of([
        {
          key: "Mod-b",
          run: () => {
            replaceSelection("**", "**", "굵은 글씨");
            return true;
          },
        },
        {
          key: "Mod-i",
          run: () => {
            replaceSelection("_", "_", "기울임 글씨");
            return true;
          },
        },
        {
          key: "Mod-k",
          run: () => {
            openLinkDialog();
            return true;
          },
        },
        {
          key: "Mod-f",
          run: () => {
            setSearchOpen(true);
            return true;
          },
        },
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      EditorView.domEventHandlers({
        drop: (event) => {
          const dropEvent = event as unknown as globalThis.DragEvent;
          const files = Array.from(dropEvent.dataTransfer?.files ?? []).filter(isImageFile);
          if (files.length === 0) return false;
          dropEvent.preventDefault();
          handleFiles(files);
          return true;
        },
        paste: (event) => {
          const pasteEvent = event as ClipboardEvent;
          const files = Array.from(pasteEvent.clipboardData?.files ?? []).filter(isImageFile);
          if (files.length === 0) return false;
          pasteEvent.preventDefault();
          handleFiles(files);
          return true;
        },
      }),
    ];
  }, [describedBy, disabled, handleFiles, id, invalid, openLinkDialog, replaceSelection]);

  useImperativeHandle(
    ref,
    () => ({
      insertText(text: string) {
        const currentView = editorRef.current?.view;
        if (!currentView || disabled) return;
        const selection = currentView.state.selection.main;
        currentView.dispatch({
          changes: { from: selection.from, to: selection.to, insert: text },
          selection: { anchor: selection.from + text.length },
        });
        currentView.focus();
      },
      focus() {
        editorRef.current?.view?.focus();
      },
      getSelection() {
        const selection = editorRef.current?.view?.state.selection.main;
        return selection ? { from: selection.from, to: selection.to } : EMPTY_SELECTION;
      },
      replaceRange(from: number, to: number, text: string) {
        const currentView = editorRef.current?.view;
        if (!currentView || disabled) return;
        const start = Math.max(0, Math.min(from, currentView.state.doc.length));
        const end = Math.max(start, Math.min(to, currentView.state.doc.length));
        currentView.dispatch({
          changes: { from: start, to: end, insert: text },
          selection: { anchor: start + text.length },
        });
        currentView.focus();
      },
    }),
    [disabled],
  );

  const prefixLines = useCallback(
    (prefix: string) => {
      const currentView = editorRef.current?.view;
      if (!currentView || disabled) return;
      const selection = currentView.state.selection.main;
      const startLine = currentView.state.doc.lineAt(selection.from);
      const endPosition = Math.max(selection.from, selection.to - (selection.to > selection.from ? 1 : 0));
      const endLine = currentView.state.doc.lineAt(endPosition);
      const original = currentView.state.sliceDoc(startLine.from, endLine.to);
      const lines = original.split("\n");
      const changed = lines
        .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : `${prefix}${line}`))
        .join("\n");
      currentView.dispatch({ changes: { from: startLine.from, to: endLine.to, insert: changed } });
      currentView.focus();
    },
    [disabled],
  );

  const insertCodeFence = useCallback(() => {
    replaceSelection("```\n", "\n```", "코드를 입력하세요");
  }, [replaceSelection]);

  const insertHorizontalRule = useCallback(() => {
    const currentView = editorRef.current?.view;
    if (!currentView || disabled) return;
    const selection = currentView.state.selection.main;
    const before = selection.from > 0 && currentView.state.sliceDoc(selection.from - 1, selection.from) !== "\n" ? "\n" : "";
    const after = selection.to < currentView.state.doc.length && currentView.state.sliceDoc(selection.to, selection.to + 1) !== "\n" ? "\n" : "";
    const text = `${before}---${after}\n`;
    currentView.dispatch({ changes: { from: selection.from, to: selection.to, insert: text }, selection: { anchor: selection.from + text.length } });
    currentView.focus();
  }, [disabled]);

  const applyLink = useCallback(() => {
    const normalizedUrl = normalizeLinkUrl(linkUrl);
    if (!safeLink(normalizedUrl)) {
      setLinkError("http(s) 주소 또는 /, # 로 시작하는 안전한 주소를 입력해 주세요.");
      return;
    }
    const currentView = editorRef.current?.view;
    if (!currentView || disabled) return;
    const text = linkText.replace(/[\[\]\r\n]/g, "").trim() || "링크";
    const replacement = `[${text}](${normalizedUrl})`;
    currentView.dispatch({
      changes: { from: linkRange.from, to: linkRange.to, insert: replacement },
      selection: { anchor: linkRange.from + replacement.length },
    });
    currentView.focus();
    setLinkOpen(false);
  }, [disabled, linkRange, linkText, linkUrl]);

  const closeLinkDialog = useCallback(() => {
    setLinkOpen(false);
    setLinkError("");
    editorRef.current?.view?.focus();
  }, []);

  const selectSearchMatch = useCallback(
    (direction: 1 | -1) => {
      const currentView = editorRef.current?.view;
      const query = searchQuery.trim();
      if (!currentView || !query) return;
      const documentText = currentView.state.doc.toString();
      const lowerDocument = documentText.toLocaleLowerCase();
      const lowerQuery = query.toLocaleLowerCase();
      const cursor = currentView.state.selection.main.head;
      let index = direction > 0 ? lowerDocument.indexOf(lowerQuery, cursor + (currentView.state.selection.main.empty ? 0 : 1)) : lowerDocument.lastIndexOf(lowerQuery, cursor - 1);
      if (index === -1) {
        index = direction > 0 ? lowerDocument.indexOf(lowerQuery) : lowerDocument.lastIndexOf(lowerQuery);
      }
      if (index === -1) return;
      currentView.dispatch({
        selection: { anchor: index, head: index + query.length },
        effects: EditorView.scrollIntoView(index, { y: "center" }),
      });
      currentView.focus();
    },
    [searchQuery],
  );

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    editorRef.current?.view?.focus();
  }, []);

  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
      } else if (event.key === "Enter") {
        event.preventDefault();
        selectSearchMatch(event.shiftKey ? -1 : 1);
      }
    },
    [closeSearch, selectSearchMatch],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    const files = Array.from(event.dataTransfer?.items ?? []);
    if (!files.some((item) => item.kind === "file" && item.type.toLowerCase().startsWith("image/"))) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDraggingImage(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDraggingImage(false);
  }, []);

  const handleToolbarMouseDown = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    // Keep the CodeMirror selection active while a toolbar button is pressed.
    event.preventDefault();
  }, []);

  const characterCount = value.replace(/\s/g, "").length;
  const readingMinutes = value.trim() ? Math.max(1, Math.ceil(characterCount / 500)) : 0;
  const matchCount = countMatches(value, searchQuery.trim());

  return (
    <div
      className={`writing-editor${invalid ? " writing-editor-invalid" : ""}${draggingImage ? " writing-editor-dragging" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={() => setDraggingImage(false)}
    >
      <div className="writing-editor-toolbar" role="toolbar" aria-label="본문 서식 도구">
        <div className="writing-editor-tool-group" aria-label="제목과 강조">
          <button type="button" onMouseDown={handleToolbarMouseDown} onClick={() => prefixLines("## ")} disabled={disabled} aria-label="2단계 제목" title="2단계 제목">H2</button>
          <button type="button" onMouseDown={handleToolbarMouseDown} onClick={() => prefixLines("### ")} disabled={disabled} aria-label="3단계 제목" title="3단계 제목">H3</button>
          <button type="button" onMouseDown={handleToolbarMouseDown} onClick={() => replaceSelection("**", "**", "굵은 글씨")} disabled={disabled} aria-label="굵게" title="굵게">B</button>
          <button type="button" onMouseDown={handleToolbarMouseDown} onClick={() => replaceSelection("_", "_", "기울임 글씨")} disabled={disabled} aria-label="기울임" title="기울임"><em>I</em></button>
        </div>
        <div className="writing-editor-tool-group" aria-label="문단과 목록">
          <button type="button" onMouseDown={handleToolbarMouseDown} onClick={() => prefixLines("> ")} disabled={disabled} aria-label="인용문" title="인용문">❝</button>
          <button type="button" onMouseDown={handleToolbarMouseDown} onClick={() => prefixLines("- ")} disabled={disabled} aria-label="순서 없는 목록" title="순서 없는 목록">• 목록</button>
          <button type="button" onMouseDown={handleToolbarMouseDown} onClick={() => prefixLines("1. ")} disabled={disabled} aria-label="순서 있는 목록" title="순서 있는 목록">1. 목록</button>
          <button type="button" onMouseDown={handleToolbarMouseDown} onClick={insertHorizontalRule} disabled={disabled} aria-label="가로줄" title="가로줄">―</button>
        </div>
        <div className="writing-editor-tool-group" aria-label="코드와 링크">
          <button type="button" onMouseDown={handleToolbarMouseDown} onClick={() => replaceSelection("`", "`", "코드")} disabled={disabled} aria-label="인라인 코드" title="인라인 코드">`코드`</button>
          <button type="button" onMouseDown={handleToolbarMouseDown} onClick={insertCodeFence} disabled={disabled} aria-label="코드 블록" title="코드 블록">```</button>
          <button type="button" onMouseDown={handleToolbarMouseDown} onClick={openLinkDialog} disabled={disabled} aria-label="링크 넣기" title="링크 넣기">↗ 링크</button>
        </div>
        <div className="writing-editor-tool-group writing-editor-tool-group-end" aria-label="편집과 미디어">
          <button type="button" onMouseDown={handleToolbarMouseDown} onClick={() => editorRef.current?.view && undo(editorRef.current.view)} disabled={disabled} aria-label="실행 취소" title="실행 취소">↶</button>
          <button type="button" onMouseDown={handleToolbarMouseDown} onClick={() => editorRef.current?.view && redo(editorRef.current.view)} disabled={disabled} aria-label="다시 실행" title="다시 실행">↷</button>
          <button type="button" onMouseDown={handleToolbarMouseDown} onClick={() => { setSearchOpen(true); window.setTimeout(() => searchInputRef.current?.focus(), 0); }} aria-label="본문 검색" title="본문 검색 (Ctrl/Cmd+F)">⌕</button>
          <button type="button" className="writing-editor-image-button" onMouseDown={handleToolbarMouseDown} onClick={() => fileInputRef.current?.click()} disabled={disabled} aria-label="사진 넣기" title="사진 넣기">▧ 사진</button>
          <input ref={fileInputRef} className="writing-editor-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleFileInput} aria-label="본문에 넣을 사진 선택" />
        </div>
      </div>

      {searchOpen ? (
        <div className="writing-editor-search" role="search" aria-label="본문 검색">
          <label htmlFor={`${id}-search`}>찾기</label>
          <input
            ref={searchInputRef}
            id={`${id}-search`}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="본문에서 찾기"
            autoComplete="off"
          />
          <span aria-live="polite">{searchQuery ? `${matchCount}개` : "검색어를 입력하세요"}</span>
          <button type="button" onClick={() => selectSearchMatch(-1)} disabled={!searchQuery} aria-label="이전 검색 결과">↑</button>
          <button type="button" onClick={() => selectSearchMatch(1)} disabled={!searchQuery} aria-label="다음 검색 결과">↓</button>
          <button type="button" onClick={closeSearch} aria-label="검색 닫기">닫기</button>
        </div>
      ) : null}

      <div className="writing-editor-canvas" aria-busy={disabled}>
        <CodeMirror
          ref={editorRef}
          value={value}
          height="390px"
          extensions={extensions}
          basicSetup={{
            searchKeymap: false,
            foldGutter: false,
            highlightActiveLine: true,
            highlightActiveLineGutter: false,
          }}
          onChange={onChange}
          className="writing-editor-codemirror"
          aria-label="본문"
        />
        {draggingImage ? <div className="writing-editor-drop-hint" role="status">사진을 놓으면 본문에 넣을 수 있어요</div> : null}
      </div>

      {linkOpen ? (
        <div className="writing-editor-link-popover" role="dialog" aria-label="링크 추가" aria-modal="false">
          <div className="writing-editor-link-heading"><strong>링크 추가</strong><span>마크다운 링크</span></div>
          <label htmlFor={`${id}-link-text`}>표시할 글자</label>
          <input id={`${id}-link-text`} value={linkText} onChange={(event) => setLinkText(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); applyLink(); } if (event.key === "Escape") { event.preventDefault(); closeLinkDialog(); } }} />
          <label htmlFor={`${id}-link-url`}>주소</label>
          <input ref={linkInputRef} id={`${id}-link-url`} value={linkUrl} onChange={(event) => { setLinkUrl(event.target.value); setLinkError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyLink(); } if (event.key === "Escape") { event.preventDefault(); closeLinkDialog(); } }} placeholder="https://" inputMode="url" autoComplete="url" />
          {linkError ? <p className="writing-editor-link-error" role="alert">{linkError}</p> : null}
          <div className="writing-editor-link-actions">
            <button type="button" className="writing-editor-link-cancel" onClick={closeLinkDialog}>취소</button>
            <button type="button" className="writing-editor-link-apply" onClick={applyLink}>넣기</button>
          </div>
        </div>
      ) : null}

      <div className="writing-editor-footer">
        <span>마크다운 · 줄바꿈 자동</span>
        <span><b>{characterCount.toLocaleString()}</b>자 <b>{readingMinutes || "—"}</b>분 읽기</span>
        <span className="writing-editor-shortcut">Ctrl/Cmd+F 검색 · 사진 붙여넣기/끌어놓기</span>
      </div>
    </div>
  );
});

WritingEditor.displayName = "WritingEditor";

export default WritingEditor;
