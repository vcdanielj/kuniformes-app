import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const { session } = await getSessionUser();
  
  if (session) {
    redirect("/");
  }

  return <LoginForm />;
}
