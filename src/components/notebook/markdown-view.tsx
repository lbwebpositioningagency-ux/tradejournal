import { Fragment } from "react";
import { parseMarkdown, type Inline } from "@/lib/notebook/markdown";

function renderInline(nodes: Inline[]): React.ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "text":
        return <Fragment key={i}>{node.text}</Fragment>;
      case "strong":
        return <strong key={i} className="font-semibold">{renderInline(node.children)}</strong>;
      case "em":
        return <em key={i}>{renderInline(node.children)}</em>;
      case "link": {
        const external = !node.href.startsWith("/");
        return (
          <a
            key={i}
            href={node.href}
            className="font-medium text-primary underline underline-offset-2 hover:text-foreground"
            {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
          >
            {renderInline(node.children)}
          </a>
        );
      }
      case "image":
        return (
          /* eslint-disable-next-line @next/next/no-img-element -- byte serviti dalla route interna, dimensioni note solo a runtime */
          <img
            key={i}
            src={node.src}
            alt={node.alt}
            loading="lazy"
            className="my-2 block h-auto max-w-full rounded-md border"
          />
        );
    }
  });
}

/**
 * Anteprima del testo di una nota: l'albero di `parseMarkdown` reso in React.
 * Nessun HTML dell'utente viene iniettato.
 */
export function MarkdownView({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground">
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          const Tag = block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4";
          const size =
            block.level === 1 ? "text-xl" : block.level === 2 ? "text-lg" : "text-base";
          return (
            <Tag key={i} className={`${size} mt-1 font-semibold tracking-tight`}>
              {renderInline(block.children)}
            </Tag>
          );
        }
        if (block.type === "list") {
          const items = block.items.map((item, k) => <li key={k}>{renderInline(item)}</li>);
          return block.ordered ? (
            <ol key={i} start={block.start} className="list-decimal space-y-1 pl-5">
              {items}
            </ol>
          ) : (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {items}
            </ul>
          );
        }
        return (
          <p key={i}>
            {block.lines.map((line, k) => (
              <Fragment key={k}>
                {k > 0 ? <br /> : null}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
