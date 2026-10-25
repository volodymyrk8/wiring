import { tr } from "@/lib/i18n";
import styles from "./GuestFlowSteps.module.css";

const STEPS = {
  likes: [
    tr("Создай профиль: фото, город, о себе"),
    tr("Лайкай людей в ленте"),
    tr("Кто лайкнул тебя — увидишь в этом разделе"),
  ],
  chats: [
    tr("Создай профиль: фото, город, о себе"),
    tr("Лайкай людей в ленте"),
    tr("Взаимный лайк — и переписка откроется здесь"),
  ],
  feed: [
    tr("Создай профиль: фото, город, о себе"),
    tr("Открой ленту и листай анкеты"),
    tr("Лайк с двух сторон — и можно писать"),
  ],
} as const;

type GuestFlowStepsProps = {
  variant: keyof typeof STEPS;
};

export function GuestFlowSteps({ variant }: GuestFlowStepsProps) {
  const steps = STEPS[variant];

  return (
    <div class={styles.wrap}>
      <ol class={styles.list}>
        {steps.map((text, index) => (
          <li key={text} class={styles.item}>
            <span class={styles.num} aria-hidden="true">
              {index + 1}
            </span>
            <span class={styles.text}>{text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
