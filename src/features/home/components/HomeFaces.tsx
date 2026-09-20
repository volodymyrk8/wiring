import type { JSX } from "preact";
import styles from "./HomeFaces.module.css";

export type HomeFacesProps = {
  faces: string[];
  basePath?: string;
  className?: string;
};

const faceImageSrc = (basePath: string, src: string) => {
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) return src;
  if (src.startsWith("/")) return `${basePath}${src}`;
  return `${basePath}/public/${src}`;
};

export function HomeFaces({ faces, basePath = "", className }: HomeFacesProps) {
  const shown = faces.slice(0, 4);

  const handleError = (e: JSX.TargetedEvent<HTMLImageElement>) => {
    const target = e.currentTarget;
    target.parentElement?.remove();
  };

  if (!shown.length) return null;

  return (
    <div
      class={`${styles.strip}${className ? ` ${className}` : ""}`}
      aria-label="Примеры людей на WIRING"
      role="group"
    >
      {shown.map((src, index) => (
        <div key={`${src}-${index}`} class={styles.face}>
          <img
            src={faceImageSrc(basePath, src)}
            alt=""
            width="96"
            height="120"
            loading={index === 0 ? "eager" : "lazy"}
            decoding="async"
            onError={handleError}
          />
        </div>
      ))}
    </div>
  );
}
