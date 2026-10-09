"use client";

import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { renderMarkdown } from "../lib/markdown";

type CoverStyle = "stripes" | "sun" | "type" | "landscape";
type Category = "일상" | "생각" | "취향" | "만들기";

type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: Category;
  tags: string[];
  published: boolean;
  featured: boolean;
  cover: CoverStyle;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
};

type SiteSettings = {
  title: string;
  author: string;
  description: string;
  bio: string;
};

type AdminUser = {
  displayName: string;
  email: string;
};

type AdminClientProps = {
  user: AdminUser;
};

type DraftPost = Omit<
  BlogPost,
  "id" | "createdAt" | "updatedAt" | "publishedAt"
> & {
  id: string | null;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
};

type FieldErrors = Partial<Record<"title" | "slug" | "excerpt" | "body", string>>;
type AdminTab = "posts" | "settings";
type EditorMode = "write" | "preview";
type SaveIntent = "draft" | "publish";

const CATEGORIES: Category[] = ["일상", "생각", "취향", "만들기"];
const COVERS: Array<{ value: CoverStyle; label: string; note: string }> = [
  { value: "stripes", label: "기록의 결", note: "컬러 스트라이프" },
  { value: "sun", label: "느린 오후", note: "따뜻한 햇살" },
  { value: "type", label: "활자와 생각", note: "편집실 타이포" },
  { value: "landscape", label: "한 장면", note: "조용한 풍경" },
];

const EMPTY_SETTINGS: SiteSettings = {
  title: "김지헌의 기록실",
  author: "김지헌",
  description: "생각과 취향, 매일의 작은 만들기를 기록합니다.",
  bio: "느리게 관찰하고, 오래 남을 문장을 씁니다.",
};

function emptyDraft(): DraftPost {
  return {
    id: null,
    slug: "",
    title: "",
    excerpt: "",
    body: "",
    category: "일상",
    tags: [],
    published: false,
    featured: false,
    cover: "stripes",
  };
}

function normalizePost(value: BlogPost): BlogPost {
  return {
    ...value,
    id: String(value.id),
    slug: value.slug ?? "",
    title: value.title ?? "",
    excerpt: value.excerpt ?? "",
    body: value.body ?? "",
    category: CATEGORIES.includes(value.category) ? value.category : "일상",
    tags: Array.isArray(value.tags) ? value.tags.filter(Boolean).map(String) : [],
    published: Boolean(value.published),
    featured: Boolean(value.featured),
    cover: COVERS.some((cover) => cover.value === value.cover)
      ? value.cover
      : "stripes",
    createdAt: value.createdAt ?? "",
    updatedAt: value.updatedAt ?? value.createdAt ?? "",
    publishedAt: value.publishedAt,
  };
}

function toDraft(post: BlogPost | null): DraftPost {
  if (!post) return emptyDraft();
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    category: post.category,
    tags: [...post.tags],
    published: post.published,
    featured: post.featured,
    cover: post.cover,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    publishedAt: post.publishedAt,
  };
}

function snapshot(value: DraftPost): string {
  return JSON.stringify({
    id: value.id,
    slug: value.slug,
    title: value.title,
    excerpt: value.excerpt,
    body: value.body,
    category: value.category,
    tags: value.tags,
    published: value.published,
    featured: value.featured,
    cover: value.cover,
  });
}

function displayDate(value?: string): string {
  if (!value) return "아직 저장하지 않음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function isPost(value: unknown): value is BlogPost {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "title" in value &&
      "slug" in value,
  );
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "error" in payload
        ? String(payload.error)
        : typeof payload === "string" && payload.trim()
          ? payload
          : `요청을 처리하지 못했습니다 (${response.status}).`;
    throw new Error(message);
  }

  return payload as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

type ParsedBackup = {
  settings: SiteSettings;
  posts: BlogPost[];
};

