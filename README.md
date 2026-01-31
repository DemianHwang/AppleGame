# AppleGame

사과 게임 - 10을 만드는 퍼즐 게임

## 🎮 플레이하기

**https://demianhwang.github.io/AppleGame/**

## 🛠️ 로컬 개발 & 테스트

### 1. 개발 서버 실행
```bash
npm install
npm run dev
```
- 자동으로 브라우저가 열립니다
- 파일 수정 시 자동 새로고침

### 2. 프로덕션 빌드 미리보기 (배포 전 검증)
```bash
npm run build
npm run preview
```
- 실제 배포될 최적화된 버전을 로컬에서 테스트
- **배포 전 필수 체크!**

### 3. 모바일 테스트
개발 서버 실행 시 표시되는 네트워크 주소로 모바일에서 접속:
```
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.x.x:5173/
```
같은 Wi-Fi에 연결된 모바일로 Network 주소에 접속하여 테스트

### 4. 배포
```bash
npm run deploy
```
- GitHub Pages에 자동 배포
- 1~2분 후 https://demianhwang.github.io/AppleGame/ 에서 확인 가능

## ✅ 배포 전 체크리스트

1. `npm run build` - 빌드 에러 없는지 확인
2. `npm run preview` - 로컬에서 프로덕션 버전 테스트
3. 모바일 세로모드 테스트 (터치 동작 확인)
4. 모바일 가로모드 테스트 (레이아웃 확인)
5. `npm run deploy` - 배포

## 🔧 기술 스택

- Vanilla JavaScript (ES6+)
- HTML5 Canvas
- Vite (빌드 도구)
- GitHub Pages (배포)
