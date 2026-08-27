import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { CalendarCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { resolveEmail, resolvePassword } from "@/lib/credentials";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Entrar — Painel de agendamentos" },
      {
        name: "description",
        content: "Acesse o painel para gerenciar serviços, profissionais, horários e agendamentos.",
      },
      { property: "og:title", content: "Entrar — Painel de agendamentos" },
      { property: "og:description", content: "Acesso do proprietário ao painel de agendamentos." },
    ],
  }),
  component: AuthPage,
});

const credentialsSchema = z.object({
  email: z.string().trim().min(3, "Informe usuário ou e-mail").max(200),
  password: z.string().min(4, "A senha deve ter ao menos 4 caracteres").max(72),
});


function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const target = search.redirect && search.redirect.startsWith("/") ? search.redirect : "/admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: target, replace: true });
    });
  }, [navigate, target]);

  async function signIn() {
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: resolveEmail(parsed.data.email),
      password: resolvePassword(parsed.data.password),
    });
    setLoading(false);
    if (error) {
      toast.error("Usuário ou senha inválidos");
      return;
    }
    navigate({ to: target, replace: true });
  }

  async function signUp() {
    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: resolveEmail(parsed.data.email),
      password: resolvePassword(parsed.data.password),
      options: { emailRedirectTo: `${window.location.origin}${target}` },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Conta criada! Você já pode configurar seu estabelecimento.");
    navigate({ to: target, replace: true });
  }


  async function signInWithGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Não foi possível entrar com o Google");
      return;
    }
    if (result.redirected) return;
    navigate({ to: target, replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center surface-hero p-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 font-bold">
          <CalendarCheck className="size-5 text-primary" />
          Agenda
        </Link>
        <Card className="shadow-soft">
          <CardContent className="p-6">
            <Tabs defaultValue="signin">
              <TabsList className="mb-4 grid w-full grid-cols-2">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="email">Usuário ou e-mail</Label>
                  <Input
                    id="email"
                    type="text"
                    autoComplete="username"
                    placeholder="Admin"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <TabsContent value="signin" className="m-0">
                  <Button className="w-full" disabled={loading} onClick={signIn}>
                    Entrar
                  </Button>
                </TabsContent>
                <TabsContent value="signup" className="m-0">
                  <Button className="w-full" disabled={loading} onClick={signUp}>
                    Criar conta
                  </Button>
                </TabsContent>
                <div className="relative py-1 text-center text-xs text-muted-foreground">
                  <span className="bg-card px-2">ou</span>
                </div>
                <Button variant="outline" className="w-full" onClick={signInWithGoogle}>
                  Continuar com Google
                </Button>
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
