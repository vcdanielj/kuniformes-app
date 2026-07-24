import { db } from "../db/index";
import { sessions, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "auth_session";

function isDynamicServerUsageError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    (error as { digest?: string }).digest === "DYNAMIC_SERVER_USAGE"
  );
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "vendedor" | "usuario";
  active: boolean;
}

// Generate random session ID using crypto
function generateSessionId(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Create a new session for a user
export async function createSession(userId: string): Promise<Session> {
  const sessionId = generateSessionId();
  // Session expires in 15 days
  const expiresAt = Date.now() + 15 * 24 * 60 * 60 * 1000;
  
  const newSession = {
    id: sessionId,
    userId,
    expiresAt,
  };
  
  await db.insert(sessions).values(newSession);
  return newSession;
}

// Validate a session ID
export async function validateSession(sessionId: string): Promise<{ session: Session | null; user: User | null }> {
  try {
    const result = await db
      .select({
        session: sessions,
        user: users,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .innerJoin(users, eq(sessions.userId, users.id))
      .limit(1);

    if (result.length === 0) {
      return { session: null, user: null };
    }

    const { session, user } = result[0];

    // Check expiration
    if (Date.now() >= session.expiresAt) {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
      return { session: null, user: null };
    }

    if (!user.active) {
      await db.delete(sessions).where(eq(sessions.userId, user.id));
      return { session: null, user: null };
    }

    // Extend session if it expires in less than 7 days
    if (session.expiresAt - Date.now() < 7 * 24 * 60 * 60 * 1000) {
      const newExpiresAt = Date.now() + 15 * 24 * 60 * 60 * 1000;
      await db
        .update(sessions)
        .set({ expiresAt: newExpiresAt })
        .where(eq(sessions.id, sessionId));
      session.expiresAt = newExpiresAt;
    }

    return {
      session: {
        id: session.id,
        userId: session.userId,
        expiresAt: session.expiresAt,
      },
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as "admin" | "vendedor" | "usuario",
        active: !!user.active,
      },
    };
  } catch (error) {
    console.error("Failed to validate session:", error);
    return { session: null, user: null };
  }
}

// Destroy a session
export async function destroySession(sessionId: string): Promise<void> {
  try {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  } catch (error) {
    console.error("Failed to destroy session:", error);
  }
}

// Get current session and user from cookies
export async function getSessionUser(): Promise<{ session: Session | null; user: User | null }> {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionId) {
      return { session: null, user: null };
    }
    return await validateSession(sessionId);
  } catch (error) {
    if (isDynamicServerUsageError(error)) {
      return { session: null, user: null };
    }
    console.error("Failed to get session user from cookies:", error);
    return { session: null, user: null };
  }
}

// Set session cookie
export async function setSessionCookie(session: Session): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(session.expiresAt),
  });
}

// Delete session cookie
export async function deleteSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
