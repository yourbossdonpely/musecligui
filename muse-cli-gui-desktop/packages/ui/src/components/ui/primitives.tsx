import { clsx, type ClassValue } from "clsx";
import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The platform's command modifier, spelled out in ASCII. */
export const MOD = isMac ? "Cmd" : "Ctrl";

/** New thread: Cmd+N in the desktop app; a browser keeps Cmd+N for a new window, so there it is Cmd+Shift+O. */
export const NEW_THREAD_KEYS: string[] =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window ? [MOD, "N"] : [MOD, "Shift", "O"];

export function Kbd(props: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-line bg-raised px-1 font-sans text-2xs font-medium text-muted",
        props.className,
      )}
    >
      {props.children}
    </kbd>
  );
}

export function Shortcut(props: { keys: string[]; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", props.className)} aria-hidden="true">
      {props.keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </span>
  );
}

export function Spinner(props: { size?: number; className?: string; label?: string }) {
  const size = props.size ?? 14;
  return (
    // An image, not a live region: a labelled spinner in every running row would have VoiceOver
    // announcing "Running" each time a tool starts.
    <span
      role={props.label ? "img" : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : true}
      className={cn("spin-ring shrink-0", props.className)}
      style={{ width: size, height: size }}
    />
  );
}

export function Shimmer(props: { children: ReactNode; className?: string }) {
  return <span className={cn("shimmer", props.className)}>{props.children}</span>;
}

type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-inverse text-inverse-fg hover:opacity-90",
  accent: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "bg-raised text-fg shadow-btn hover:bg-hover",
  ghost: "text-muted hover:bg-hover hover:text-fg",
  danger: "text-danger-text shadow-[0_0_0_1px_var(--border-strong)] hover:bg-danger-soft",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 rounded-md px-2.5 text-sm",
  md: "h-8 gap-2 rounded-lg px-3 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, className, children, disabled, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-[background-color,color,opacity,transform] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={12} /> : null}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: "xs" | "sm" | "md";
  active?: boolean;
}

const ICON_SIZES = { xs: "size-6 rounded-md", sm: "size-7 rounded-md", md: "size-8 rounded-lg" } as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "sm", active = false, className, children, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-muted transition-[background-color,color,transform] duration-150 ease-out hover:bg-hover hover:text-fg active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40",
        active && "bg-active text-fg",
        ICON_SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

/** The MuseCodeIcon mark, drawn to match the app icon and favicon: the arch on a navy tile. */
export function Logo(props: { size?: number; className?: string }) {
  const size = props.size ?? 22;
  // One gradient per instance: two logos on a page would otherwise share ids.
  const gold = `logo-gold-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={props.className} aria-hidden="true">
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FCECBE" />
          <stop offset="0.42" stopColor="#E2B04E" />
          <stop offset="1" stopColor="#A67426" />
        </linearGradient>
      </defs>
      {/* The app icon in miniature: gold M and spark on a black tile. */}
      <rect width="32" height="32" rx="7.25" fill="#0C0A07" />
      <rect x="0.35" y="0.35" width="31.3" height="31.3" rx="6.95" fill="none" stroke="#ECC880" strokeOpacity="0.22" strokeWidth="0.5" />
      <g fill={`url(#${gold})`}>
        <path d="M7.44 23.7 L10.94 8.19 H13.75 L10.19 23.7 Z" />
        <path d="M24.56 23.7 L21.06 8.19 H18.25 L21.81 23.7 Z" />
        <path d="M13.75 10.3 L16 20.9 L18.25 10.3" fill="none" stroke={`url(#${gold})`} strokeWidth="2.875" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M24.88 4.75 L25.6 6.38 L27.23 7.1 L25.6 7.82 L24.88 9.45 L24.16 7.82 L22.53 7.1 L24.16 6.38 Z" />
      </g>
    </svg>
  );
}
