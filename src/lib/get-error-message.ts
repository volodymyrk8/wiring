export function getErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as Error).message === "string") {
    return (err as Error).message;
  }
  return "ошибка";
}
