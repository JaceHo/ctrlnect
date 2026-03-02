import { useState } from "react";
import { X } from "lucide-react";

interface ImageBlockProps {
  src: string;
}

export function ImageBlock({ src }: ImageBlockProps) {
  const [lightbox, setLightbox] = useState(false);

  return (
    <>
      <img
        src={src}
        alt="Content"
        onClick={() => setLightbox(true)}
        className="max-w-sm max-h-64 rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity"
      />

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
          onClick={() => setLightbox(false)}
        >
          <button className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-lg">
            <X size={24} />
          </button>
          <img
            src={src}
            alt="Content"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
    </>
  );
}
