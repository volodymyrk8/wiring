import type { LikeCard, LikesSort } from "./types";

const ageOf = (card: LikeCard) => Number(card.age) || 0;
const likedAt = (card: LikeCard) => Number(card.liked_at) || 0;

export const LIKES_SORT_OPTIONS: { id: LikesSort; label: string }[] = [
  { id: "newest", label: "Сначала новые" },
  { id: "oldest", label: "Сначала старые" },
  { id: "name", label: "По имени" },
  { id: "age_asc", label: "Младше" },
  { id: "age_desc", label: "Старше" },
];

export function sortLikeCards(cards: LikeCard[], sort: LikesSort): LikeCard[] {
  const hidden = cards.filter((card) => card.hidden);
  const visible = cards.filter((card) => !card.hidden);
  const sorted = [...visible];

  switch (sort) {
    case "oldest":
      sorted.sort((a, b) => likedAt(a) - likedAt(b));
      break;
    case "name":
      sorted.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ru"));
      break;
    case "age_asc":
      sorted.sort((a, b) => ageOf(a) - ageOf(b));
      break;
    case "age_desc":
      sorted.sort((a, b) => ageOf(b) - ageOf(a));
      break;
    default:
      sorted.sort((a, b) => likedAt(b) - likedAt(a));
      break;
  }

  return [...sorted, ...hidden];
}

export const readLikesSort = (): LikesSort => {
  try {
    const value = localStorage.getItem("wiring-likes-sort");
    if (value && LIKES_SORT_OPTIONS.some((option) => option.id === value)) return value as LikesSort;
  } catch {
    /* private mode */
  }
  return "newest";
};

export const storeLikesSort = (sort: LikesSort) => {
  try {
    localStorage.setItem("wiring-likes-sort", sort);
  } catch {
    /* private mode */
  }
};
