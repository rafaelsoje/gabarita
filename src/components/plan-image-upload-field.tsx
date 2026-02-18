"use client";

import NextImage from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type PlanImageUploadFieldProps = {
  inputId: string;
  name?: string;
  currentImageUrl?: string | null;
  buttonLabel?: string;
  helperText?: string;
  submitOnApply?: boolean;
};

export function PlanImageUploadField({
  inputId,
  name = "planImage",
  currentImageUrl = null,
  buttonLabel = "Escolher imagem",
  helperText = "JPG, PNG ou WEBP",
  submitOnApply = false
}: PlanImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hiddenUploadRef = useRef<HTMLInputElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  const activePreview = useMemo(() => previewUrl ?? currentImageUrl, [previewUrl, currentImageUrl]);

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [sourceUrl, previewUrl]);

  function openFilePicker() {
    inputRef.current?.click();
  }

  function handlePickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    setModalOpen(true);
  }

  async function applyCrop() {
    if (!sourceUrl || !hiddenUploadRef.current) return;

    const image = new window.Image();
    image.src = sourceUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Falha ao carregar imagem"));
    });

    const size = 640;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Preserve the whole image inside a square (no aggressive crop).
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    const baseScale = Math.min(size / image.width, size / image.height);
    const scaledWidth = image.width * baseScale * zoom;
    const scaledHeight = image.height * baseScale * zoom;
    const x = (size - scaledWidth) / 2 + offsetX;
    const y = (size - scaledHeight) / 2 + offsetY;

    ctx.drawImage(image, x, y, scaledWidth, scaledHeight);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return;

    const croppedFile = new File([blob], "plan-crop.jpg", { type: "image/jpeg" });
    const dt = new DataTransfer();
    dt.items.add(croppedFile);
    hiddenUploadRef.current.files = dt.files;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(blob));
    setModalOpen(false);

    if (submitOnApply) {
      hiddenUploadRef.current.form?.requestSubmit();
    }
  }

  return (
    <div className="planImageUpload">
      <div className="planImageUploadPreview">
        {activePreview ? <NextImage src={activePreview} alt="Preview do plano" fill unoptimized style={{ objectFit: "contain" }} /> : <span>IMG</span>}
      </div>
      <button className="planFileButton" type="button" onClick={openFilePicker}>
        {buttonLabel}
      </button>
      <p className="newPlanImageText">{helperText}</p>

      <input ref={inputRef} id={inputId} type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePickFile} className="srOnly" />
      <input ref={hiddenUploadRef} name={name} type="file" accept="image/png,image/jpeg,image/webp" className="srOnly" />

      {modalOpen && sourceUrl ? (
        <div className="avatarCropOverlay">
          <div className="avatarCropModal">
            <h3>Ajustar imagem do plano</h3>
            <div className="avatarCropFrame square">
              <NextImage
                src={sourceUrl}
                alt="Ajuste da imagem do plano"
                fill
                unoptimized
                style={{
                  objectFit: "contain",
                  transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`
                }}
              />
            </div>

            <div className="avatarCropControls">
              <label>
                Zoom
                <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
              </label>
              <label>
                Horizontal
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={offsetX}
                  onChange={(e) => setOffsetX(clamp(Number(e.target.value), -180, 180))}
                />
              </label>
              <label>
                Vertical
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={offsetY}
                  onChange={(e) => setOffsetY(clamp(Number(e.target.value), -180, 180))}
                />
              </label>
            </div>

            <div className="avatarCropActions">
              <button className="ghostButton" type="button" onClick={() => setModalOpen(false)}>
                Cancelar
              </button>
              <button className="button createPlanBtn" type="button" onClick={applyCrop}>
                Aplicar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
