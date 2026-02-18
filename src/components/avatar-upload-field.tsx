"use client";

import NextImage from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

type ShapeMode = "square" | "round";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function AvatarUploadField({
  currentAvatarUrl,
  showPreview = true,
  showLabel = true,
  showHint = true,
  className,
  submitOnApply = false
}: {
  currentAvatarUrl: string | null;
  showPreview?: boolean;
  showLabel?: boolean;
  showHint?: boolean;
  className?: string;
  submitOnApply?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hiddenUploadRef = useRef<HTMLInputElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [shape, setShape] = useState<ShapeMode>("round");

  const activePreview = useMemo(() => previewUrl ?? currentAvatarUrl, [previewUrl, currentAvatarUrl]);

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
    if (!file) return;

    if (!file.type.startsWith("image/")) return;

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

    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (shape === "round") {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
    }

    const baseScale = Math.max(size / image.width, size / image.height);
    const scaledWidth = image.width * baseScale * zoom;
    const scaledHeight = image.height * baseScale * zoom;

    const x = (size - scaledWidth) / 2 + offsetX;
    const y = (size - scaledHeight) / 2 + offsetY;

    ctx.drawImage(image, x, y, scaledWidth, scaledHeight);

    const mime = shape === "round" ? "image/png" : "image/jpeg";
    const ext = shape === "round" ? "png" : "jpg";

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.92));
    if (!blob) return;

    const croppedFile = new File([blob], `avatar-crop.${ext}`, { type: mime });
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
    <div className={`avatarField${className ? ` ${className}` : ""}`}>
      {showLabel ? <label className="fieldLabel">FOTO DE PERFIL</label> : null}

      <div className="avatarUploadRow">
        {showPreview ? (
          <div className={`avatarUploadPreview ${shape === "round" ? "round" : "square"}`}>
            {activePreview ? <NextImage src={activePreview} alt="Preview da foto" fill unoptimized /> : <span>Sem foto</span>}
          </div>
        ) : null}
        <div className={`avatarUploadActions${showPreview ? "" : " solo"}`}>
          <button className="button createPlanBtn" type="button" onClick={openFilePicker}>
            Carregar foto
          </button>
          {showHint ? <p className="avatarUploadHint">Formatos: JPG, PNG, WEBP até 2MB</p> : null}
        </div>
      </div>

      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePickFile} className="srOnly" />
      <input ref={hiddenUploadRef} name="avatar" type="file" accept="image/png,image/jpeg,image/webp" className="srOnly" />

      {modalOpen && sourceUrl ? (
        <div className="avatarCropOverlay">
          <div className="avatarCropModal">
            <h3>Ajustar foto</h3>
            <div className={`avatarCropFrame ${shape === "round" ? "round" : "square"}`}>
              <NextImage
                src={sourceUrl}
                alt="Ajuste de foto"
                fill
                unoptimized
                style={{
                  transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`
                }}
              />
            </div>

            <div className="avatarCropControls">
              <div className="avatarCropShapeSwitch">
                <button type="button" className={shape === "round" ? "active" : ""} onClick={() => setShape("round")}>Redondo</button>
                <button type="button" className={shape === "square" ? "active" : ""} onClick={() => setShape("square")}>Quadrado</button>
              </div>

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
