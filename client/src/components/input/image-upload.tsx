import type { ImageData } from "@webclaude/shared";

export function processImageFile(
  file: File,
  callback: (img: ImageData) => void,
) {
  if (!file.type.startsWith("image/")) return;

  const reader = new FileReader();
  reader.onload = () => {
    const base64 = (reader.result as string).split(",")[1];
    callback({
      base64,
      mediaType: file.type as ImageData["mediaType"],
    });
  };
  reader.readAsDataURL(file);
}
