import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { CalendarCheck, Eye, EyeOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
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
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user;
      if (!user) return;
      // Sessão de um cadastro anterior que não chegou a criar o estabelecimento
      // (ex.: OAuth concluído em segundo plano, usuário voltou antes de terminar):
      // não pula direto pro onboarding, volta ao início do ciclo de login.
      const { data: establishment } = await supabase
        .from("establishments")
        .select("id")
        .eq("owner_id", user.id)
        .limit(1)
        .maybeSingle();
      if (establishment) {
        navigate({ to: target, replace: true });
      } else {
        await supabase.auth.signOut();
      }
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
    const { data, error } = await supabase.auth.signUp({
      email: resolveEmail(parsed.data.email),
      password: resolvePassword(parsed.data.password),
      options: { emailRedirectTo: `${window.location.origin}${target}` },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      toast.success("Conta criada! Confirme seu e-mail para poder entrar.");
      return;
    }
    toast.success("Conta criada! Você já pode configurar seu estabelecimento.");
    navigate({ to: target, replace: true });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (tab === "signin") signIn();
    else signUp();
  }

  async function signInWithOAuth(provider: "google" | "facebook") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}${target}` },
    });
    if (error) {
      toast.error(
        `Não foi possível entrar com ${provider === "google" ? "o Google" : "o Facebook"}`,
      );
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center surface-hero p-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 font-bold">
          <CalendarCheck className="size-5 text-primary" />
          Zaka
        </Link>
        <Card className="shadow-soft">
          <CardContent className="p-6">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
              <TabsList className="mb-4 grid w-full grid-cols-2">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>
              <form onSubmit={handleSubmit} className="grid gap-3">
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
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      className="pr-9"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                <TabsContent value="signin" className="m-0">
                  <Button type="submit" className="w-full" disabled={loading}>
                    Entrar
                  </Button>
                </TabsContent>

                <TabsContent value="signup" className="m-0">
                  <Button type="submit" className="w-full" disabled={loading}>
                    Criar conta
                  </Button>
                </TabsContent>
              </form>
              <div className="mt-3 grid gap-3">
                <div className="relative py-1 text-center text-xs text-muted-foreground">
                  <span className="bg-card px-2">ou</span>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => signInWithOAuth("google")}
                >
                  Continuar com Google
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => signInWithOAuth("facebook")}
                >
                  Continuar com Facebook
                </Button>
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
