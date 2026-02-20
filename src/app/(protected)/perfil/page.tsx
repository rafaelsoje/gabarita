import Image from "next/image";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/lib/auth/current-user";
import { comparePassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { AvatarUploadField } from "@/components/avatar-upload-field";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { deleteUploadByUrl, saveUploadBuffer } from "@/lib/storage/local-upload";
import { deletePlanWithFiles } from "@/lib/storage/study-cleanup";
import { isFormDataFileLike } from "@/lib/http/form-data-file";

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCOUNT_DELETE_PHRASE = "EXCLUIR MINHA CONTA";

export default async function ProfilePage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/entrar");

  let user:
    | {
        id: string;
        name: string | null;
        email: string;
        avatarUrl: string | null;
        phone: string | null;
        birthDate: Date | null;
        city: string | null;
        state: string | null;
        createdAt: Date;
      }
    | null = null;

  try {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        phone: true,
        birthDate: true,
        city: true,
        state: true,
        createdAt: true
      }
    });
  } catch {
    const basicUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true
      }
    });
    user = basicUser
      ? {
          ...basicUser,
          avatarUrl: null,
          phone: null,
          birthDate: null,
          city: null,
          state: null
        }
      : null;
  }

  if (!user) redirect("/entrar");

  async function updateProfile(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const nameRaw = formData.get("name");
    const phoneRaw = formData.get("phone");
    const birthDateRaw = formData.get("birthDate");
    const cityRaw = formData.get("city");
    const stateRaw = formData.get("state");
    const fileRaw = formData.get("avatar");
    const removeAvatarRaw = formData.get("removeAvatar");

    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
    const phone = typeof phoneRaw === "string" ? phoneRaw.trim() : "";
    const birthDateInput = typeof birthDateRaw === "string" ? birthDateRaw.trim() : "";
    const city = typeof cityRaw === "string" ? cityRaw.trim() : "";
    const state = typeof stateRaw === "string" ? stateRaw.trim() : "";
    const removeAvatar = removeAvatarRaw === "on";

    const data: {
      name?: string | null;
      avatarUrl?: string | null;
      phone?: string | null;
      birthDate?: Date | null;
      city?: string | null;
      state?: string | null;
    } = {};

    data.name = name ? name.slice(0, 120) : null;
    data.phone = phone ? phone.slice(0, 30) : null;
    data.city = city ? city.slice(0, 120) : null;
    data.state = state ? state.slice(0, 120) : null;
    data.birthDate = birthDateInput ? new Date(birthDateInput) : null;

    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { avatarUrl: true }
    });
    if (!currentUser) redirect("/entrar");

    let uploadedAvatarUrl: string | null = null;
    if (isFormDataFileLike(fileRaw) && fileRaw.size > 0) {
      if (ALLOWED_IMAGE_TYPES.has(fileRaw.type) && fileRaw.size <= MAX_IMAGE_SIZE) {
        const buffer = Buffer.from(await fileRaw.arrayBuffer());
        const extension = fileRaw.type === "image/png" ? "png" : fileRaw.type === "image/webp" ? "webp" : "jpg";
        const saved = await saveUploadBuffer({
          kind: "avatars",
          prefix: currentUserId,
          extension,
          buffer
        });
        uploadedAvatarUrl = saved.publicUrl;
        data.avatarUrl = uploadedAvatarUrl;
      }
    }

    if (!uploadedAvatarUrl && removeAvatar) {
      data.avatarUrl = null;
    }

    try {
      await prisma.user.update({ where: { id: currentUserId }, data });
    } catch {
      if (uploadedAvatarUrl) {
        await deleteUploadByUrl(uploadedAvatarUrl, "avatars");
      }
      // Fallback when optional profile columns are not migrated yet.
      await prisma.user.update({
        where: { id: currentUserId },
        data: {
          name: data.name,
          ...(data.avatarUrl ? { avatarUrl: data.avatarUrl } : {})
        }
      });
    }

    if (currentUser.avatarUrl && (uploadedAvatarUrl || (removeAvatar && !uploadedAvatarUrl))) {
      await deleteUploadByUrl(currentUser.avatarUrl, "avatars");
    }

    revalidatePath("/perfil");
    revalidatePath("/");
    redirect("/perfil?toast=item_updated");
  }

  async function deleteAccount(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    if (!currentUserId) redirect("/entrar");

    const confirmationRaw = formData.get("accountDeletePhrase");
    const passwordRaw = formData.get("accountPassword");
    const consentRaw = formData.get("accountDeleteConsent");

    const confirmation = typeof confirmationRaw === "string" ? confirmationRaw.trim().toUpperCase() : "";
    const password = typeof passwordRaw === "string" ? passwordRaw : "";
    const consent = consentRaw === "on";

    if (!consent || confirmation !== ACCOUNT_DELETE_PHRASE || !password) {
      redirect("/perfil?toast=account_delete_validation");
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { id: true, passwordHash: true, avatarUrl: true }
    });
    if (!currentUser) redirect("/entrar");

    const validPassword = await comparePassword(password, currentUser.passwordHash);
    if (!validPassword) {
      redirect("/perfil?toast=account_delete_wrong_password");
    }

    const plans = await prisma.plan.findMany({
      where: { userId: currentUserId },
      select: { id: true }
    });

    for (const plan of plans) {
      await deletePlanWithFiles({ userId: currentUserId, planId: plan.id });
    }

    await prisma.user.delete({ where: { id: currentUserId } });
    await deleteUploadByUrl(currentUser.avatarUrl, "avatars");

    const cookieStore = await cookies();
    const isProduction = process.env.NODE_ENV === "production";
    cookieStore.set("access_token", "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 0
    });
    cookieStore.set("refresh_token", "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 0
    });

    redirect("/entrar");
  }

  return (
    <main className="dashboard">
      <section className="dashboardCard dashboardHeader">
        <div>
          <h1 className="profilePageTitle">Perfil</h1>
          <p>Atualize seus dados pessoais</p>
        </div>
      </section>

      <section className="dashboardCard profileCard">
        <form className="profileFormGrid" action={updateProfile}>
          <div className="profileAvatarWrap">
            {user.avatarUrl ? (
              <Image className="profileAvatar" src={user.avatarUrl} alt="Foto de perfil" width={120} height={120} />
            ) : (
              <div className="profileAvatar profileAvatarPlaceholder">{(user.name ?? user.email).slice(0, 1).toUpperCase()}</div>
            )}
            <p className="profileEmail">{user.email}</p>
            <AvatarUploadField
              currentAvatarUrl={user.avatarUrl}
              showPreview={false}
              showLabel={false}
              showHint={false}
              className="profileAvatarUploader"
              submitOnApply
            />
            {user.avatarUrl ? (
              <label className="checkboxRow" htmlFor="removeAvatar">
                <input id="removeAvatar" type="checkbox" name="removeAvatar" />
                <span>Remover foto atual</span>
              </label>
            ) : null}
          </div>

          <div className="profileForm">
          <label className="fieldLabel" htmlFor="name">
            NOME
          </label>
          <input id="name" className="input" name="name" defaultValue={user.name ?? ""} placeholder="Seu nome" maxLength={120} />

          <label className="fieldLabel" htmlFor="phone">
            TELEFONE
          </label>
          <input id="phone" className="input" name="phone" defaultValue={user.phone ?? ""} placeholder="Seu telefone" maxLength={30} />

          <label className="fieldLabel" htmlFor="birthDate">
            DATA DE NASCIMENTO
          </label>
          <input
            id="birthDate"
            className="input"
            name="birthDate"
            type="date"
            defaultValue={user.birthDate ? new Date(user.birthDate).toISOString().slice(0, 10) : ""}
          />

          <div className="profileFieldsGrid">
            <div>
              <label className="fieldLabel" htmlFor="city">
                CIDADE
              </label>
              <input id="city" className="input" name="city" defaultValue={user.city ?? ""} placeholder="Sua cidade" maxLength={120} />
            </div>
            <div>
              <label className="fieldLabel" htmlFor="state">
                ESTADO
              </label>
              <input id="state" className="input" name="state" defaultValue={user.state ?? ""} placeholder="Seu estado" maxLength={120} />
            </div>
          </div>

          <p className="profileMeta">Conta criada em {new Date(user.createdAt).toLocaleDateString("pt-BR")}</p>

          <div className="profileActions">
            <button className="button createPlanBtn" type="submit">
              Salvar alterações
            </button>
          </div>
          </div>
        </form>
      </section>

      <section className="dashboardCard profileDangerZone">
        <h2>Zona de risco</h2>
        <p>
          Esta ação exclui permanentemente sua conta, planos, disciplinas, tópicos, histórico e
          anexos.
        </p>
        <form className="profileDangerForm" action={deleteAccount}>
          <label className="fieldLabel" htmlFor="accountDeletePhrase">
            DIGITE &quot;{ACCOUNT_DELETE_PHRASE}&quot;
          </label>
          <input
            id="accountDeletePhrase"
            className="input"
            name="accountDeletePhrase"
            placeholder={ACCOUNT_DELETE_PHRASE}
            autoComplete="off"
            required
          />

          <label className="fieldLabel" htmlFor="accountPassword">
            SENHA ATUAL
          </label>
          <input
            id="accountPassword"
            className="input"
            type="password"
            name="accountPassword"
            placeholder="Digite sua senha atual"
            autoComplete="current-password"
            required
          />

          <label className="checkboxRow" htmlFor="accountDeleteConsent">
            <input id="accountDeleteConsent" type="checkbox" name="accountDeleteConsent" />
            <span>Estou ciente de que esta ação é irreversível</span>
          </label>

          <div className="profileDangerActions">
            <ConfirmSubmitButton
              className="dangerBtn"
              label="Excluir conta permanentemente"
              confirmTitle="Excluir conta"
              confirmMessage="Essa ação é irreversível e removerá todos os seus dados. Deseja continuar?"
              confirmActionLabel="Excluir conta"
              ariaLabel="Excluir conta permanentemente"
            />
          </div>
        </form>
      </section>
    </main>
  );
}
