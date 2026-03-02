import type { ChatMessage, ContentBlock } from "@/hooks/use-chat";
import { cn } from "@/lib/utils";
import { TextBlock } from "./text-block";
import { ThinkingBlock } from "./thinking-block";
import { ToolUseBlock } from "./tool-use-block";
import { ToolResultBlock } from "./tool-result-block";
import { ImageBlock } from "./image-block";
import { User, Bot } from "lucide-react";

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming: boolean;
  childMessages?: ChatMessage[];
}

export function MessageBubble({
  message,
  isStreaming,
  childMessages = [],
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}
    >
      <div
        className={cn(
          "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5",
          isUser ? "bg-user-bubble" : "bg-bg-tertiary",
        )}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      <div
        className={cn(
          "flex-1 min-w-0 space-y-2",
          isUser ? "max-w-[80%]" : "",
        )}
      >
        {message.blocks.map((block, i) => (
          <BlockRenderer
            key={i}
            block={block}
            isStreaming={isStreaming && i === message.blocks.length - 1}
          />
        ))}

        {/* Subagent / child messages */}
        {childMessages.length > 0 && (
          <div className="ml-4 pl-3 border-l-2 border-border space-y-2">
            {childMessages.map((child) => (
              <MessageBubble
                key={child.id}
                message={child}
                isStreaming={false}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BlockRenderer({
  block,
  isStreaming,
}: {
  block: ContentBlock;
  isStreaming: boolean;
}) {
  switch (block.type) {
    case "text":
      return <TextBlock text={block.text} isStreaming={isStreaming} />;
    case "thinking":
      return <ThinkingBlock text={block.text} />;
    case "tool_use":
      return <ToolUseBlock name={block.name} input={block.input} />;
    case "tool_result":
      return (
        <ToolResultBlock content={block.content} isError={block.isError} />
      );
    case "image":
      return (
        <ImageBlock
          src={`data:${block.source.media_type};base64,${block.source.data}`}
        />
      );
  }
}
