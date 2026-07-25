"use server";

import { AuthError } from "next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { auth, signIn, signOut } from "@/lib/auth";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  type ChangePasswordInput,
} from "@/lib/validations/auth";
import { AUTH_LIMITS, rateLimit } from "@/lib/rate-limit";

export type AuthFormState = { error?: string } | undefined;

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    currency: formData.get("currency") || "USD",
    initialBalance: formData.get("initialBalance") || "0",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }

  const email = parsed.data.email.toLowerCase();

  // F39 — freno alle registrazioni martellate sulla stessa email.
  if (!rateLimit(`register:${email}`, AUTH_LIMITS.register).allowed) {
    return { error: "Troppi tentativi: riprova tra qualche minuto" };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Esiste già un account con questa email" };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash,
      tradingAccounts: {
        create: {
          name: "Conto principale",
          currency: parsed.data.currency,
          initialBalance: parsed.data.initialBalance,
        },
      },
    },
  });

  try {
    await signIn("credentials", {
      email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { error: "Registrazione riuscita ma login fallito: riprova dal form di login" };
  }
  return undefined;
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof AuthError) {
      return { error: "Email o password errati" };
    }
    throw error;
  }
  return undefined;
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

export type ChangePasswordState = { error?: string; success?: boolean };

/**
 * F39 — cambio password dalle Impostazioni. Verifica SEMPRE la password
 * attuale quando esiste; un account solo-Google (senza hash) la imposta per
 * la prima volta. Rate limited per utente.
 */
export async function changePasswordAction(
  input: ChangePasswordInput,
): Promise<ChangePasswordState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  if (!rateLimit(`chpwd:${userId}`, AUTH_LIMITS.changePassword).allowed) {
    return { error: "Troppi tentativi: riprova tra qualche minuto" };
  }

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi" };
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { passwordHash: true },
  });

  if (user.passwordHash) {
    if (parsed.data.currentPassword === "") {
      return { error: "Inserisci la password attuale" };
    }
    const valid = await bcrypt.compare(
      parsed.data.currentPassword,
      user.passwordHash,
    );
    if (!valid) return { error: "Password attuale errata" };
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  return { success: true };
}
