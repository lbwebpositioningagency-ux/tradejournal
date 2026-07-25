"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { changePasswordAction } from "@/server/auth-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * F39 — cambio password dalle Impostazioni. Un account solo-Google (senza
 * password) la imposta per la prima volta: niente campo "attuale".
 */
export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await changePasswordAction({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(hasPassword ? "Password aggiornata" : "Password impostata");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {hasPassword ? "Cambia password" : "Imposta una password"}
        </CardTitle>
        <CardDescription>
          {hasPassword
            ? "Serve la password attuale; minimo 8 caratteri per la nuova."
            : "Il tuo account usa Google: imposta una password per accedere anche con le credenziali."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        {hasPassword ? (
          <div className="grid gap-2">
            <Label htmlFor="pwd-current">Password attuale</Label>
            <Input
              id="pwd-current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="pwd-new">Nuova password</Label>
          <Input
            id="pwd-new"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pwd-confirm">Conferma nuova password</Label>
          <Input
            id="pwd-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          onClick={submit}
          disabled={
            pending ||
            newPassword === "" ||
            confirmPassword === "" ||
            (hasPassword && currentPassword === "")
          }
        >
          {pending ? "Salvataggio…" : hasPassword ? "Aggiorna password" : "Imposta password"}
        </Button>
      </CardFooter>
    </Card>
  );
}
