import * as React from "react";

import { formatPrice } from "@/lib/booking";
import { Input } from "@/components/ui/input";

type CurrencyInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type"
> & {
  /** Valor em centavos — sempre a fonte de verdade, nunca o texto exibido. */
  valueCents: number;
  onValueChange: (cents: number) => void;
};

/**
 * Campo de dinheiro com máscara de moeda: exibe sempre formatado (ex.: "R$
 * 49,90") e interpreta cada dígito digitado como centavo, igual app de
 * banco — sem depender do usuário digitar ponto ou vírgula certinho.
 */
const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ valueCents, onValueChange, ...props }, ref) => {
    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="decimal"
        value={formatPrice(valueCents)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onValueChange(digits ? parseInt(digits, 10) : 0);
        }}
      />
    );
  },
);
CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };
