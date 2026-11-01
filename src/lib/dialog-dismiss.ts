/**
 * 입력이 남아 있는 동안 Esc·바깥 클릭으로 다이얼로그가 닫히지 않게 한다.
 *
 * 폼은 다시 열 때 초기화되므로, 실수로 닫히면 쓰던 내용이 그대로 사라진다.
 * 취소·닫기 버튼은 사용자가 고른 동작이라 막지 않는다.
 */
export function keepOpenWhileEditing(hasUnsavedInput: boolean) {
  const keepOpen = (event: Event) => {
    if (hasUnsavedInput) event.preventDefault();
  };
  return { onEscapeKeyDown: keepOpen, onInteractOutside: keepOpen };
}
