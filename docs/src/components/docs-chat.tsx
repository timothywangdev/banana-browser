"use client";

import { useRef, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Streamdown } from "streamdown";
import Link from "next/link";

const STORAGE_KEY = "docs-chat-messages";
const transport = new DefaultChatTransport({ api: "/api/docs-chat" });

const TOOL_LABELS: Record<
  string,
  { label: string; pastLabel: string; argKey?: string }
> = {
  readFile: { label: "Reading", pastLabel: "Read", argKey: "path" },
  bash: { label: "Running", pastLabel: "Ran", argKey: "command" },
};

function isToolPart(part: { type: string }): part is {
  type: string;
  toolCallId: string;
  toolName?: string;
  state: string;
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
} {
  return part.type.startsWith("tool-") || part.type === "dynamic-tool";
}

function getToolName(part: { type: string; toolName?: string }): string {
  if (part.type === "dynamic-tool") return part.toolName ?? "tool";
  return part.type.replace(/^tool-/, "");
}

function ToolCallDisplay({
  part,
}: {
  part: {
    type: string;
    toolCallId: string;
    toolName?: string;
    state: string;
    input?: Record<string, unknown>;
    output?: unknown;
    errorText?: string;
  };
}) {
  const toolName = getToolName(part);
  const config = TOOL_LABELS[toolName] ?? {
    label: toolName,
    pastLabel: toolName,
  };
  const isDone = part.state === "output-available";
  const isError = part.state === "output-error";
  const isRunning = !isDone && !isError;
  const displayLabel = isRunning ? config.label : config.pastLabel;

  const args = (part.input ?? {}) as Record<string, unknown>;
  const argValue = config.argKey ? args[config.argKey] : undefined;
  const argPreview =
    argValue != null
      ? String(argValue)
          .replace(/^\/workspace\//, "/")
          .replace(/\.md$/, "")
          .replace(/\/index$/, "") || "/"
      : "";

  // Link to the docs page if it's a readFile path
  const docsLink =
    toolName === "readFile" && argPreview.startsWith("/") ? argPreview : null;

  const argEl = argPreview ? (
    docsLink ? (
      <Link href={docsLink} className="truncate underline underline-offset-2">
        {argPreview}
      </Link>
    ) : (
      <span className="truncate">{argPreview}</span>
    )
  ) : null;

  return (
    <div className="text-xs py-0.5 min-w-0">
      {isRunning ? (
        <span className="inline-flex items-center gap-1 font-mono text-muted-foreground animate-tool-shimmer min-w-0">
          <span className="shrink-0">{displayLabel}</span>
          {argEl}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 font-mono text-muted-foreground/60 min-w-0">
          <span className="shrink-0">{displayLabel}</span>
          {argEl}
          {isError && <span className="text-destructive">failed</span>}
        </span>
      )}
    </div>
  );
}

const SUGGESTIONS = [
  "What is agent-browser?",
  "How do I install it?",
  "What commands are available?",
  "How do snapshots work?",
  "How do I use CDP mode?",
];

export function DocsChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);

  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport,
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Restore messages from sessionStorage on mount
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [setMessages]);

  // Save completed messages to sessionStorage
  useEffect(() => {
    if (!restoredRef.current) return;
    if (isLoading) return;
    if (messages.length === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // ignore quota errors
    }
  }, [messages, isLoading]);

  // Auto-open when new messages arrive (but not on initial restore)
  const prevMessageCount = useRef<number | null>(null);
  const initializedRef = useRef(false);
  useEffect(() => {
    // Skip until after the first sessionStorage restore cycle
    if (!initializedRef.current) {
      // Wait one tick after mount to let restore settle
      const id = requestAnimationFrame(() => {
        prevMessageCount.current = messages.length;
        initializedRef.current = true;
      });
      return () => cancelAnimationFrame(id);
    }
    if (
      prevMessageCount.current !== null &&
      messages.length > prevMessageCount.current
    ) {
      setOpen(true);
    }
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  // Scroll to bottom when messages change or error occurs
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, error]);

  // Cmd+K to focus prompt, Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Close message area when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  const handleClear = () => {
    setMessages([]);
    sessionStorage.removeItem(STORAGE_KEY);
    setOpen(false);
    inputRef.current?.focus();
  };

  const hasVisibleContent = (
    parts: (typeof messages)[number]["parts"],
  ): boolean => {
    return parts.some(
      (p) => (p.type === "text" && p.text.length > 0) || isToolPart(p),
    );
  };

  // Auto-open when error occurs
  useEffect(() => {
    if (error) setOpen(true);
  }, [error]);

  const showMessages = open && (messages.length > 0 || !!error);
  const showSuggestions = focused && messages.length === 0 && !isLoading;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
      <div
        ref={containerRef}
        className={`mx-auto px-4 pb-4 *:pointer-events-auto transition-all duration-300 ${focused || showMessages ? "max-w-xl" : "max-w-56"}`}
      >
        <div
          className={`border rounded-lg overflow-hidden ${focused || showMessages ? "border-background" : "border-[var(--chat-bg)]"}`}
          style={{ backgroundColor: "var(--chat-bg)" }}
        >
          {/* Suggestions panel */}
          {showSuggestions && (
            <div>
              <div className="flex items-center px-4 py-2 border-b border-background shrink-0">
                <span className="text-xs font-medium text-muted-foreground">
                  agent-browser Docs
                </span>
              </div>
              <div className="flex flex-wrap gap-2 p-3">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setOpen(true);
                      sendMessage({ text: s });
                    }}
                    className="text-xs px-3 py-1.5 rounded-full border border-background bg-background font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Messages panel */}
          {showMessages && (
            <div className="max-h-[60vh] flex flex-col">
              <div className="flex items-center justify-between px-4 py-2 border-b border-background shrink-0">
                <span className="text-xs font-medium text-muted-foreground">
                  agent-browser Docs
                </span>
                <button
                  onClick={handleClear}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear conversation"
                >
                  Clear
                </button>
              </div>
              <div
                className="p-4 space-y-4 overflow-y-auto"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a")) {
                    setOpen(false);
                  }
                }}
              >
                {messages.map((message) => {
                  if (!hasVisibleContent(message.parts)) return null;
                  return (
                    <div key={message.id}>
                      {message.role === "user" ? (
                        <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                          {message.parts
                            .filter(
                              (p): p is Extract<typeof p, { type: "text" }> =>
                                p.type === "text",
                            )
                            .map((p) => p.text)
                            .join("")}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {message.parts.map((part, i) => {
                            if (part.type === "text" && part.text) {
                              return (
                                <div
                                  key={i}
                                  className="docs-chat-content text-sm text-foreground/90 leading-relaxed prose prose-sm dark:prose-invert max-w-none"
                                >
                                  <Streamdown>{part.text}</Streamdown>
                                </div>
                              );
                            }
                            if (isToolPart(part)) {
                              return (
                                <ToolCallDisplay
                                  key={part.toolCallId}
                                  part={part}
                                />
                              );
                            }
                            return null;
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {error && (
                  <div className="text-sm text-destructive/80 bg-destructive/10 rounded-md px-3 py-2">
                    {(() => {
                      try {
                        const parsed = JSON.parse(error.message);
                        return parsed.message || parsed.error || error.message;
                      } catch {
                        return (
                          error.message ||
                          "Something went wrong. Please try again."
                        );
                      }
                    })()}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

          {/* Input bar */}
          <form
            onSubmit={handleSubmit}
            onClick={() => inputRef.current?.focus()}
            className={`relative flex items-end gap-2 px-3 py-2 cursor-text${showMessages ? " border-t border-background" : ""}`}
          >
            {!input && (
              <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
                <span className="text-sm text-muted-foreground truncate flex-1">
                  Ask a question...
                </span>
                {!focused && !showMessages && (
                  <span className="text-muted-foreground/40 font-mono text-xs shrink-0">
                    &#8984;K
                  </span>
                )}
              </div>
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              rows={1}
              onFocus={() => {
                setFocused(true);
                if (messages.length > 0) setOpen(true);
              }}
              onBlur={() => {
                setFocused(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setOpen(false);
                  inputRef.current?.blur();
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              className="flex-1 bg-transparent text-base sm:text-sm text-foreground outline-none disabled:opacity-50 resize-none max-h-32 leading-relaxed relative z-10"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className={`bg-primary text-primary-foreground rounded-md p-1 hover:bg-primary/90 transition-colors disabled:opacity-30${!focused && !showMessages ? " hidden" : ""}`}
              aria-label="Send message"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
