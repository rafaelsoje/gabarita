"use client";

type OpenStudyRegisterButtonProps = {
  subjectId?: string;
  subjectName?: string;
};

export function OpenStudyRegisterButton({ subjectId, subjectName }: OpenStudyRegisterButtonProps) {
  function openRegister() {
    window.dispatchEvent(
      new CustomEvent("study-timer:open-register", {
        detail: {
          ...(subjectId ? { subjectId } : {}),
          ...(subjectName ? { subjectName } : {})
        }
      })
    );
  }

  return (
    <button className="ghostButton" type="button" onClick={openRegister}>
      Registrar estudo
    </button>
  );
}
