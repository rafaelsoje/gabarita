import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #1e3a40 0%, #142c31 100%)",
          color: "#f2fbf9",
          padding: "64px 72px",
          boxSizing: "border-box",
          alignItems: "center",
          gap: 40
        }}
      >
        <div
          style={{
            width: 220,
            height: 260,
            borderRadius: 44,
            background: "linear-gradient(145deg, #5ff0d8 0%, #1c9c8e 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 132,
            fontWeight: 800,
            color: "#f7fffd"
          }}
        >
          G
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 116, fontWeight: 800, letterSpacing: -2 }}>gabarita</div>
          <div style={{ fontSize: 40, color: "#a6cbc5", fontWeight: 600 }}>Planeje. Estude. Gabarite.</div>
          <div style={{ fontSize: 28, color: "#88aaa5" }}>Sistema de gestao de estudos</div>
        </div>
      </div>
    ),
    size
  );
}
