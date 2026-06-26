type AtlasBrandProps = {
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

export function AtlasSymbol({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <ellipse cx="50" cy="50" rx="45" ry="18" transform="rotate(-20 50 50)" fill="none" stroke="currentColor" strokeWidth="6" />
      <circle cx="50" cy="50" r="15" fill="currentColor" />
    </svg>
  );
}

export default function AtlasBrand({ variant = "light", showDescriptor = false, size = "md" }: AtlasBrandProps) {
  const classes = sizeClasses[size];
  const textColor = variant === "dark" ? "text-atlas-lavender" : "text-atlas-night";

  return (
    <div className="flex items-center gap-3">
      <AtlasSymbol className={`${classes.symbol} text-atlas-violet`} />
      <div className="leading-none">
        <div className={`${classes.name} font-semibold tracking-tight ${textColor}`}>Atlas</div>
        {showDescriptor && (
          <div className={`${classes.descriptor} mt-1 font-mono uppercase tracking-[0.16em] text-atlas-muted`}>
            Concierge de compras
          </div>
        )}
      </div>
    </div>
  );
}
