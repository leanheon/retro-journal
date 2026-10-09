import type { ReactNode } from "react";

function safeHref(raw: string): string | null {
  const value = raw.trim();
  if (value.startsWith("/") || value.startsWith("#")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const MEDIA_PATH_PATTERN =
  /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp|gif)$/iu;

function safeImageSrc(raw: string): string | null {
  const value = raw.trim();
  if (MEDIA_PATH_PATTERN.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function inlineMarkdown(value: string, keyPrefix: string): ReactNode[] {
  const pattern = /(!\[[^\]]{1,240}\]\([^\s)]+\)|\[[^\]]{1,240}\]\([^\s)]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/gu;
  const parts: ReactNode[] = [];
  let cursor = 0;
  let index = 0;

  for (const match of value.matchAll(pattern)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > cursor) parts.push(value.slice(cursor, start));

    if (token.startsWith("![") && token.endsWith(")")) {
      const closing = token.lastIndexOf("](");
      const alt = token.slice(2, closing);
      const src = safeImageSrc(token.slice(closing + 2, -1));
      parts.push(
        src ? (
          <img
            key={`${keyPrefix}-${index}`}
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : (
          token
        ),
      );
    } else if (token.startsWith("[") && token.endsWith(")")) {
      const closing = token.lastIndexOf("](");
      const label = token.slice(1, closing);
      const href = safeHref(token.slice(closing + 2, -1));
      parts.push(
        href ? (
          <a
            key={`${keyPrefix}-${index}`}
            href={href}
            rel={href.startsWith("http") ? "noreferrer" : undefined}
            target={href.startsWith("http") ? "_blank" : undefined}
          >
            {inlineMarkdown(label, `${keyPrefix}-${index}-label`)}
          </a>
        ) : (
          token
        ),
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      parts.push(
        <strong key={`${keyPrefix}-${index}`}>
          {inlineMarkdown(token.slice(2, -2), `${keyPrefix}-${index}`)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      parts.push(<code key={`${keyPrefix}-${index}`}>{token.slice(1, -1)}</code>);
    } else {
      parts.push(
        <em key={`${keyPrefix}-${index}`}>
          {inlineMarkdown(token.slice(1, -1), `${keyPrefix}-${index}`)}
        </em>,
      );
    }
    cursor = start + token.length;
    index += 1;
  }

  if (cursor < value.length) parts.push(value.slice(cursor));
  return parts;
}

function renderParagraph(lines: string[], key: string): ReactNode {
  return (
    <p key={key}>
      {lines.flatMap((line, index) => [
        ...(index ? [<br key={`${key}-br-${index}`} />] : []),
        ...inlineMarkdown(line, `${key}-${index}`),
      ])}
    </p>
  );
}

/**
 * Render the intentionally small Markdown subset accepted by the editor.
 * Every text fragment remains a React child, which keeps user content escaped
 * without a dangerouslySetInnerHTML escape hatch.
 */
export function renderMarkdown(source: string): ReactNode {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(renderParagraph(paragraph, `paragraph-${blocks.length}`));
      paragraph = [];
    }
  };
  const flushList = () => {
    if (!list) return;
    const List = list.ordered ? "ol" : "ul";
    blocks.push(
      <List key={`list-${blocks.length}`}>
        {list.items.map((item, itemIndex) => (
          <li key={`list-item-${itemIndex}`}>
            {inlineMarkdown(item, `list-${blocks.length}-${itemIndex}`)}
          </li>
        ))}
      </List>,
    );
    list = null;
  };

  while (index < lines.length) {
    const line = lines[index];
    if (code) {
      if (/^```/u.test(line.trim())) {
        blocks.push(
          <pre key={`code-${blocks.length}`}>
            <code>{code.join("\n")}</code>
          </pre>,
        );
        code = null;
      } else {
        code.push(line);
      }
      index += 1;
      continue;
    }

    if (/^```/u.test(line.trim())) {
      flushParagraph();
      flushList();
      code = [];
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/u.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const Heading = `h${heading[1].length}` as "h1" | "h2" | "h3";
      blocks.push(
        <Heading key={`heading-${blocks.length}`}>
          {inlineMarkdown(heading[2], `heading-${blocks.length}`)}
        </Heading>,
      );
      index += 1;
      continue;
    }

    const unordered = /^[-*]\s+(.+)$/u.exec(line);
    const ordered = /^\d+[.)]\s+(.+)$/u.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push((unordered ?? ordered)?.[1] ?? "");
      index += 1;
      continue;
    }

    if (line.startsWith(">")) {
      flushParagraph();
      flushList();
      blocks.push(
        <blockquote key={`quote-${blocks.length}`}>
          {inlineMarkdown(line.replace(/^>\s?/u, ""), `quote-${blocks.length}`)}
        </blockquote>,
      );
      index += 1;
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      if (list) flushList();
      paragraph.push(line);
    }
    index += 1;
  }

  if (code) {
    blocks.push(
      <pre key={`code-${blocks.length}`}>
        <code>{code.join("\n")}</code>
      </pre>,
    );
  }
  flushParagraph();
  flushList();
  return blocks;
}
