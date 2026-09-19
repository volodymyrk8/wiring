import type { JSX } from "preact";
import styles from "./HomeFaces.module.css";

export type HomeFacesProps = {
  faces: string[];
  basePath?: string;
  className?: string;
};

export function HomeFaces({ faces, basePath = "", className }: HomeFacesProps) {
  const handleError = (e: JSX.TargetedEvent<HTMLImageElement>) => {
    const target = e.currentTarget;
    target.parentElement?.remove();
  };

  return (
    <div class={`${styles.faces}${className ? ` ${className}` : ""}`} aria-hidden="true">
      {faces.map((src) => (
        <div key={src} class={styles.face}>
          <img
            src={`${basePath}/public/${src}`}
            alt=""
            width="120"
            height="150"
            loading="lazy"
            onError={handleError}
          />
        </div>
      ))}
    </div>
  );
}
