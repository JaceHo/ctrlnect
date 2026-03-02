import type { ChatMessage, ContentBlock } from "@/hooks/use-chat";
import { TextBlock } from "./text-block";
import { ThinkingBlock } from "./thinking-block";
import { ToolUseBlock } from "./tool-use-block";
import { ToolResultBlock } from "./tool-result-block";
import { ImageBlock } from "./image-block";
import { Bot } from "lucide-react";

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

  if (isUser) {
    // User messages: plain text, right-aligned, no bubble/icon
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] text-text-secondary text-right whitespace-pre-wrap">
          {message.blocks.map((block, i) =>
            block.type === "text" ? (
              <span key={i}>{block.text}</span>
            ) : block.type === "image" ? (
              <ImageBlock
                key={i}
                src={`data:${block.source.media_type};base64,${block.source.data}`}
              />
            ) : null,
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 flex-row">
      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 bg-bg-tertiary">
        <Bot size={14} />
      </div>

      <div className="flex-1 min-w-0 space-y-2">
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
