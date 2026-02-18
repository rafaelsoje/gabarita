"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SubjectColorPickerProps = {
  name: string;
  colors: string[];
  defaultColor?: string;
};

function isHexColor(value: string) {
  return /^#([0-9a-f]{6})$/i.test(value.trim());
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return { r, g, b };
}

function clampColorChannel(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex(r: number, g: number, b: number) {
  const rr = clampColorChannel(r).toString(16).padStart(2, "0");
  const gg = clampColorChannel(g).toString(16).padStart(2, "0");
  const bb = clampColorChannel(b).toString(16).padStart(2, "0");
  return `#${rr}${gg}${bb}`;
}

export function SubjectColorPicker({ name, colors, defaultColor }: SubjectColorPickerProps) {
  const initial = useMemo(() => {
    if (defaultColor && isHexColor(defaultColor)) return defaultColor.toLowerCase();
    return "";
  }, [defaultColor]);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(initial);
  const [rgb, setRgb] = useState(() => hexToRgb(isHexColor(initial) ? initial : "#2ea89b"));
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isHexColor(selected)) return;
    setRgb(hexToRgb(selected));
  }, [selected]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div className="subjectColorPicker" ref={rootRef}>
      <input type="hidden" name={name} value={selected} />

      <button type="button" className="subjectColorTrigger" onClick={() => setOpen((prev) => !prev)} aria-expanded={open}>
        <span className="subjectColorPreview" style={{ background: selected }} />
        <span>Selecionar cor...</span>
        <span className="subjectColorCaret">▾</span>
      </button>

      {open ? (
        <div className="subjectColorPopover">
          <div className="subjectColorGrid">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                className={`subjectColorSwatch ${selected === color ? "active" : ""}`}
                style={{ background: color }}
                onClick={() => setSelected(color)}
                aria-label={`Selecionar cor ${color}`}
              />
            ))}
          </div>

          <div className="subjectColorCustom">
            <span>Cor personalizada</span>
            <input
              type="color"
              value={isHexColor(selected) ? selected : "#2ea89b"}
              onChange={(event) => setSelected(event.target.value.toLowerCase())}
              aria-label="Cor personalizada"
            />
            <div className="subjectColorRgbGrid">
              <label>
                <input
                  className="input"
                  inputMode="numeric"
                  min={0}
                  max={255}
                  value={String(rgb.r)}
                  onChange={(event) => {
                    const next = clampColorChannel(Number(event.target.value.replace(/\D/g, "")));
                    const updated = { ...rgb, r: next };
                    setRgb(updated);
                    setSelected(rgbToHex(updated.r, updated.g, updated.b));
                  }}
                />
                <span>R</span>
              </label>
              <label>
                <input
                  className="input"
                  inputMode="numeric"
                  min={0}
                  max={255}
                  value={String(rgb.g)}
                  onChange={(event) => {
                    const next = clampColorChannel(Number(event.target.value.replace(/\D/g, "")));
                    const updated = { ...rgb, g: next };
                    setRgb(updated);
                    setSelected(rgbToHex(updated.r, updated.g, updated.b));
                  }}
                />
                <span>G</span>
              </label>
              <label>
                <input
                  className="input"
                  inputMode="numeric"
                  min={0}
                  max={255}
                  value={String(rgb.b)}
                  onChange={(event) => {
                    const next = clampColorChannel(Number(event.target.value.replace(/\D/g, "")));
                    const updated = { ...rgb, b: next };
                    setRgb(updated);
                    setSelected(rgbToHex(updated.r, updated.g, updated.b));
                  }}
                />
                <span>B</span>
              </label>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
