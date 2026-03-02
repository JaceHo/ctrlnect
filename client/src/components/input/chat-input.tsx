import { useState, useRef, useEffect } from "react";
import { Send, Square, ImagePlus } from "lucide-react";
import type { ImageData } from "@webclaude/shared";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (text: string, images?: ImageData[]) => void;
  onInterrupt: () => void;
  streaming: boolean;
  disabled: boolean;
}

export function ChatInput({
  onSend,
  onInterrupt,
  streaming,
  disabled,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<ImageData[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [text]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim(), images.length > 0 ? images : undefined);
    setText("");
    setImages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (streaming) return;
      handleSubmit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          setImages((prev) => [
            ...prev,
            {
              base64,
              mediaType: file.type as ImageData["mediaType"],
            },
          ]);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    for (const file of e.dataTransfer.files) {
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        setImages((prev) => [
          ...prev,
          { base64, mediaType: file.type as ImageData["mediaType"] },
        ]);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="border-t border-border bg-bg-secondary px-4 py-3">
      <div className="max-w-4xl mx-auto">
        {/* Image previews */}
        {images.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {images.map((img, i) => (
              <div key={i} className="relative group">
                <img
                  src={`data:${img.mediaType};base64,${img.base64}`}
                  alt="Upload"
                  className="h-16 w-16 object-cover rounded-lg border border-border"
                />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          className="flex items-end gap-2 rounded-xl bg-bg-tertiary border border-border px-3 py-2"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <label className="cursor-pointer p-1 text-text-muted hover:text-text-secondary">
            <ImagePlus size={18} />
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                for (const file of e.target.files || []) {
                  const reader = new FileReader();
                  reader.onload = () => {
                    const base64 = (reader.result as string).split(",")[1];
                    setImages((prev) => [
                      ...prev,
                      { base64, mediaType: file.type as ImageData["mediaType"] },
                    ]);
                  };
                  reader.readAsDataURL(file);
                }
                e.target.value = "";
              }}
            />
          </label>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Send a message..."
            rows={1}
            className="flex-1 bg-transparent resize-none text-sm focus:outline-none placeholder:text-text-muted min-h-[24px] max-h-[200px] py-0.5"
            disabled={disabled}
          />

          {streaming ? (
            <button
              onClick={onInterrupt}
              className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!text.trim() || disabled}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                text.trim() && !disabled
                  ? "bg-accent text-bg-primary hover:bg-accent-hover"
                  : "text-text-muted",
              )}
            >
              <Send size={16} />
            </button>
          )}
        </div>

        <div className="text-xs text-text-muted mt-1.5 text-center">
          Enter to send, Shift+Enter for newline
        </div>
      </div>
    </div>
  );
}
