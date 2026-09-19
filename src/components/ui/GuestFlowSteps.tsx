import styles from "./GuestFlowSteps.module.css";

const STEPS = {
  likes: [
    "Создай профиль: фото, город, о себе",
    "Лайкай людей в ленте",
    "Кто лайкнул тебя — увидишь в этом разделе",
  ],
  chats: [
    "Создай профиль: фото, город, о себе",
    "Лайкай людей в ленте",
    "Взаимный лайк — и переписка откроется здесь",
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
