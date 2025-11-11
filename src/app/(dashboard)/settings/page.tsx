export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">설정</h1>
        <p className="text-muted-foreground mt-2">
          좌측 메뉴에서 설정할 항목을 선택하세요.
        </p>
      </div>

      <div className="border rounded-lg p-12 text-center text-muted-foreground">
        <p className="text-lg mb-2">설정 항목을 선택하세요</p>
        <p className="text-sm">
          왼쪽 사이드바에서 원하는 설정 메뉴를 클릭하여 관리할 수 있습니다.
        </p>
      </div>
    </div>
  );
}
