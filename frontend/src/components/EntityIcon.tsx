import { HelpCircle } from "lucide-react";
import * as LucideIcons from "lucide-react";

interface EntityIconProps {
  src?: string | null;
  size?: number;
  className?: string;
  imgClassName?: string;
  alt?: string;
}

function isImagePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:");
}

import { useState } from "react";

export function EntityIcon({ src, size = 16, className, imgClassName, alt }: EntityIconProps) {
  const [failed, setFailed] = useState(false);
  if (src && isImagePath(src) && !failed) {
    return (
      <img
        src={src}
        alt={alt || ""}
        className={imgClassName}
        style={{ imageRendering: "pixelated" }}
        onError={() => setFailed(true)}
      />
    );
  }
  const Icon = (src && !failed && (LucideIcons as Record<string, any>)[src]) || HelpCircle;
  const Comp = Icon as any;
  return <Comp size={size} className={className} />;
}
