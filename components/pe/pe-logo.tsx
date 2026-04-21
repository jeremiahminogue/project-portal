import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Pueblo Electric wordmark.
 *
 * Renders `/public/brand/Pueblo_Electrics-1.png` — the horizontal color
 * wordmark. The underlying asset is ~5:1 (1500×300-ish); we render it at a
 * fixed 32px height by default, which is the same visual footprint the old
 * text placeholder occupied in the header and login chrome.
 *
 * `className` still controls outer layout (e.g. spacing) while `height` lets
 * a caller bump the mark up for larger hero contexts. Width is derived from
 * the aspect ratio — do not hard-code it, since the PNG aspect may change if
 * brand ever reships the asset.
 */
export function PELogo({
  className,
  height = 32,
}: {
  className?: string;
  /** Pixel height of the rendered mark. Width follows the asset aspect ratio. */
  height?: number;
}) {
  // The source is 1440×263 (~5.5:1). Next.js needs width/height for layout
  // math even when we're sizing with CSS; these are intrinsic dims, not render
  // size.
  const INTRINSIC_W = 1440;
  const INTRINSIC_H = 263;
  const width = Math.round((height * INTRINSIC_W) / INTRINSIC_H);

  return (
    <Image
      src="/brand/Pueblo_Electrics-1.png"
      alt="Pueblo Electric"
      width={width}
      height={height}
      priority
      className={cn("h-8 w-auto", className)}
    />
  );
}
