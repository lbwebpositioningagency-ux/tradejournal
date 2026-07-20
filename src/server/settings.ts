"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { profileSchema } from "@/lib/validations/settings";
import { dashboardLayoutSchema, type DashboardLayout } from "@/lib/dashboard";
import {
  ACCENT_COOKIE,
  ACCENTS,
  PNL_COOKIE,
  PNL_PALETTES,
  type Accent,
  type PnlPalette,
} from "@/lib/constants";

export type ProfileFormState = { error?: string; success?: boolean } | undefined;

export async function updateProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    timezone: formData.get("timezone"),
    baseCurrency: formData.get("baseCurrency"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: parsed.data,
  });

  revalidatePath("/settings");
  return { success: true };
}

/** Colore di accento dell'interfaccia (FASE 10): cookie → data-accent. */
export async function setAccentAction(
  accent: Accent,
): Promise<{ error?: string; success?: boolean }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (!(ACCENTS as readonly string[]).includes(accent)) {
    return { error: "Accento non valido" };
  }

  const store = await cookies();
  store.set(ACCENT_COOKIE, accent, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  return { success: true };
}

/** Coppia colori profit/loss (stesso pattern dell'accento). */
export async function setPnlPaletteAction(
  palette: PnlPalette,
): Promise<{ error?: string; success?: boolean }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (!(PNL_PALETTES as readonly string[]).includes(palette)) {
    return { error: "Palette non valida" };
  }

  const store = await cookies();
  store.set(PNL_COOKIE, palette, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  return { success: true };
}

export async function saveDashboardLayoutAction(
  layout: DashboardLayout,
): Promise<{ error?: string; success?: boolean }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const parsed = dashboardLayoutSchema.safeParse(layout);
  if (!parsed.success) return { error: "Layout non valido" };

  await prisma.user.update({
    where: { id: session.user.id },
    data: { dashboardLayout: parsed.data },
  });

  revalidatePath("/dashboard");
  return { success: true };
}
