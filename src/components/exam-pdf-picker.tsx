"use client";

import { useId, useState } from "react";

type ExamPdfPickerProps = {
  name: string;
  accept?: string;
};

export function ExamPdfPicker({ name, accept = "application/pdf,.pdf" }: ExamPdfPickerProps) {
  const inputId = useId();
  const [fileName, setFileName] = useState("Nenhum arquivo selecionado");

  return (
    <div className="discursiveFilePicker">
      <label className="discursiveFileBtn" htmlFor={inputId}>
        Escolher arquivo
      </label>
      <input
        id={inputId}
        name={name}
        className="discursiveFileInput"
        type="file"
        accept={accept}
        onChange={(event) => {
          const nextFile = event.target.files?.[0];
          setFileName(nextFile?.name || "Nenhum arquivo selecionado");
        }}
      />
      <span className="discursiveFileName">{fileName}</span>
    </div>
  );
}
