import type { Metadata } from "next";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Registrati" };

export default function RegisterPage() {
  return <RegisterForm />;
}
