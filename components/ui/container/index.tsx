import { cn } from "@/lib/utils";
import styles from "./container.module.scss";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
  /** Center children on both axes (full-width flex, drops the max-width). */
  center?: boolean;
  /** Stretch to fill the available height as a vertical flex column — for
   *  single-screen pages whose content should fill and vertically center. */
  fill?: boolean;
}

export function Container({
  children,
  className,
  center,
  fill,
}: ContainerProps) {
  return (
    <div
      className={cn(
        styles.container,
        center && styles.center,
        fill && styles.fill,
        className
      )}
    >
      {children}
    </div>
  );
}

export default Container;