function parseBackup(value: unknown): ParsedBackup {
  if (!isRecord(value)) throw new Error("백업 파일의 형식이 올바르지 않습니다.");
  if (!Array.isArray(value.posts)) throw new Error("백업 파일에 posts 배열이 없습니다.");
  if (!isRecord(value.settings)) throw new Error("백업 파일에 settings 객체가 없습니다.");

  const rawSettings = value.settings;
  const settingsFields = ["title", "author", "description", "bio"] as const;
  const settings = settingsFields.reduce<SiteSettings>((result, key) => {
    const field = rawSettings[key];
    result[key] = typeof field === "string" ? field : EMPTY_SETTINGS[key];
    return result;
  }, { ...EMPTY_SETTINGS });

  const posts = value.posts.map((rawPost, index) => {
    if (!isRecord(rawPost)) {
      throw new Error(`백업 파일의 ${index + 1}번째 글을 읽을 수 없습니다.`);
    }
    if (typeof rawPost.slug !== "string" || !rawPost.slug.trim()) {
      throw new Error(`백업 파일의 ${index + 1}번째 글에 slug가 없습니다.`);
    }
    if (typeof rawPost.title !== "string" || typeof rawPost.body !== "string") {
      throw new Error(`백업 파일의 ${index + 1}번째 글에 제목과 본문이 필요합니다.`);
    }

    return normalizePost({
      id: String(rawPost.id ?? `import-${index + 1}`),
      slug: rawPost.slug,
      title: rawPost.title,
      excerpt: typeof rawPost.excerpt === "string" ? rawPost.excerpt : "",
      body: rawPost.body,
      category: typeof rawPost.category === "string" && CATEGORIES.includes(rawPost.category as Category)
        ? rawPost.category as Category
        : "일상",
      tags: Array.isArray(rawPost.tags) ? rawPost.tags.filter((tag): tag is string => typeof tag === "string") : [],
      published: rawPost.published === true,
      featured: rawPost.featured === true,
      cover: typeof rawPost.cover === "string" && COVERS.some((cover) => cover.value === rawPost.cover)
        ? rawPost.cover as CoverStyle
        : "stripes",
      createdAt: typeof rawPost.createdAt === "string" ? rawPost.createdAt : "",
      updatedAt: typeof rawPost.updatedAt === "string" ? rawPost.updatedAt : "",
      publishedAt: typeof rawPost.publishedAt === "string" ? rawPost.publishedAt : undefined,
    });
  });

  return { settings, posts };
}

function restorePostPayload(post: BlogPost) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    category: post.category,
    tags: post.tags,
    published: post.published,
    featured: post.featured,
    cover: post.cover,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    publishedAt: post.publishedAt ?? null,
  };
}

function validateDraft(value: DraftPost): FieldErrors {
  const errors: FieldErrors = {};
  if (!value.title.trim()) errors.title = "제목을 입력해 주세요.";
  if (!value.slug.trim()) {
    errors.slug = "주소에 사용할 슬러그를 입력해 주세요.";
  } else if (!/^[a-z0-9가-힣]+(?:-[a-z0-9가-힣]+)*$/i.test(value.slug.trim())) {
    errors.slug = "슬러그는 영문, 숫자, 한글과 하이픈만 사용할 수 있습니다.";
  }
  if (!value.excerpt.trim()) errors.excerpt = "글 목록에 보여줄 요약을 입력해 주세요.";
  if (!value.body.trim()) errors.body = "본문을 입력해 주세요.";
  return errors;
}

function MarkdownPreview({ body }: { body: string }) {
  if (!body.trim()) {
    return <p className="admin-preview-empty">본문을 입력하면 여기에서 미리 볼 수 있어요.</p>;
  }
  return <div className="admin-markdown-preview">{renderMarkdown(body)}</div>;
}

