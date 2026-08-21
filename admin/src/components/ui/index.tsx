import { ReactNode } from "react";

// ============================================================================
// Primitivos visuais reutilizáveis do Admin Panel.
// Objetivo: eliminar repetição de classes Tailwind e dar identidade consistente
// (botões, inputs, badges, tabelas, cards, headers, estados).
// ============================================================================

export const inputClass =
  "w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-accent-500 focus:outline-none transition-colors";

export const labelClass = "block text-[11px] text-gray-500 mb-1.5 font-medium uppercase tracking-wide";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-dark-800 border border-dark-600 rounded-xl ${className}`}>{children}</div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent-600 hover:bg-accent-500 text-white",
  secondary: "bg-dark-700 hover:bg-dark-600 text-gray-200 border border-dark-600",
  ghost: "text-gray-400 hover:text-white hover:bg-dark-700",
  danger: "bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-600/30",
  success: "bg-green-600/20 hover:bg-green-600/30 text-green-300 border border-green-600/30",
};

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: {
  children: ReactNode;
  variant?: ButtonVariant;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${buttonVariants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

type BadgeTone = "neutral" | "green" | "blue" | "purple" | "yellow" | "red" | "gray";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-dark-700 text-gray-300",
  green: "bg-green-600/20 text-green-300",
  blue: "bg-blue-600/20 text-blue-300",
  purple: "bg-purple-600/20 text-purple-300",
  yellow: "bg-yellow-500/20 text-yellow-400",
  red: "bg-red-600/20 text-red-300",
  gray: "bg-gray-600/30 text-gray-300",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badgeTones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="text-gray-600 mb-3">{icon}</div>}
      <p className="text-gray-300 font-medium">{title}</p>
      {description && <p className="text-sm text-gray-600 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
