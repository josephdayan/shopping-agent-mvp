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
      <path
        d="M36 18 L36 54 Q36 74 56 74 L74 74"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="13"
      />
      <circle cx="70" cy="27" r="9" fill="currentColor" />
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