function Notice({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
}) {
  return (
    <div className={`notice admin-notice admin-notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p className="admin-field-error" id={id} role="alert">
      {children}
    </p>
  );
}

export default function AdminClient({ user }: AdminClientProps) {
  const [tab, setTab] = useState<AdminTab>("posts");
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [settings, setSettings] = useState<SiteSettings>(EMPTY_SETTINGS);
  const [draft, setDraft] = useState<DraftPost>(emptyDraft);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshot(emptyDraft()));
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const [editorMode, setEditorMode] = useState<EditorMode>("write");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [savingIntent, setSavingIntent] = useState<SaveIntent | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [savedSettingsSnapshot, setSavedSettingsSnapshot] = useState(() => JSON.stringify(EMPTY_SETTINGS));
  const editorFormRef = useRef<HTMLFormElement>(null);
  const settingsFormRef = useRef<HTMLFormElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const bodyTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const saveIntentRef = useRef<SaveIntent>("draft");

  const dirty = snapshot(draft) !== savedSnapshot;
  const anyDirty = dirty || settingsDirty;

  const loadAdmin = useCallback(async () => {
    const payload = await requestJson<{ posts?: BlogPost[]; settings?: SiteSettings }>("/api/admin");
    const nextPosts = Array.isArray(payload.posts) ? payload.posts.map(normalizePost) : [];
    const nextSettings = payload.settings
      ? { ...EMPTY_SETTINGS, ...payload.settings }
      : EMPTY_SETTINGS;
    setPosts(nextPosts);
    setSettings(nextSettings);
    setSavedSettingsSnapshot(JSON.stringify(nextSettings));
    setLoadError(null);
    setLoading(false);
    return { posts: nextPosts, settings: nextSettings };
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      void loadAdmin().catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : "관리자 데이터를 불러오지 못했습니다.");
        setLoading(false);
      });
    });
    return () => {
      active = false;
    };
  }, [loadAdmin]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!anyDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [anyDirty]);

  const sortedPosts = useMemo(
    () =>
      [...posts].sort((a, b) => {
        const aDate = new Date(a.updatedAt || a.createdAt).getTime() || 0;
        const bDate = new Date(b.updatedAt || b.createdAt).getTime() || 0;
        return bDate - aDate;
      }),
    [posts],
  );

  const visiblePosts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return sortedPosts.filter((post) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "published" ? post.published : !post.published);
      if (!matchesStatus) return false;
      if (!normalizedQuery) return true;
      return [post.title, post.slug, post.excerpt, ...post.tags]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
  }, [query, sortedPosts, statusFilter]);

  const updateDraft = useCallback(<K extends keyof DraftPost>(key: K, value: DraftPost[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice(null);
    if (key in fieldErrors) {
      setFieldErrors((current) => ({ ...current, [key]: undefined }));
    }
  }, [fieldErrors]);

  const confirmSwitchIfDirty = useCallback(() => {
    if (!dirty) return true;
    return window.confirm("저장하지 않은 변경사항이 있어요. 이동하면 변경사항이 사라집니다. 계속할까요?");
  }, [dirty]);

  const selectPost = useCallback(
    (post: BlogPost | null) => {
      if (!confirmSwitchIfDirty()) return;
      const nextDraft = toDraft(post);
      setSelectedId(post?.id ?? null);
      setDraft(nextDraft);
      setSavedSnapshot(snapshot(nextDraft));
      setFieldErrors({});
      setEditorMode("write");
      setNotice(null);
      setTab("posts");
    },
    [confirmSwitchIfDirty],
  );

  const startNewPost = useCallback(() => selectPost(null), [selectPost]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validateDraft(draft);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setNotice({ tone: "error", text: "필수 항목을 확인한 뒤 저장해 주세요." });
      return;
    }

    const intent = saveIntentRef.current;
    const payload = {
      slug: draft.slug.trim(),
      title: draft.title.trim(),
      excerpt: draft.excerpt.trim(),
      body: draft.body,
      category: draft.category,
      tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
      published: intent === "publish",
      featured: draft.featured,
      cover: draft.cover,
    };

    setSaving(true);
    setSavingIntent(intent);
    setNotice(null);
    try {
      const response = draft.id
        ? await requestJson<BlogPost | { post?: BlogPost }>(`/api/posts/${encodeURIComponent(draft.id)}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : await requestJson<BlogPost | { post?: BlogPost }>("/api/posts", {
            method: "POST",
            body: JSON.stringify(payload),
          });

      const responsePost = isPost(response)
        ? normalizePost(response)
        : response && typeof response === "object" && "post" in response && isPost(response.post)
          ? normalizePost(response.post)
          : null;

      if (responsePost) {
        setPosts((current) => {
          const existing = current.some((post) => post.id === responsePost.id);
          return existing
            ? current.map((post) => (post.id === responsePost.id ? responsePost : post))
            : [responsePost, ...current];
        });
        const nextDraft = toDraft(responsePost);
        setDraft(nextDraft);
        setSelectedId(responsePost.id);
        setSavedSnapshot(snapshot(nextDraft));
      } else {
        const refreshed = await loadAdmin();
        const match = refreshed.posts.find((post) => post.slug === payload.slug);
        if (match) {
          const nextDraft = toDraft(match);
          setSelectedId(match.id);
          setDraft(nextDraft);
          setSavedSnapshot(snapshot(nextDraft));
        }
      }
      setNotice({
        tone: "success",
        text: intent === "publish" ? "글을 공개 저장했습니다." : "글을 임시 저장했습니다.",
      });
    } catch (error: unknown) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "글을 저장하지 못했습니다.",
      });
    } finally {
      setSaving(false);
      setSavingIntent(null);
    }
  };

  const handleDelete = async () => {
    if (!draft.id) {
      startNewPost();
      return;
    }
    if (!window.confirm("이 글을 삭제할까요? 삭제한 글은 관리자 화면에서 복구할 수 없습니다.")) return;

    setDeleting(true);
    setNotice(null);
    try {
      await requestJson(`/api/posts/${encodeURIComponent(draft.id)}`, { method: "DELETE" });
      const nextPosts = posts.filter((post) => post.id !== draft.id);
      setPosts(nextPosts);
      selectPost(nextPosts[0] ?? null);
      setNotice({ tone: "success", text: "글을 삭제했습니다." });
    } catch (error: unknown) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "글을 삭제하지 못했습니다.",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleSettingsChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    const nextSettings = { ...settings, [name]: value } as SiteSettings;
    setSettings(nextSettings);
    setSettingsDirty(JSON.stringify(nextSettings) !== savedSettingsSnapshot);
    setNotice(null);
  };

  const handleSettingsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings.title.trim() || !settings.author.trim()) {
      setNotice({ tone: "error", text: "블로그 이름과 작성자 이름은 꼭 입력해 주세요." });
      return;
    }
    setSettingsSaving(true);
    setNotice(null);
    try {
      const saved = await requestJson<SiteSettings | { settings?: SiteSettings }>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          title: settings.title.trim(),
          author: settings.author.trim(),
          description: settings.description.trim(),
          bio: settings.bio.trim(),
        }),
      });
      const savedSettings =
        saved && typeof saved === "object" && "settings" in saved && saved.settings
          ? saved.settings
          : saved;
      const nextSettings = { ...EMPTY_SETTINGS, ...savedSettings };
      setSettings(nextSettings);
      setSavedSettingsSnapshot(JSON.stringify(nextSettings));
      setSettingsDirty(false);
      setNotice({ tone: "success", text: "블로그 소개를 저장했습니다." });
    } catch (error: unknown) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "블로그 소개를 저장하지 못했습니다.",
      });
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSeed = async () => {
    if (posts.length) return;
    setSeeding(true);
    setNotice(null);
    try {
      await requestJson("/api/seed", { method: "POST" });
      const refreshed = await loadAdmin();
      const first = refreshed.posts[0] ?? null;
      selectPost(first);
      setNotice({ tone: "success", text: "첫 기록을 준비했습니다. 내용을 자유롭게 고쳐 보세요." });
    } catch (error: unknown) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "샘플 글을 만들지 못했습니다.",
      });
    } finally {
      setSeeding(false);
    }
  };

  const handleImportBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (anyDirty && !window.confirm("저장하지 않은 변경사항이 있어요. 먼저 백업을 합칠까요?")) return;

    setImporting(true);
    setNotice(null);
    try {
      const parsed = parseBackup(JSON.parse(await file.text()) as unknown);
      const existingSlugs = new Set(posts.map((post) => post.slug));
      const incomingSlugs = new Set<string>();
      const newPosts = parsed.posts.filter((post) => {
        if (existingSlugs.has(post.slug) || incomingSlugs.has(post.slug)) return false;
        incomingSlugs.add(post.slug);
        return true;
      });
      const skippedCount = parsed.posts.length - newPosts.length;
      const settingsChanged = JSON.stringify(parsed.settings) !== JSON.stringify(settings);

      if (!window.confirm(
        `백업에서 새 글 ${newPosts.length}개를 현재 기록과 합칠까요?\n` +
          `현재 글은 유지되고, 같은 주소의 글 ${skippedCount}개는 건너뜁니다.\n` +
          "블로그 설정은 백업 값으로 변경됩니다.",
      )) return;

      if (!newPosts.length && !settingsChanged) {
        setNotice({ tone: "info", text: "새로 합칠 글이 없어 현재 기록을 그대로 유지했습니다." });
        return;
      }

      await requestJson("/api/restore", {
        method: "POST",
        body: JSON.stringify({
          version: 1,
          settings: parsed.settings,
          posts: [...posts, ...newPosts].map(restorePostPayload),
        }),
      });

      const selectedSlug = draft.slug;
      const refreshed = await loadAdmin();
      const selected = refreshed.posts.find((post) => post.slug === selectedSlug) ?? refreshed.posts[0] ?? null;
      const nextDraft = toDraft(selected);
      setSelectedId(selected?.id ?? null);
      setDraft(nextDraft);
      setSavedSnapshot(snapshot(nextDraft));
      setFieldErrors({});
      setSettingsDirty(false);
      setSavedSettingsSnapshot(JSON.stringify(refreshed.settings));
      setNotice({
        tone: "success",
        text: `백업을 합쳤습니다. 새 글 ${newPosts.length}개를 추가했고, 기존 글 ${posts.length}개를 보존했습니다.${settingsChanged ? " 블로그 설정은 백업 값으로 변경했습니다." : " 블로그 설정은 그대로 유지했습니다."}`,
      });
    } catch (error: unknown) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "백업 파일을 가져오지 못했습니다.",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setNotice({ tone: "error", text: "사진은 8MB 이하로 올려 주세요." });
      return;
    }
    const acceptedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
    if (!acceptedTypes.has(file.type)) {
      setNotice({ tone: "error", text: "PNG, JPEG, WebP, GIF 사진만 올릴 수 있어요." });
      return;
    }

    const bodyBeforeUpload = draft.body;
    const cursorPosition = bodyTextAreaRef.current?.selectionStart ?? bodyBeforeUpload.length;
    setUploading(true);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        cache: "no-store",
      });
      const contentType = response.headers.get("content-type") ?? "";
      const payload: unknown = contentType.includes("application/json")
        ? await response.json()
        : await response.text();
      if (!response.ok) {
        const message = isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "사진을 올리지 못했습니다.";
        throw new Error(message);
      }
      if (!isRecord(payload) || typeof payload.url !== "string" || !payload.url.startsWith("/")) {
        throw new Error("사진 주소를 확인하지 못했습니다.");
      }

      const alt = file.name
        .replace(/\.[^/.]+$/u, "")
        .replace(/[\-_]+/gu, " ")
        .trim()
        .slice(0, 80) || "사진";
      const imageMarkdown = `![${alt}](${payload.url})`;
      setDraft((current) => {
        const insertionPosition = current.body === bodyBeforeUpload
          ? cursorPosition
          : current.body.length;
        const before = current.body.slice(0, insertionPosition).replace(/\s*$/u, "");
        const after = current.body.slice(insertionPosition).replace(/^\s*/u, "");
        const separatorBefore = before ? `${before}\n\n` : "";
        const separatorAfter = after ? `\n\n${after}` : "";
        return { ...current, body: `${separatorBefore}${imageMarkdown}${separatorAfter}` };
      });
      setNotice({ tone: "success", text: "사진을 올리고 본문에 삽입했습니다." });
      requestAnimationFrame(() => bodyTextAreaRef.current?.focus());
    } catch (error: unknown) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "사진을 올리지 못했습니다.",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  };

  const chooseSaveIntent = (intent: SaveIntent) => {
    saveIntentRef.current = intent;
    editorFormRef.current?.requestSubmit();
  };

  if (loading) {
    return (
      <main id="main" className="admin-shell admin-loading-shell">
        <div className="admin-loading-card" role="status" aria-live="polite">
          <span className="admin-eyebrow">OWNER / CONTROL DESK</span>
          <h1>기록실을 여는 중입니다.</h1>
          <p>저장된 글과 설정을 확인하고 있어요.</p>
          <span className="admin-loading-line" aria-hidden="true" />
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main id="main" className="admin-shell admin-error-shell">
        <div className="admin-error-card">
          <span className="admin-eyebrow">OWNER / CONTROL DESK</span>
          <h1>기록실을 불러오지 못했습니다.</h1>
          <p>{loadError}</p>
          <button className="button button-primary" type="button" onClick={() => {
            setLoading(true);
            void loadAdmin().catch((error: unknown) => {
              setLoadError(error instanceof Error ? error.message : "다시 시도하지 못했습니다.");
              setLoading(false);
            });
          }}>
            다시 시도
          </button>
        </div>
      </main>
    );
  }

  const statusLabel = draft.published ? "공개됨" : "임시저장";
  const currentTitle = draft.id ? draft.title || "제목 없는 글" : "새 기록";

  return (
    <main id="main" className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-brand-lockup">
          <Link className="admin-mark" href="/" aria-label="블로그 홈으로 이동">
            <span aria-hidden="true">KJ</span>
          </Link>
          <div>
            <p className="admin-eyebrow">OWNER / CONTROL DESK</p>
            <h1>{settings.title || "김지헌의 기록실"}</h1>
          </div>
        </div>
        <div className="admin-topbar-actions">
          <span className="admin-user-chip" title={user.email}>
            <span className="admin-user-dot" aria-hidden="true" />
            {user.displayName || "김지헌"}
          </span>
          <Link className="button button-quiet" href="/" target="_top">
            블로그 보기
          </Link>
        </div>
      </header>

      <div className="admin-body">
        <aside className="admin-sidebar" aria-label="관리 메뉴">
          <div className="admin-sidebar-intro">
            <p className="admin-sidebar-kicker">MY NOTEBOOK</p>
            <p className="admin-sidebar-copy">생각을 고르고, 다듬고, 오래 남깁니다.</p>
          </div>

          <div className="admin-sidebar-tabs" role="tablist" aria-label="관리 메뉴">
            <button
              className={`admin-sidebar-tab ${tab === "posts" ? "admin-sidebar-tab-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={tab === "posts"}
              onClick={() => {
                if (tab === "settings" && settingsDirty && !window.confirm("저장하지 않은 소개 변경사항이 있어요. 이동하면 변경사항이 사라집니다. 계속할까요?")) return;
                setTab("posts");
              }}
            >
              <span>기록</span>
              <span className="admin-tab-count">{posts.length}</span>
            </button>
            <button
              className={`admin-sidebar-tab ${tab === "settings" ? "admin-sidebar-tab-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={tab === "settings"}
              onClick={() => {
                if (tab === "posts" && !confirmSwitchIfDirty()) return;
                setTab("settings");
              }}
            >
              <span>소개와 설정</span>
              <span aria-hidden="true">↗</span>
            </button>
          </div>

          {tab === "posts" ? (
            <>
              <div className="admin-sidebar-actions">
                <button className="button button-primary admin-new-button" type="button" onClick={startNewPost}>
                  <span aria-hidden="true">＋</span> 새 글 쓰기
                </button>
              </div>
              <div className="admin-filter-heading">
                <span>전체 기록</span>
                <span className="admin-count-label">{posts.length.toString().padStart(2, "0")}</span>
              </div>
              <label className="field admin-search-field">
                <span className="admin-sr-only">기록 검색</span>
                <span className="admin-search-icon" aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={query}
                  onChange={handleSearchChange}
                  placeholder="기록 검색"
                  aria-label="기록 검색"
                />
              </label>
              <div className="admin-status-filters" aria-label="기록 상태 필터">
                {(["all", "published", "draft"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={`admin-status-filter ${statusFilter === filter ? "admin-status-filter-active" : ""}`}
                    onClick={() => setStatusFilter(filter)}
                  >
                    {filter === "all" ? "전체" : filter === "published" ? "공개" : "초안"}
                  </button>
                ))}
              </div>
              <nav className="admin-post-list" aria-label="저장된 기록">
                {visiblePosts.map((post) => (
                  <button
                    className={`admin-post-row ${selectedId === post.id ? "admin-post-row-active" : ""}`}
                    type="button"
                    key={post.id}
                    onClick={() => selectPost(post)}
                  >
                    <span className={`admin-post-marker admin-post-marker-${post.cover}`} aria-hidden="true" />
                    <span className="admin-post-row-copy">
                      <span className="admin-post-row-title">{post.title || "제목 없는 글"}</span>
                      <span className="admin-post-row-meta">
                        {post.published ? "공개" : "초안"} · {displayDate(post.updatedAt || post.createdAt)}
                      </span>
                    </span>
                    {post.featured ? <span className="admin-featured-dot" aria-label="추천 글" /> : null}
                  </button>
                ))}
                {!visiblePosts.length && posts.length ? (
                  <p className="admin-list-empty">조건에 맞는 기록이 없어요.</p>
                ) : null}
                {!posts.length ? (
                  <div className="admin-empty-library">
                    <span className="admin-empty-number" aria-hidden="true">01</span>
                    <p>아직 저장된 글이 없습니다.</p>
                    <button className="button button-secondary" type="button" onClick={handleSeed} disabled={seeding}>
                      {seeding ? "준비 중…" : "샘플 기록 불러오기"}
                    </button>
                  </div>
                ) : null}
              </nav>
            </>
          ) : (
            <div className="admin-sidebar-note">
              <span className="admin-sidebar-note-mark" aria-hidden="true">◎</span>
              <p>사이트에 표시되는 이름과 소개를 정리해 두세요.</p>
            </div>
          )}

          <div className="admin-sidebar-foot">
            <span>PRIVATE EDITOR</span>
            <span>v1.0</span>
          </div>
        </aside>

        <section className="admin-workspace" aria-label={tab === "posts" ? "기록 편집" : "블로그 설정"}>
          {notice ? (
            <div className="admin-notice-wrap">
              <Notice tone={notice.tone}>{notice.text}</Notice>
            </div>
          ) : null}

          {tab === "settings" ? (
            <section className="admin-settings-view">
              <div className="admin-view-heading">
                <div>
                  <p className="admin-eyebrow">IDENTITY / PROFILE</p>
                  <h2>블로그의 표정을 정리해 보세요.</h2>
                  <p>홈과 글 목록에 표시되는 소개 문장을 관리합니다.</p>
                </div>
                <Link className="button button-quiet" href="/" target="_top">변경사항 확인</Link>
              </div>
              <form className="admin-settings-form" ref={settingsFormRef} onSubmit={handleSettingsSubmit}>
                <section className="admin-card admin-profile-card">
                  <div className="admin-card-label">01 / PROFILE</div>
                  <div className="admin-profile-preview">
                    <span className="admin-profile-avatar" aria-hidden="true">김</span>
                    <div>
                      <span className="admin-profile-preview-label">현재 이렇게 보여요</span>
                      <strong>{settings.author || "작성자 이름"}</strong>
                      <span>{settings.title || "블로그 이름"}</span>
                    </div>
                  </div>
                  <div className="admin-form-grid admin-form-grid-two">
                    <label className="field">
                      <span>블로그 이름 <b aria-hidden="true">*</b></span>
                      <input name="title" value={settings.title} onChange={handleSettingsChange} required />
                    </label>
                    <label className="field">
                      <span>작성자 이름 <b aria-hidden="true">*</b></span>
                      <input name="author" value={settings.author} onChange={handleSettingsChange} required />
                    </label>
                  </div>
                  <label className="field">
                    <span>한 줄 소개</span>
                    <input name="description" value={settings.description} onChange={handleSettingsChange} maxLength={120} />
                    <small>{settings.description.length}/120</small>
                  </label>
                  <label className="field">
                    <span>프로필 문장</span>
                    <textarea name="bio" value={settings.bio} onChange={handleSettingsChange} rows={5} maxLength={240} />
                    <small>{settings.bio.length}/240</small>
                  </label>
                  <div className="admin-form-actions">
                    <span className="admin-save-hint">{settingsDirty ? "저장하지 않은 변경사항이 있어요." : "모든 변경사항이 저장되었습니다."}</span>
                    <button className="button button-primary" type="submit" disabled={settingsSaving || !settingsDirty}>
                      {settingsSaving ? "저장 중…" : "소개 저장"}
                    </button>
                  </div>
                </section>
                <section className="admin-card admin-tools-card">
                  <div>
                    <div className="admin-card-label">02 / TOOLS</div>
                    <h3>기록 보관</h3>
                    <p>전체 글과 설정을 JSON 파일로 내려받아 안전하게 보관하거나, 새 글만 추가할 수 있습니다.</p>
                  </div>
                  <div className="admin-tools-actions">
                    <a className="button button-secondary" href="/api/backup" download="kimjiheon-blog-backup.json">
                      백업 다운로드 <span aria-hidden="true">↓</span>
                    </a>
                    <button className="button button-secondary" type="button" onClick={() => importFileRef.current?.click()} disabled={importing}>
                      {importing ? "가져오는 중…" : "백업 합치기"} <span aria-hidden="true">↑</span>
                    </button>
                    <input
                      ref={importFileRef}
                      className="admin-file-input"
                      type="file"
                      accept="application/json,.json"
                      onChange={handleImportBackup}
                      aria-label="JSON 백업 파일 선택"
                    />
                  </div>
                  <p className="admin-tools-note">글과 설정을 JSON으로 백업합니다. 사진 원본은 포함되지 않습니다. 복원 시 기존 글은 보존되고, 블로그 설정은 백업 값으로 변경됩니다.</p>
                </section>
              </form>
            </section>
          ) : (
            <>
              <div className="admin-editor-topline">
                <div>
                  <p className="admin-eyebrow">POST / {draft.id ? draft.slug || "untitled" : "new-entry"}</p>
                  <h2>{currentTitle}</h2>
                </div>
                <div className="admin-editor-top-actions">
                  <span className={`admin-post-status ${draft.published ? "admin-post-status-published" : "admin-post-status-draft"}`}>
                    <span aria-hidden="true" /> {statusLabel}
                  </span>
                  {draft.updatedAt ? <span className="admin-last-saved">마지막 저장 {displayDate(draft.updatedAt)}</span> : null}
                </div>
              </div>

              <form className="admin-editor-form" ref={editorFormRef} onSubmit={handleSubmit}>
                <div className="admin-editor-grid">
                  <div className="admin-editor-main-column">
                    <section className="admin-card admin-writing-card">
                      <div className="admin-card-header">
                        <div>
                          <div className="admin-card-label">01 / MANUSCRIPT</div>
                          <h3>문장을 꺼내 놓는 곳</h3>
                        </div>
                        <div className="admin-mode-switch" role="tablist" aria-label="본문 보기 방식">
                          <button type="button" role="tab" aria-selected={editorMode === "write"} className={editorMode === "write" ? "admin-mode-active" : ""} onClick={() => setEditorMode("write")}>쓰기</button>
                          <button type="button" role="tab" aria-selected={editorMode === "preview"} className={editorMode === "preview" ? "admin-mode-active" : ""} onClick={() => setEditorMode("preview")}>미리보기</button>
                        </div>
                      </div>
                      {editorMode === "write" ? (
                        <>
                          <label className={`field admin-title-field ${fieldErrors.title ? "admin-field-invalid" : ""}`}>
                            <span>제목 <b aria-hidden="true">*</b></span>
                            <input
                              value={draft.title}
                              onChange={(event) => updateDraft("title", event.target.value)}
                              placeholder="오늘 남기고 싶은 문장을 적어 주세요"
                              aria-invalid={Boolean(fieldErrors.title)}
                              aria-describedby={fieldErrors.title ? "post-title-error" : undefined}
                            />
                            <FieldError id="post-title-error">{fieldErrors.title}</FieldError>
                          </label>
                          <label className={`field admin-excerpt-field ${fieldErrors.excerpt ? "admin-field-invalid" : ""}`}>
                            <span>요약 <b aria-hidden="true">*</b></span>
                            <textarea
                              value={draft.excerpt}
                              onChange={(event) => updateDraft("excerpt", event.target.value)}
                              placeholder="글 목록에서 먼저 건네는 두세 문장"
                              rows={3}
                              aria-invalid={Boolean(fieldErrors.excerpt)}
                              aria-describedby={fieldErrors.excerpt ? "post-excerpt-error" : undefined}
                            />
                            <FieldError id="post-excerpt-error">{fieldErrors.excerpt}</FieldError>
                          </label>
                          <div className={`field admin-body-field ${fieldErrors.body ? "admin-field-invalid" : ""}`}>
                            <label htmlFor="post-body">본문 <b aria-hidden="true">*</b></label>
                            <div className="admin-body-toolbar">
                              <span className="admin-upload-note">사진은 8MB 이하의 PNG, JPEG, WebP, GIF</span>
                              <button className="button button-secondary admin-upload-button" type="button" onClick={() => imageFileRef.current?.click()} disabled={uploading}>
                                {uploading ? "사진 올리는 중…" : "사진 넣기"} <span aria-hidden="true">↗</span>
                              </button>
                              <input
                                ref={imageFileRef}
                                className="admin-file-input"
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                onChange={handleImageUpload}
                                aria-label="본문에 삽입할 사진 선택"
                              />
                            </div>
                            <textarea
                              id="post-body"
                              ref={bodyTextAreaRef}
                              value={draft.body}
                              onChange={(event) => updateDraft("body", event.target.value)}
                              placeholder={"마크다운으로 기록해 보세요.\n\n## 작은 제목\n\n생각을 한 줄씩 꺼내 놓습니다."}
                              rows={18}
                              aria-invalid={Boolean(fieldErrors.body)}
                              aria-describedby={fieldErrors.body ? "post-body-error" : "post-body-hint"}
                            />
                            <small id="post-body-hint">마크다운의 제목, 인용문, 목록, 코드 블록을 안전하게 미리 볼 수 있어요.</small>
                            <FieldError id="post-body-error">{fieldErrors.body}</FieldError>
                          </div>
                        </>
                      ) : (
                        <div className="admin-preview-panel">
                          <div className="admin-preview-meta">
                            <span>{draft.category}</span>
                            <span>{draft.title || "제목 없는 글"}</span>
                          </div>
                          <h3 className="admin-preview-title">{draft.title || "제목 없는 글"}</h3>
                          <p className="admin-preview-excerpt">{draft.excerpt || "요약이 아직 없습니다."}</p>
                          <MarkdownPreview body={draft.body} />
                        </div>
                      )}
                    </section>
                  </div>

                  <aside className="admin-editor-side-column">
                    <section className="admin-card admin-publish-card">
                      <div className="admin-card-label">02 / ADDRESS</div>
                      <label className={`field ${fieldErrors.slug ? "admin-field-invalid" : ""}`}>
                        <span>글 주소 <b aria-hidden="true">*</b></span>
                        <div className="admin-slug-input">
                          <span aria-hidden="true">/posts/</span>
                          <input
                            value={draft.slug}
                            onChange={(event) => updateDraft("slug", event.target.value.toLowerCase().replace(/\s+/g, "-"))}
                            placeholder="quiet-morning"
                            aria-invalid={Boolean(fieldErrors.slug)}
                            aria-describedby={fieldErrors.slug ? "post-slug-error" : undefined}
                          />
                        </div>
                        <FieldError id="post-slug-error">{fieldErrors.slug}</FieldError>
                      </label>
                      <label className="field">
                        <span>분류</span>
                        <select value={draft.category} onChange={(event) => updateDraft("category", event.target.value as Category)}>
                          {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                        </select>
                      </label>
                      <label className="field">
                        <span>태그 <small>(쉼표로 구분)</small></span>
                        <input
                          value={draft.tags.join(", ")}
                          onChange={(event) => updateDraft("tags", event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))}
                          placeholder="기록, 일상, 생각"
                        />
                      </label>
                      <label className="admin-check-row">
                        <input type="checkbox" checked={draft.featured} onChange={(event) => updateDraft("featured", event.target.checked)} />
                        <span>
                          <strong>추천 글로 표시</strong>
                          <small>홈 화면 첫 글로 보여줍니다.</small>
                        </span>
                      </label>
                      <div className="admin-card-actions">
                        <button className="button button-secondary" type="button" onClick={() => chooseSaveIntent("draft")} disabled={saving || deleting}>
                          {saving && savingIntent === "draft" ? "저장 중…" : "임시 저장"}
                        </button>
                        <button className="button button-primary" type="button" onClick={() => chooseSaveIntent("publish")} disabled={saving || deleting}>
                          {saving && savingIntent === "publish" ? "공개 중…" : "공개 저장"}
                        </button>
                      </div>
                      <button className="admin-delete-button" type="button" onClick={handleDelete} disabled={saving || deleting}>
                        {deleting ? "삭제 중…" : draft.id ? "이 글 삭제" : "새 글 취소"}
                      </button>
                    </section>

                    <section className="admin-card admin-cover-card">
                      <div className="admin-card-header admin-card-header-compact">
                        <div>
                          <div className="admin-card-label">03 / COVER</div>
                          <h3>표지의 분위기</h3>
                        </div>
                        <span className="admin-card-index">{COVERS.findIndex((cover) => cover.value === draft.cover) + 1} / 04</span>
                      </div>
                      <div className={`admin-cover-preview admin-cover-preview-${draft.cover}`} aria-hidden="true">
                        <span>{draft.category}</span>
                        <strong>{draft.title || "YOUR NOTE"}</strong>
                        <i />
                      </div>
                      <div className="admin-cover-options" role="radiogroup" aria-label="표지 선택">
                        {COVERS.map((cover) => (
                          <button
                            key={cover.value}
                            type="button"
                            role="radio"
                            aria-checked={draft.cover === cover.value}
                            className={`admin-cover-option admin-cover-option-${cover.value} ${draft.cover === cover.value ? "admin-cover-option-active" : ""}`}
                            onClick={() => updateDraft("cover", cover.value)}
                          >
                            <span className="admin-cover-swatch" aria-hidden="true" />
                            <span>{cover.label}</span>
                          </button>
                        ))}
                      </div>
                    </section>

                    <section className="admin-card admin-note-card">
                      <span className="admin-note-quote" aria-hidden="true">“</span>
                      <p>좋은 기록은 완성된 사람이 아니라, 다시 열어 본 사람이 남깁니다.</p>
                      <span className="admin-note-signature">— 김지헌의 기록실</span>
                    </section>
                  </aside>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}


