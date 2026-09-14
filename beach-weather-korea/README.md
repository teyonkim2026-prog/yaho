# 🌊 BeachCast Korea

기상청 **전국 해수욕장 날씨 조회서비스(BeachInfoService)** Open API와 제공된 해수욕장 위·경도/격자 자료를 이용한 정적 웹사이트입니다.

## 기능

- 🇰🇷 대한민국 지도에서 전국 해수욕장 420개 위치 표시
- 🔎 해수욕장 이름 검색 및 지역 필터
- 📍 지도 마커 클릭 → 해당 해수욕장 상세 날씨
- 🌤️ 시간대별 기온/하늘상태/강수확률
- 💧 습도 / 💨 풍속 / 🌊 파고
- 🌊 수온
- 🌅 일출·일몰
- 🌊 조석 정보(제공되는 기간/자료가 있을 때)
- 📱 모바일 반응형

## 사용한 기상청 API

활용가이드에 명시된 서비스는 REST GET 방식이며 JSON/XML을 지원합니다.

- 서비스: `BeachInfoService`
- 초단기예보: `/getUltraSrtFcstBeach`
- 단기예보: `/getVilageFcstBeach`
- 파고: `/getWhBuoyBeach`
- 조석: `/getTideInfoBeach`
- 일출일몰: `/getSunInfoBeach`
- 수온: `/getTwBuoyBeach`

## GitHub Pages에 올리는 방법

1. 이 폴더의 파일 전체를 GitHub 저장소에 업로드합니다.
2. GitHub → **Settings → Pages**
3. Source를 **Deploy from a branch**로 선택
4. `main` / `/ (root)` 선택 후 저장
5. 잠시 후 GitHub Pages 주소에서 `index.html`이 실행됩니다.

### ⚠️ API 키 주의

GitHub Pages는 브라우저에서 직접 API를 호출하는 정적 호스팅 방식이라 API 키가 JavaScript에 노출될 수 있습니다.

현재 `config.js`에 사용자가 제공한 키를 넣어 두었습니다. **공개 GitHub 저장소에 그대로 올리면 키가 공개됩니다.**

학교 프로젝트로 공개해야 한다면 가능하면:
- 별도의 테스트용 API 키 사용
- 공공데이터포털에서 해당 키의 사용량/제한 확인
- 실제 서비스로 운영할 경우 서버리스 함수/백엔드에서 API 호출

을 권장합니다.

## 데이터 근거

해수욕장 위치와 `nx`, `ny`는 제공된 `기상청48_전국해수욕장_날씨_조회서비스_위경도.xlsx`에서 생성했습니다.

기상청 활용가이드에 따르면 이 서비스는 전국 해수욕장의 초단기·단기예보, 조석, 파고, 일출·일몰, 수온 정보를 제공합니다.
