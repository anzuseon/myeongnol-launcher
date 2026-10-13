# 런처 로고와 서버 배경 관리

런처 1.0.9부터 기본 배경을 배포 저장소에서 관리합니다. 배경 교체에 런처 빌드나 모드팩 버전 변경은 필요하지 않습니다.

설정 주소는 https://raw.githubusercontent.com/anzuseon/myeongnol-distribution/main/launcher/appearance.json 입니다.

## 배경 바꾸기

PowerShell에서 다음 명령을 실행하면 선택한 이미지와 설정을 배포 저장소에 커밋하고 GitHub에 올립니다.

```powershell
& C:\MyeongnolDistribution\set-launcher-background.ps1 -ImagePath "C:\배경\새배경.png"
```

PNG, JPEG, WebP 파일을 지원하고 최대 크기는 20MiB입니다. 16:9 가로형 이미지를 권장합니다. 같은 이미지를 지정하면 새 커밋을 만들지 않습니다. `-NoPush`는 로컬 커밋까지만 만듭니다. 이전 배경 파일은 보존하므로 해당 파일을 다시 지정해 되돌릴 수 있습니다.

런처는 시작 시와 5분 간격으로 설정을 확인합니다. 창을 다시 활성화할 때도 확인하며 요청 간격은 최소 30초입니다. GitHub의 전파 지연에 따라 다음 확인 때 반영될 수 있습니다.

## 설정 형식

```json
{
  "schemaVersion": 1,
  "background": {
    "url": "https://example.com/background.png",
    "sha256": "이미지 파일의 소문자 SHA256 64자리"
  }
}
```

외부 HTTPS 이미지 서버를 사용해도 됩니다. 이미지 내용과 SHA256을 함께 갱신해야 합니다. 같은 SHA256이면 이미지를 다시 받지 않습니다.

이미지는 크기, PNG/JPEG/WebP 형식, SHA256, 실제 디코딩을 확인한 후 적용합니다. 다운로드는 요청당 8초로 제한하고 최대 3번의 HTTPS 리디렉션을 허용합니다. 실패해도 현재 배경과 계정·게임 실행 상태는 유지합니다.

캐시는 런처 사용자 데이터 폴더의 appearance-cache에 저장합니다. 오프라인에서는 마지막 정상 배경을 사용하며 캐시가 없거나 손상됐으면 번들 전투 일러스트를 사용합니다. 캐시를 비워도 계정과 게임 파일에는 영향을 주지 않습니다.

## 로고와 아이콘

build/icon.ico와 app/assets/images/SealCircle.ico는 사용자 제공 사각형 아이콘을 16·24·32·48·64·128·256픽셀 ICO로 변환한 것입니다. build/icon.png는 같은 아이콘의 PNG입니다.

app/assets/images/MyeongnolLogo.png는 사용자 제공 가로형 로고입니다. 홈, 로그인, 환영 화면에 표시합니다. 로딩과 설정 정보 화면에는 사각형 아이콘을 사용합니다. 로고와 아이콘 변경에는 런처 새 버전 배포가 필요합니다.
