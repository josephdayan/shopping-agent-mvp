type LiaBrandProps = {
  variant?: "light" | "dark";
  showDescriptor?: boolean;
  size?: "sm" | "md" | "lg";
};

const sizeClasses = {
  sm: {
    symbol: "h-5 w-5",
    name: "text-lg",
    descriptor: "text-[10px]"
  },
  md: {
    symbol: "h-8 w-8",
    name: "text-2xl",
    descriptor: "text-[11px]"
  },
  lg: {
    symbol: "h-11 w-11",
    name: "text-4xl",
    descriptor: "text-xs"
  }
};

export function LiaSymbol({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <polyline
        points="38,25 38,72 71,72"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="16"
      />
      <path
        d="M74 16 Q74 30 88 30 Q74 30 74 44 Q74 30 60 30 Q74 30 74 16 Z"
        fill="currentColor"
      />
    </svg>
  );
}

// Mesma arte da foto de perfil do WhatsApp (public/brand/lia-whatsapp-profile.svg):
// círculo roxo #3A225E com o L+estrela em lima #D9FF5B (paleta "Berinjela & lima").
// O anel fino mantém o círculo legível sobre fundos claros.
export function LiaWhatsAppAvatar({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <circle cx="50" cy="50" r="49" fill="#3A225E" stroke="#D9FF5B" strokeOpacity="0.2" strokeWidth="2" />
      <g transform="translate(19.7 25) scale(0.556)">
        <polyline
          points="38,25 38,72 71,72"
          fill="none"
          stroke="#D9FF5B"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="16"
        />
        <path d="M74 16 Q74 30 88 30 Q74 30 74 44 Q74 30 60 30 Q74 30 74 16 Z" fill="#D9FF5B" />
      </g>
    </svg>
  );
}

export function LiaAppIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <rect width="100" height="100" rx="24" fill="#0F3D3A" />
      <polyline
        points="38,25 38,72 71,72"
        fill="none"
        stroke="#28FEE5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="16"
      />
      <path d="M74 16 Q74 30 88 30 Q74 30 74 44 Q74 30 60 30 Q74 30 74 16 Z" fill="#28FEE5" />
    </svg>
  );
}

export default function LiaBrand({ variant = "light", showDescriptor = false, size = "md" }: LiaBrandProps) {
  const classes = sizeClasses[size];
  const textColor = variant === "dark" ? "text-lia-lavender" : "text-lia-night";

  return (
    <div className="flex items-center gap-3">
      <LiaSymbol className={`${classes.symbol} text-lia-aqua`} />
      <div className="leading-none">
        <div className={`${classes.name} font-semibold tracking-tight ${textColor}`}>Lia</div>
        {showDescriptor && (
          <div className={`${classes.descriptor} mt-1 font-mono uppercase tracking-[0.16em] text-lia-muted`}>
            Assistente de compras
          </div>
        )}
      </div>
    </div>
  );
}
