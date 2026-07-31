# PIXELFRONT 한글·문자열 작성 규칙

PIXELFRONT의 HTML과 JavaScript 파일은 모두 **UTF-8(서명 없는 UTF-8)** 로 저장한다. Windows 기본 ANSI(CP949)로 다시 저장하면 한글이 깨질 수 있다.

## 정상 타입 예시

### HTML 문구

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>PIXELFRONT — 게임 설명</title>
</head>
<body>
  <h1>시작 위치를 선택하세요</h1>
  <p>해안과 다른 국가에서 떨어진 밝은 땅을 고르세요.</p>
</body>
</html>
```

### JavaScript 일반 문자열

```js
const playerName = "플레이어";
const message = "게임 서버를 사용하려면 먼저 로그인해야 합니다.";
throw new Error("존재하지 않는 방입니다.");
```

### JavaScript 템플릿 문자열

```js
const message = `게임 서버 오류 (${response.status})`;
const status = `${room.players.length}/8명 접속 중`;
const reward = `훈장 획득: ${achievement.name} · ${achievement.reward}`;
```

### 객체의 사용자 표시 문구

```js
const building = {
  name: "해군기지",
  detail: "상륙함 이동속도 증가 · 해안 전용",
};
```

## 잘못된 타입 예시

다음처럼 보이는 문자열은 번역 문구가 아니라 인코딩이 손상된 문자열이다.

```text
吏㏐쾶 ?쒖옉
寃뚯엫 ?ㅼ젙
?뚮젅?댁뼱
諛⑹씠 媛??李쇱뒿?덈떎.
```

이 상태에서 인코딩만 UTF-8로 바꿔 저장해도 원문은 복원되지 않는다. 이미 `?`로 바뀐 글자는 정보가 유실됐으므로 코드의 기능과 문맥에 맞춰 정상 한국어 문장을 다시 작성해야 한다.

## 파일별 기준

- HTML: `<meta charset="utf-8">`을 `<head>` 상단에 둔다.
- JavaScript: 소스 파일 자체를 UTF-8로 저장한다.
- JSON: UTF-8로 저장하고 실제 줄바꿈이나 제어 문자는 JSON 문법에 맞게 이스케이프한다.
- HTTP 응답: 가능하면 `Content-Type`에 `charset=utf-8`을 지정한다.
- PowerShell: 기본 인코딩에 의존하지 말고 `UTF8Encoding(false)`를 사용한다.

```powershell
$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($path, $content, $utf8)
```

## 수정 전 점검표

1. 기존 파일을 UTF-8로 읽었는지 확인한다.
2. 터미널에서만 깨지는지, 파일 내용 자체가 깨졌는지 구분한다.
3. 깨진 문구만 수정하고 게임 계산 로직은 변경하지 않는다.
4. 저장 후 CJK 한자·대체 문자 `�`가 사용자 문구에 남아 있지 않은지 검사한다.
5. 모든 JavaScript 파일에 `node --check`를 실행한다.
6. 브라우저에서 제목, 버튼, 오류 메시지, 동적 UI 문구를 확인한다.

## 자동 점검 예시

```powershell
$node = "node"
Get-ChildItem pixelfront -Filter *.js | ForEach-Object {
  & $node --check $_.FullName
}
```

한글 중심 UI에서 의도하지 않은 한자 또는 대체 문자를 찾는 간단한 Python 검사:

```python
from pathlib import Path

root = Path("pixelfront")
bad = []

for path in [*root.glob("*.js"), *root.glob("*.html")]:
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        broken = any(
            0x4E00 <= ord(char) <= 0x9FFF
            or 0xF900 <= ord(char) <= 0xFAFF
            or char == "�"
            for char in line
        )
        if broken:
            bad.append(f"{path}:{number}: {line}")

if bad:
    raise SystemExit("\n".join(bad))
```

주의: 국가명처럼 의도적으로 한자를 사용하는 기능을 추가하면 자동 검사의 예외 목록도 함께 관리해야 한다.
