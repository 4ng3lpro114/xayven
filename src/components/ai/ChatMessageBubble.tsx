import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";

export interface UIMessage {
  role: "user" | "assistant";
  content: string;
}

export function ChatMessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex items-end gap-2", isUser && "flex-row-reverse")}>
      {!isUser && (
        <span className="mb-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border-strong bg-bg-elevated">
          <Logo markOnly className="scale-75" />
        </span>
      )}
      <div
        className={cn(
          "max-w-[80%] whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-br-sm bg-accent-500 text-white"
            : "rounded-bl-sm border border-border bg-bg-elevated text-fg"
        )}
      >
        {message.content}
      </div>
    </div>
  );
}

export function ChatThinkingBubble() {
  return (
    <div className="flex items-end gap-2">
      <span className="mb-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border-strong bg-bg-elevated">
        <Logo markOnly className="scale-75" />
      </span>
      <div className="flex items-center gap-1 rounded-lg rounded-bl-sm border border-border bg-bg-elevated px-3.5 py-3">
        <span className="size-1.5 animate-bounce rounded-full bg-fg-subtle [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-fg-subtle [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-fg-subtle" />
      </div>
    </div>
  );
}
