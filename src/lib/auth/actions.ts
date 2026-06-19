"use server";

import { db } from "../db/index";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "./password";
import { createSession, setSessionCookie, deleteSessionCookie, getSessionUser, destroySession } from "./session";
import { revalidatePath } from "next/cache";

type LoginActionState = {
  error?: string;
  success?: boolean;
};

export async function loginAction(_prevState: LoginActionState | null, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Todos los campos son obligatorios" };
  }

  try {
    const userRecord = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (userRecord.length === 0) {
      return { error: "Credenciales incorrectas" };
    }

    const user = userRecord[0];
    if (!user.active) {
      return { error: "Usuario inactivo" };
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return { error: "Credenciales incorrectas" };
    }

    const session = await createSession(user.id);
    await setSessionCookie(session);

    return { success: true };
  } catch (error: unknown) {
    console.error("Login error:", error);
    return {
      error: error instanceof Error ? error.message : "Error al iniciar sesión",
    };
  }
}

export async function logoutAction() {
  const { session } = await getSessionUser();
  if (session) {
    await destroySession(session.id);
  }
  await deleteSessionCookie();
  revalidatePath("/");
}
