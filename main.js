import './style.css';
import AudioManager from './audio.js';

// ========== 상수 정의 ==========
const BOARD_WIDTH = 17;
const BOARD_HEIGHT = 10;
const TIME_LIMIT = 120;
const TARGET_SUM = 10;

// ========== 반응형 설정 ==========
let CELL_SIZE = 50; // 동적으로 계산됨
let canvasScale = 1; // CSS 크기 대비 내부 해상도 비율

// ========== 게임 상태 ==========
let board = [];
let score = 0;
let timeLeft = TIME_LIMIT;
let gameRunning = false;
let timerInterval = null;
let combo = 0;
let isAutoRemoving = false;

// 드래그 선택 상태
let isDragging = false;
let startCell = null;
let currentCell = null;

// 힌트 상태
let currentHint = null;  // { startX, startY, endX, endY }
let hintTimeout = null;

// 파티클 상태
let particles = [];
const MAX_PARTICLES = 200;

// 컨페티 상태
let confettiParticles = [];

// 최고 점수
let highScore = 0;

// ========== 프로파일링 ==========
let profilingEnabled = false;
const performanceStats = {
  render: [],
  findHints: [],
  calculateSum: [],
  gameLoop: []
};

function profileStart(label) {
  if (!profilingEnabled) return null;
  return { label, start: performance.now() };
}

function profileEnd(timer) {
  if (!timer || !profilingEnabled) return;
  const duration = performance.now() - timer.start;
  
  if (!performanceStats[timer.label]) {
    performanceStats[timer.label] = [];
  }
  
  performanceStats[timer.label].push(duration);
  
  // 최근 60개만 유지
  if (performanceStats[timer.label].length > 60) {
    performanceStats[timer.label].shift();
  }
  
  // 10ms 이상이면 경고
  if (duration > 10) {
    console.warn(`⚠️ ${timer.label} took ${duration.toFixed(2)}ms`);
  }
}

function getProfilingStats() {
  const stats = {};
  for (const [key, values] of Object.entries(performanceStats)) {
    if (values.length === 0) continue;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    stats[key] = { avg: avg.toFixed(2), max: max.toFixed(2), min: min.toFixed(2), count: values.length };
  }
  return stats;
}

// ========== LocalStorage 관리 ==========
function loadHighScore() {
  const saved = localStorage.getItem('appleGameHighScore');
  return saved ? parseInt(saved, 10) : 0;
}

function saveHighScore(score) {
  localStorage.setItem('appleGameHighScore', score.toString());
}

// ========== Particle 클래스 ==========
class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    
    // 속도 (랜덤 방향으로 폭발) - 셀 크기에 비례
    const angle = Math.random() * Math.PI * 2;
    const speedScale = Math.max(0.5, CELL_SIZE / 50); // 기준: 50px
    const speed = (2 + Math.random() * 4) * speedScale;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - 2 * speedScale;  // 위로 더 튀도록
    
    // 크기와 수명 - 셀 크기에 비례
    const sizeScale = Math.max(0.5, Math.min(1.5, CELL_SIZE / 50));
    this.size = (6 + Math.random() * 6) * sizeScale;
    this.life = 1.0;
    this.decay = 0.015 + Math.random() * 0.015;
    
    // 중력
    this.gravity = 0.15 * speedScale;
  }
  
  update() {
    // 위치 업데이트
    this.x += this.vx;
    this.y += this.vy;
    
    // 중력 적용
    this.vy += this.gravity;
    
    // 감속
    this.vx *= 0.98;
    
    // 수명 감소
    this.life -= this.decay;
    
    return this.life > 0;  // 살아있으면 true
  }
  
  draw(ctx) {
    // 별 모양을 path로 그리기 (이모지보다 훨씬 빠름)
    const oldAlpha = ctx.globalAlpha;
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    
    // 5각 별 그리기
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const x = this.x + Math.cos(angle) * this.size;
      const y = this.y + Math.sin(angle) * this.size;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    
    ctx.globalAlpha = oldAlpha;
  }
}

// ========== Confetti 클래스 ==========
class Confetti {
  constructor(centerX, centerY) {
    // 화면 중앙에서 시작
    this.x = centerX;
    this.y = centerY;
    
    // 사방으로 폭발하는 속도 (360도 방향) - 훨씬 더 강력하게!
    const angle = Math.random() * Math.PI * 2;
    const speed = 10 + Math.random() * 18; // 폭발 속도 증가 (5~15 → 10~28)
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - 8; // 위쪽으로 더 강하게 튀도록 (-3 → -8)
    
    this.rotation = Math.random() * 360;
    this.rotationSpeed = (Math.random() - 0.5) * 30; // 회전 속도 2배 증가 (15 → 30)
    this.width = 12 + Math.random() * 18; // 크기 증가 (8~20 → 12~30)
    this.height = 10 + Math.random() * 16; // 크기 증가 (6~16 → 10~26)
    
    // 무지개 색상 - 더 선명하게
    const colors = [
      '#FF0000', // 빨강
      '#FF6B00', // 주황
      '#FFD700', // 금색
      '#00FF00', // 초록
      '#0080FF', // 파랑
      '#8000FF', // 보라
      '#FF00FF', // 마젠타
      '#FF1493'  // 핫핑크
    ];
    this.color = colors[Math.floor(Math.random() * colors.length)];
    
    this.life = 1.0;
    this.decay = 0.0015 + Math.random() * 0.0015; // 지속시간 5초 이상 (decay: 0.003~0.006 → 0.0015~0.003)
    this.gravity = 0.1; // 중력 더 감소 (0.12 → 0.1)
  }
  
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.rotation += this.rotationSpeed;
    
    // 중력 적용
    this.vy += this.gravity;
    
    // 공기 저항
    this.vx *= 0.99;
    
    this.life -= this.decay;
    
    // 화면 밖으로 나가거나 수명이 다하면 제거
    return this.life > 0 && this.y < window.innerHeight + 100;
  }
  
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.life;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation * Math.PI / 180);
    
    // 그림자 효과 추가 (더 화려하게)
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    ctx.fillStyle = this.color;
    ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
    ctx.restore();
  }
}

// ========== 반응형 캔버스 크기 계산 ==========
function calculateCanvasSize() {
  const container = document.querySelector('.game-container');
  const header = document.querySelector('.game-header');
  const sumDisplay = document.querySelector('.sum-display');
  const orientationWarning = document.getElementById('orientationWarning');
  
  // 모바일 여부 및 방향 확인
  const isMobile = window.innerWidth <= 1024;
  const isLandscape = window.innerWidth > window.innerHeight;
  const isMobileLandscape = isMobile && isLandscape;
  
  // 실제 가용 높이 계산 (모바일 브라우저 툴바 고려)
  // visualViewport API 사용 (모바일 브라우저 툴바를 제외한 실제 보이는 영역)
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
  
  // 컨테이너 여백 및 패딩 고려
  const containerPadding = isMobile ? 16 : 48;
  
  // 세로 모드 안내 배너 높이 고려
  const orientationWarningHeight = (orientationWarning && !orientationWarning.classList.contains('hidden')) 
    ? orientationWarning.offsetHeight : 0;
  
  let availableWidth, availableHeight;
  
  if (isMobileLandscape) {
    // 모바일 가로모드: 사이드바 레이아웃
    const sidebarWidth = header ? header.offsetWidth : 100;
    
    // safe area 가져오기 (CSS 변수에서)
    const safeAreaTopStr = getComputedStyle(document.documentElement).getPropertyValue('--safe-area-top');
    const safeAreaBottomStr = getComputedStyle(document.documentElement).getPropertyValue('--safe-area-bottom');
    const safeAreaTop = parseFloat(safeAreaTopStr) || 0;
    const safeAreaBottom = parseFloat(safeAreaBottomStr) || 0;
    
    // safe area와 20px 중 큰 값 사용 (iOS + Android 모두 대응)
    const paddingTop = Math.max(safeAreaTop, 20);
    const paddingBottom = Math.max(safeAreaBottom, 20);
    
    availableWidth = viewportWidth - sidebarWidth;
    availableHeight = viewportHeight - orientationWarningHeight - paddingTop - paddingBottom;
  } else {
    // 세로모드 또는 데스크톱: 기존 레이아웃
    const headerHeight = header ? header.offsetHeight + (isMobile ? 8 : 16) : (isMobile ? 60 : 80);
    const sumDisplayHeight = sumDisplay ? sumDisplay.offsetHeight + (isMobile ? 8 : 12) : (isMobile ? 48 : 60);
    const extraSpace = isMobile ? 20 : 40;
    
    availableWidth = viewportWidth - containerPadding;
    availableHeight = viewportHeight - containerPadding - headerHeight - sumDisplayHeight - extraSpace - orientationWarningHeight;
  }
  
  // 보드 비율 유지하면서 최대 크기 계산
  const aspectRatio = BOARD_WIDTH / BOARD_HEIGHT;
  
  let canvasWidth = availableWidth;
  let canvasHeight = canvasWidth / aspectRatio;
  
  // 높이가 넘치면 높이 기준으로 재계산
  if (canvasHeight > availableHeight) {
    canvasHeight = availableHeight;
    canvasWidth = canvasHeight * aspectRatio;
  }
  
  // 최소/최대 크기 제한
  const minCellSize = 20; // 최소 셀 크기
  const maxCellSize = 60; // 최대 셀 크기
  
  const minWidth = BOARD_WIDTH * minCellSize;
  const maxWidth = BOARD_WIDTH * maxCellSize;
  
  canvasWidth = Math.max(minWidth, Math.min(maxWidth, canvasWidth));
  canvasHeight = canvasWidth / aspectRatio;
  
  // 셀 크기 계산
  const cellSize = canvasWidth / BOARD_WIDTH;
  
  return {
    width: Math.floor(canvasWidth),
    height: Math.floor(canvasHeight),
    cellSize: cellSize
  };
}

function resizeCanvas() {
  const size = calculateCanvasSize();
  
  // 레티나 디스플레이 대응 (devicePixelRatio 고려)
  const dpr = window.devicePixelRatio || 1;
  
  // 캔버스 내부 해상도 설정 (고해상도로)
  canvas.width = size.width * dpr;
  canvas.height = size.height * dpr;
  
  // CSS 크기는 논리적 크기로
  canvas.style.width = size.width + 'px';
  canvas.style.height = size.height + 'px';
  
  // 컨텍스트 스케일 조정
  ctx.scale(dpr, dpr);
  
  // 셀 크기 업데이트
  CELL_SIZE = size.cellSize;
  canvasScale = dpr;
  
  // 컨페티 캔버스도 업데이트
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
  
  // 재렌더링
  if (gameRunning) {
    render();
  }
  
  console.log(`Canvas resized: ${size.width}x${size.height}, Cell: ${CELL_SIZE.toFixed(1)}px`);
}

// ========== DOM 요소 ==========
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const confettiCanvas = document.getElementById('confettiCanvas');
const confettiCtx = confettiCanvas.getContext('2d');

// 초기 캔버스 크기 설정
resizeCanvas();

const scoreDisplay = document.getElementById('score');
const timerDisplay = document.getElementById('timer');
const sumDisplay = document.getElementById('sumDisplay');
const muteBtn = document.getElementById('muteBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const restartBtnHeader = document.getElementById('restartBtnHeader');
const restartBtnSidebar = document.getElementById('restartBtnSidebar');
const debugToggleBtnSidebar = document.getElementById('debugToggleBtnSidebar');
const startModal = document.getElementById('startModal');
const startGameBtn = document.getElementById('startGameBtn');
const gameOverModal = document.getElementById('gameOverModal');
const finalScoreDisplay = document.getElementById('finalScore');
const highScoreDisplay = document.getElementById('highScore');
const newRecordLabel = document.getElementById('newRecordLabel');
const restartBtn = document.getElementById('restartBtn');

// 디버그 요소
const debugToggleBtn = document.getElementById('debugToggleBtn');
const debugPanel = document.getElementById('debugPanel');
const resetHighScoreBtn = document.getElementById('resetHighScoreBtn');
const forceGameOverBtn = document.getElementById('forceGameOverBtn');
const testConfettiBtn = document.getElementById('testConfettiBtn');
const autoRemoveBtn = document.getElementById('autoRemoveBtn');
const toggleProfilingBtn = document.getElementById('toggleProfilingBtn');
const showStatsBtn = document.getElementById('showStatsBtn');

// ========== 오디오 매니저 ==========
const audioManager = new AudioManager();

// ========== 보드 초기화 ==========
function initBoard() {
  board = [];
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    board[y] = [];
    for (let x = 0; x < BOARD_WIDTH; x++) {
      board[y][x] = {
        value: Math.floor(Math.random() * 9) + 1, // 1~9 랜덤
        isEmpty: false
      };
    }
  }
}

// ========== 게임 시작 ==========
function startGame() {
  initBoard();
  score = 0;
  timeLeft = TIME_LIMIT;
  gameRunning = true;
  combo = 0;
  
  // 최고 점수 로드
  highScore = loadHighScore();
  
  // 컨페티 초기화
  confettiParticles = [];
  
  updateScore();
  updateTimer();
  
  gameOverModal.classList.add('hidden');
  gameOverModal.classList.remove('new-record'); // 클래스 초기화
  
  // BGM 재생
  audioManager.playBGM();
  
  // 힌트 초기화
  currentHint = null;
  if (hintTimeout) {
    clearTimeout(hintTimeout);
  }
  
  // 타이머 시작
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimer();
    
    if (timeLeft <= 0) {
      endGame();
    }
  }, 1000);
  
  // 5초 후 첫 힌트 표시
  hintTimeout = setTimeout(() => {
    findAndShowHint();
  }, 5000);
  
  // 게임 루프 시작
  gameLoop();
}

// ========== 게임 종료 ==========
function endGame() {
  gameRunning = false;
  clearInterval(timerInterval);
  audioManager.stopBGM();
  
  // 힌트 타이머 정리
  if (hintTimeout) {
    clearTimeout(hintTimeout);
    hintTimeout = null;
  }
  currentHint = null;
  
  // 최고 점수 확인
  const isNewRecord = score > highScore;
  
  if (isNewRecord) {
    highScore = score;
    saveHighScore(highScore);
    
    // 기존 컨페티 제거 후 새로 시작
    confettiParticles = [];
    startConfetti();
    // 컨페티를 위해 gameLoop 재시작
    gameLoop();
  }
  
  // UI 업데이트
  finalScoreDisplay.textContent = score;
  highScoreDisplay.textContent = highScore;
  
  if (isNewRecord) {
    newRecordLabel.classList.remove('hidden');
    gameOverModal.classList.add('new-record'); // 신기록 시 밝은 배경
  } else {
    newRecordLabel.classList.add('hidden');
    gameOverModal.classList.remove('new-record'); // 일반 배경
  }
  
  gameOverModal.classList.remove('hidden');
}

// ========== UI 업데이트 ==========
function updateScore() {
  scoreDisplay.textContent = score;
}

function updateTimer() {
  timerDisplay.textContent = timeLeft;
  
  // 시간 10초 이하일 때 경고 색상
  if (timeLeft <= 10) {
    timerDisplay.style.color = '#ff1744';
  } else {
    timerDisplay.style.color = '#ff5722';
  }
}

function updateSumDisplay(sum, count) {
  if (count === 0) {
    sumDisplay.textContent = '';
    sumDisplay.className = 'sum-display';
  } else {
    sumDisplay.textContent = `선택 영역 합계: ${sum} (블록 ${count}개)`;
    
    if (sum === TARGET_SUM) {
      sumDisplay.className = 'sum-display valid';
    } else {
      sumDisplay.className = 'sum-display invalid';
    }
  }
}

// ========== 좌표 변환 ==========
function getCellFromMouse(e) {
  const rect = canvas.getBoundingClientRect();
  
  // DPR이 적용된 캔버스에서는 CSS 픽셀 기준으로 계산
  // ctx.scale(dpr, dpr)로 렌더링을 스케일링했으므로, 좌표는 논리적 픽셀로 처리
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  const x = Math.floor(mouseX / CELL_SIZE);
  const y = Math.floor(mouseY / CELL_SIZE);
  
  if (x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT) {
    return { x, y };
  }
  return null;
}

function getCellFromTouch(touch) {
  const rect = canvas.getBoundingClientRect();
  
  // DPR이 적용된 캔버스에서는 CSS 픽셀 기준으로 계산
  const touchX = touch.clientX - rect.left;
  const touchY = touch.clientY - rect.top;
  
  const x = Math.floor(touchX / CELL_SIZE);
  const y = Math.floor(touchY / CELL_SIZE);
  
  if (x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT) {
    return { x, y };
  }
  return null;
}

// ========== 선택 영역 계산 ==========
function getSelectionBounds() {
  if (!startCell || !currentCell) return null;
  
  return {
    startX: Math.min(startCell.x, currentCell.x),
    startY: Math.min(startCell.y, currentCell.y),
    endX: Math.max(startCell.x, currentCell.x),
    endY: Math.max(startCell.y, currentCell.y)
  };
}

function calculateSum(bounds) {
  if (!bounds) return { sum: 0, count: 0 };
  
  let sum = 0;
  let count = 0;
  
  for (let y = bounds.startY; y <= bounds.endY; y++) {
    for (let x = bounds.startX; x <= bounds.endX; x++) {
      if (!board[y][x].isEmpty) {
        sum += board[y][x].value;
        count++;
      }
    }
  }
  
  return { sum, count };
}

// ========== 블록 제거 ==========
function removeBlocks(bounds) {
  for (let y = bounds.startY; y <= bounds.endY; y++) {
    for (let x = bounds.startX; x <= bounds.endX; x++) {
      board[y][x].isEmpty = true;
    }
  }
  
  // 블록 제거 후 항상 힌트 무효화 (제거된 영역이 힌트일 수 있음)
  currentHint = null;
}

// ========== 파티클 시스템 ==========
// 파티클 생성 함수
function createParticles(x, y, count, blockValue) {
  // 파티클 개수 제한
  if (particles.length > MAX_PARTICLES) {
    return;
  }
  
  // 블록 색상 계산 (기존 렌더링과 동일)
  const hue = (blockValue - 1) * 40;
  const color = `hsl(${hue}, 70%, 60%)`;
  
  for (let i = 0; i < count; i++) {
    particles.push(new Particle(x, y, color));
  }
}

// 파티클 업데이트 함수
function updateParticles() {
  particles = particles.filter(p => p.update());
}

// 파티클 렌더링 함수
function renderParticles(ctx) {
  const timer = profileStart('renderParticles');
  particles.forEach(p => p.draw(ctx));
  profileEnd(timer);
}

// 컨페티 시작
function startConfetti() {
  console.log('🎉 컨페티 시작! 200개 생성');
  // 화면 중앙 좌표 계산
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  
  // 컨페티 개수를 대폭 증가 (80 → 200)
  for (let i = 0; i < 200; i++) {
    confettiParticles.push(new Confetti(centerX, centerY));
  }
  console.log('컨페티 배열 길이:', confettiParticles.length);
}

// 컨페티 업데이트
function updateConfetti() {
  confettiParticles = confettiParticles.filter(c => c.update());
}

// 컨페티 렌더링 (별도 캔버스 사용)
function renderConfetti() {
  // 캔버스 클리어
  confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  
  // 컨페티 그리기
  confettiParticles.forEach(c => c.draw(confettiCtx));
}

// ========== 힌트 시스템 ==========
// 인접한 2개 블록 찾기 (최우선)
function findAdjacentPairs() {
  const timer = profileStart('findAdjacentPairs');
  const pairs = [];
  
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (board[y][x].isEmpty) continue;
      
      const value = board[y][x].value;
      const target = TARGET_SUM - value;
      
      // 오른쪽 확인
      if (x + 1 < BOARD_WIDTH && 
          !board[y][x + 1].isEmpty && 
          board[y][x + 1].value === target) {
        pairs.push({ 
          startX: x, startY: y, 
          endX: x + 1, endY: y, 
          size: 2 
        });
      }
      
      // 아래쪽 확인
      if (y + 1 < BOARD_HEIGHT && 
          !board[y + 1][x].isEmpty && 
          board[y + 1][x].value === target) {
        pairs.push({ 
          startX: x, startY: y, 
          endX: x, endY: y + 1, 
          size: 2 
        });
      }
    }
  }
  
  profileEnd(timer);
  return pairs;
}

// 모든 가능한 조합 찾기 (크기순) - 최적화: 작은 것부터 찾아서 조기 종료
function findAllCombinations() {
  const timer = profileStart('findAllCombinations');
  // 크기가 작은 순서대로 탐색 (2x2, 2x3, 3x2, 3x3, ...)
  const maxSize = 12; // 최대 영역 크기 제한 (너무 큰 영역은 힌트로 부적절)
  
  for (let size = 2; size <= maxSize; size++) {
    // size 크기의 직사각형들을 모두 시도
    for (let height = 1; height <= size && height <= BOARD_HEIGHT; height++) {
      const width = Math.ceil(size / height);
      if (width > BOARD_WIDTH) continue;
      
      // 해당 크기의 모든 위치 시도
      for (let sy = 0; sy <= BOARD_HEIGHT - height; sy++) {
        for (let sx = 0; sx <= BOARD_WIDTH - width; sx++) {
          const bounds = { startX: sx, startY: sy, endX: sx + width - 1, endY: sy + height - 1 };
          const { sum, count } = calculateSum(bounds);
          
          if (sum === TARGET_SUM && count >= 2) {
            // 첫 번째 찾은 것을 바로 반환 (가장 작은 크기)
            profileEnd(timer);
            return [{ ...bounds, count, size }];
          }
        }
      }
    }
  }
  
  profileEnd(timer);
  return []; // 힌트 없음
}

// 힌트 찾기 및 표시
function findAndShowHint() {
  if (!gameRunning) return;
  
  // 1순위: 인접 2개 (최우선)
  const pairs = findAdjacentPairs();
  if (pairs.length > 0) {
    currentHint = pairs[0];
    combo = 0; // 5초 무활동으로 힌트 표시 시 콤보 리셋
    render();
    return;
  }
  
  // 2/3순위: 작은 영역부터
  const combinations = findAllCombinations();
  if (combinations.length > 0) {
    currentHint = combinations[0];
    combo = 0; // 5초 무활동으로 힌트 표시 시 콤보 리셋
    render();
    return;
  }
  
  // 힌트 없음
  currentHint = null;
  console.log('힌트를 찾을 수 없습니다.');
}

// 활동 기록 (힌트 타이머 관리)
function recordActivity() {
  // 항상 타이머 리셋 (힌트 여부와 무관)
  if (hintTimeout) {
    clearTimeout(hintTimeout);
  }
  
  hintTimeout = setTimeout(() => {
    findAndShowHint();
  }, 5000);
}

// 힌트 영역 매칭 확인
function isHintMatch(bounds) {
  if (!currentHint) return false;
  
  return bounds.startX === currentHint.startX &&
         bounds.startY === currentHint.startY &&
         bounds.endX === currentHint.endX &&
         bounds.endY === currentHint.endY;
}

// ========== 마우스 이벤트 ==========
canvas.addEventListener('mousedown', (e) => {
  if (!gameRunning) return;
  
  const cell = getCellFromMouse(e);
  if (cell) {
    isDragging = true;
    startCell = cell;
    currentCell = cell;
    render();
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (!gameRunning || !isDragging) return;
  
  const cell = getCellFromMouse(e);
  if (cell) {
    currentCell = cell;
    
    const bounds = getSelectionBounds();
    const { sum, count } = calculateSum(bounds);
    updateSumDisplay(sum, count);
    
    render();
  }
});

canvas.addEventListener('mouseup', (e) => {
  if (!gameRunning || !isDragging) return;
  
  isDragging = false;
  
  const bounds = getSelectionBounds();
  const { sum, count } = calculateSum(bounds);
  
  if (sum === TARGET_SUM && count > 0) {
    // 파티클 생성 (제거 전에 블록 정보 저장)
    for (let y = bounds.startY; y <= bounds.endY; y++) {
      for (let x = bounds.startX; x <= bounds.endX; x++) {
        if (!board[y][x].isEmpty) {
          const px = x * CELL_SIZE + CELL_SIZE / 2;
          const py = y * CELL_SIZE + CELL_SIZE / 2;
          const particleCount = 3 + Math.floor(Math.random() * 3);
          createParticles(px, py, particleCount, board[y][x].value);
        }
      }
    }
    
    // 성공: 블록 제거 및 점수 추가
    removeBlocks(bounds);
    score += count;
    updateScore();
    
    // 콤보 증가 및 사운드 재생
    audioManager.playSuccess(combo);
    combo++;
    
    // 블록 제거 후 힌트는 이미 removeBlocks에서 무효화됨
    // 성공했으므로 항상 타이머 리셋
    recordActivity();
    
    // 모든 블록 제거 체크
    const allEmpty = board.every(row => row.every(cell => cell.isEmpty));
    if (allEmpty) {
      endGame();
    }
  } else if (count > 0) {
    // 실패: 효과음만 (힌트는 유지)
    audioManager.playFail();
    combo = 0; // 콤보 리셋
    // 힌트가 없는 상태라면 타이머 리셋
    if (!currentHint) {
      recordActivity();
    }
  }
  
  startCell = null;
  currentCell = null;
  updateSumDisplay(0, 0);
  
  render();
});

canvas.addEventListener('mouseleave', () => {
  if (isDragging) {
    isDragging = false;
    startCell = null;
    currentCell = null;
    updateSumDisplay(0, 0);
    render();
  }
});

// ========== 터치 이벤트 ==========
canvas.addEventListener('touchstart', (e) => {
  if (!gameRunning) return;
  
  e.preventDefault(); // 스크롤 방지
  
  const touch = e.touches[0];
  const cell = getCellFromTouch(touch);
  if (cell) {
    isDragging = true;
    startCell = cell;
    currentCell = cell;
    render();
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (!gameRunning || !isDragging) return;
  
  e.preventDefault(); // 스크롤 방지
  
  const touch = e.touches[0];
  const cell = getCellFromTouch(touch);
  if (cell) {
    currentCell = cell;
    
    const bounds = getSelectionBounds();
    const { sum, count } = calculateSum(bounds);
    updateSumDisplay(sum, count);
    
    render();
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  if (!gameRunning || !isDragging) return;
  
  e.preventDefault();
  
  isDragging = false;
  
  const bounds = getSelectionBounds();
  const { sum, count } = calculateSum(bounds);
  
  if (sum === TARGET_SUM && count > 0) {
    // 파티클 생성 (제거 전에 블록 정보 저장)
    for (let y = bounds.startY; y <= bounds.endY; y++) {
      for (let x = bounds.startX; x <= bounds.endX; x++) {
        if (!board[y][x].isEmpty) {
          const px = x * CELL_SIZE + CELL_SIZE / 2;
          const py = y * CELL_SIZE + CELL_SIZE / 2;
          const particleCount = 3 + Math.floor(Math.random() * 3);
          createParticles(px, py, particleCount, board[y][x].value);
        }
      }
    }
    
    // 성공: 블록 제거 및 점수 추가
    removeBlocks(bounds);
    score += count;
    updateScore();
    
    // 콤보 증가 및 사운드 재생
    audioManager.playSuccess(combo);
    combo++;
    
    // 블록 제거 후 힌트는 이미 removeBlocks에서 무효화됨
    // 성공했으므로 항상 타이머 리셋
    recordActivity();
    
    // 모든 블록 제거 체크
    const allEmpty = board.every(row => row.every(cell => cell.isEmpty));
    if (allEmpty) {
      endGame();
    }
  } else if (count > 0) {
    // 실패: 효과음만 (힌트는 유지)
    audioManager.playFail();
    combo = 0; // 콤보 리셋
    // 힌트가 없는 상태라면 타이머 리셋
    if (!currentHint) {
      recordActivity();
    }
  }
  
  startCell = null;
  currentCell = null;
  updateSumDisplay(0, 0);
  
  render();
}, { passive: false });

canvas.addEventListener('touchcancel', () => {
  if (isDragging) {
    isDragging = false;
    startCell = null;
    currentCell = null;
    updateSumDisplay(0, 0);
    render();
  }
});

// ========== 렌더링 ==========
function render() {
  const timer = profileStart('render');
  // 배경 클리어
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // 폰트 설정을 한 번만 (루프 밖에서) - 셀 크기에 비례
  const fontSize = Math.max(12, Math.min(24, CELL_SIZE * 0.48));
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // 보드 그리기 - 배경과 숫자
  for (let y = 0; y < BOARD_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const cell = board[y][x];
      const px = x * CELL_SIZE;
      const py = y * CELL_SIZE;
      
      if (cell.isEmpty) {
        // 빈 칸
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
      } else {
        // 숫자 블록
        // 배경 색상 (숫자에 따라 다른 색상)
        const hue = (cell.value - 1) * 40;
        ctx.fillStyle = `hsl(${hue}, 70%, 85%)`;
        ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
        
        // 숫자 그리기
        ctx.fillStyle = '#333';
        ctx.fillText(cell.value, px + CELL_SIZE / 2, py + CELL_SIZE / 2);
      }
    }
  }
  
  // 격자선을 한 번에 그리기 (성능 향상)
  ctx.strokeStyle = '#bbb';
  ctx.lineWidth = 1;
  ctx.beginPath();
  
  // 세로선
  for (let x = 0; x <= BOARD_WIDTH; x++) {
    ctx.moveTo(x * CELL_SIZE, 0);
    ctx.lineTo(x * CELL_SIZE, BOARD_HEIGHT * CELL_SIZE);
  }
  
  // 가로선
  for (let y = 0; y <= BOARD_HEIGHT; y++) {
    ctx.moveTo(0, y * CELL_SIZE);
    ctx.lineTo(BOARD_WIDTH * CELL_SIZE, y * CELL_SIZE);
  }
  
  ctx.stroke();
  
  // 힌트 표시 (선택 영역보다 먼저) - 유효성 검증
  if (currentHint && !isDragging) {
    // 힌트 영역이 여전히 유효한지 확인 (블록이 비어있지 않은지)
    let isValid = false;
    for (let y = currentHint.startY; y <= currentHint.endY; y++) {
      for (let x = currentHint.startX; x <= currentHint.endX; x++) {
        if (!board[y][x].isEmpty) {
          isValid = true;
          break;
        }
      }
      if (isValid) break;
    }
    
    // 유효한 힌트만 표시
    if (isValid) {
      const px = currentHint.startX * CELL_SIZE;
      const py = currentHint.startY * CELL_SIZE;
      const width = (currentHint.endX - currentHint.startX + 1) * CELL_SIZE;
      const height = (currentHint.endY - currentHint.startY + 1) * CELL_SIZE;
      
      // 파란색 반투명 박스
      ctx.fillStyle = 'rgba(33, 150, 243, 0.25)';
      ctx.fillRect(px, py, width, height);
      
      // 파란색 점선 테두리
      ctx.strokeStyle = '#2196f3';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 5]);
      ctx.strokeRect(px, py, width, height);
      ctx.setLineDash([]);  // 실선으로 복원
    } else {
      // 무효한 힌트는 제거하고 새로 찾기
      currentHint = null;
      recordActivity(); // 즉시 새 힌트 타이머 시작
    }
  }
  
  // 선택 영역 표시
  if (isDragging && startCell && currentCell) {
    const bounds = getSelectionBounds();
    if (bounds) {
      const { sum } = calculateSum(bounds);
      
      const px = bounds.startX * CELL_SIZE;
      const py = bounds.startY * CELL_SIZE;
      const width = (bounds.endX - bounds.startX + 1) * CELL_SIZE;
      const height = (bounds.endY - bounds.startY + 1) * CELL_SIZE;
      
      // 선택 영역 오버레이
      if (sum === TARGET_SUM) {
        ctx.fillStyle = 'rgba(76, 175, 80, 0.3)'; // 녹색
      } else {
        ctx.fillStyle = 'rgba(244, 67, 54, 0.3)'; // 빨간색
      }
      ctx.fillRect(px, py, width, height);
      
      // 선택 영역 테두리
      ctx.strokeStyle = sum === TARGET_SUM ? '#4caf50' : '#f44336';
      ctx.lineWidth = 3;
      ctx.strokeRect(px, py, width, height);
    }
  }
  
  // 파티클 렌더링 (맨 위에 그리기)
  renderParticles(ctx);
  profileEnd(timer);
}

// ========== 게임 루프 ==========
function gameLoop() {
  const timer = profileStart('gameLoop');
  if (gameRunning || confettiParticles.length > 0) {
    updateParticles();
    updateConfetti();
    render();
    renderConfetti(); // 별도 캔버스에 렌더링
    profileEnd(timer);
    requestAnimationFrame(gameLoop);
  } else {
    profileEnd(timer);
  }
}

// ========== 음소거 버튼 ==========
muteBtn.addEventListener('click', () => {
  const muted = audioManager.toggleMute();
  muteBtn.textContent = muted ? '🔇' : '🔊';
});

// 전체화면 지원 여부 확인
const supportsFullscreen = !!(
  document.fullscreenEnabled || 
  document.webkitFullscreenEnabled || 
  document.msFullscreenEnabled
);

// iOS 감지
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// iOS에서 전체화면 API 미지원 시 안내
if (isIOS && !supportsFullscreen) {
  fullscreenBtn.title = 'iOS: Safari에서 공유 버튼 → 홈 화면에 추가';
}

// 전체화면 토글
fullscreenBtn.addEventListener('click', () => {
  // iOS에서 지원하지 않으면 경고 표시
  if (isIOS && !supportsFullscreen) {
    alert('iOS에서는 Safari 하단의 공유 버튼(↑)을 눌러\n"홈 화면에 추가"를 선택하면 전체화면 모드로 실행됩니다.');
    return;
  }
  
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    // 전체화면 진입
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(err => {
        console.log('전체화면 실패:', err);
      });
    } else if (elem.webkitRequestFullscreen) { // Safari
      elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) { // IE11
      elem.msRequestFullscreen();
    }
  } else {
    // 전체화면 나가기
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) { // Safari
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) { // IE11
      document.msExitFullscreen();
    }
  }
});

// 전체화면 상태 변경 감지
document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
document.addEventListener('msfullscreenchange', updateFullscreenButton);

function updateFullscreenButton() {
  const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  fullscreenBtn.textContent = isFullscreen ? '⛶' : '⛶'; // 같은 아이콘 사용
  fullscreenBtn.title = isFullscreen ? '전체화면 나가기' : '전체화면';
  
  // 전체화면 변경 시 캔버스 크기 재조정
  setTimeout(() => {
    resizeCanvas();
  }, 100);
}

// ========== 시작 버튼 ==========
startGameBtn.addEventListener('click', () => {
  startModal.classList.add('hidden');
  startGame();
});

// ========== 재시작 버튼 ==========
restartBtn.addEventListener('click', () => {
  startGame();
});

restartBtnHeader.addEventListener('click', () => {
  startGame();
});

restartBtnSidebar.addEventListener('click', () => {
  startGame();
});

// ========== 디버그 기능 ==========
// 디버그 패널 토글
debugToggleBtn.addEventListener('click', () => {
  debugPanel.classList.toggle('hidden');
});

debugToggleBtnSidebar.addEventListener('click', () => {
  debugPanel.classList.toggle('hidden');
});

// 최고 점수 리셋
resetHighScoreBtn.addEventListener('click', () => {
  localStorage.removeItem('appleGameHighScore');
  highScore = 0;
  console.log('✅ 최고 점수가 리셋되었습니다.');
  alert('최고 점수가 리셋되었습니다!');
});

// 즉시 게임 종료
forceGameOverBtn.addEventListener('click', () => {
  if (gameRunning) {
    console.log('⏹️ 게임을 강제로 종료합니다.');
    endGame();
  } else {
    console.log('⚠️ 게임이 실행 중이 아닙니다.');
    alert('게임이 실행 중이 아닙니다.');
  }
});

// 컨페티 테스트
testConfettiBtn.addEventListener('click', () => {
  console.log('🎉 컨페티 테스트 시작');
  confettiParticles = []; // 기존 컨페티 제거
  startConfetti();
  
  // gameLoop이 멈춰있을 수 있으니 강제로 시작
  if (!gameRunning) {
    gameLoop();
  }
  
  console.log('현재 컨페티 개수:', confettiParticles.length);
});

// 자동 블록 제거 (10번)
autoRemoveBtn.addEventListener('click', () => {
  if (!gameRunning) {
    console.log('⚠️ 게임이 실행 중이 아닙니다.');
    alert('게임이 실행 중이 아닙니다.');
    return;
  }
  
  if (isAutoRemoving) {
    console.log('⚠️ 이미 자동 제거가 진행 중입니다.');
    return;
  }
  
  console.log('🤖 자동 제거 시작 (10번)');
  isAutoRemoving = true;
  
  let count = 0;
  const maxAttempts = 10;
  
  const autoRemoveOnce = () => {
    if (count >= maxAttempts || !gameRunning) {
      console.log(`✅ 자동 제거 완료 (${count}번 성공)`);
      isAutoRemoving = false;
      return;
    }
    
    // 힌트 로직과 동일하게 제거 대상 찾기
    const pairs = findAdjacentPairs();
    let target = null;
    
    if (pairs.length > 0) {
      target = pairs[0];
    } else {
      const combinations = findAllCombinations();
      if (combinations.length > 0) {
        target = combinations[0];
      }
    }
    
    if (!target) {
      console.log('⚠️ 더 이상 제거할 블록이 없습니다.');
      isAutoRemoving = false;
      return;
    }
    
    // 사용자처럼 선택 영역 표시 (녹색 박스)
    startCell = { x: target.startX, y: target.startY };
    currentCell = { x: target.endX, y: target.endY };
    isDragging = true;
    render(); // 녹색 선택 박스 표시
    
    // 100ms 후 실제 제거 (선택 박스를 보여주기 위한 딜레이)
    setTimeout(() => {
      const bounds = { 
        startX: target.startX, 
        startY: target.startY, 
        endX: target.endX, 
        endY: target.endY 
      };
      
      // 블록 제거 전 파티클 생성
      for (let y = bounds.startY; y <= bounds.endY; y++) {
        for (let x = bounds.startX; x <= bounds.endX; x++) {
          if (!board[y][x].isEmpty) {
            const px = x * CELL_SIZE + CELL_SIZE / 2;
            const py = y * CELL_SIZE + CELL_SIZE / 2;
            const particleCount = 3 + Math.floor(Math.random() * 3);
            createParticles(px, py, particleCount, board[y][x].value);
          }
        }
      }
      
      // 블록 제거 및 점수 증가 (사용자 제거와 동일하게)
      const { count: blockCount } = calculateSum(bounds);
      removeBlocks(bounds);
      score += blockCount;
      updateScore();
      
      // 콤보 증가 및 사운드 재생 (사용자와 동일)
      audioManager.playSuccess(combo);
      combo++;
      
      // 힌트 영역을 맞췄는지 확인 후 제거
      if (isHintMatch(bounds)) {
        currentHint = null;
      }
      
      // 성공했으므로 타이머 리셋
      recordActivity();
      
      console.log(`제거 ${count + 1}/${maxAttempts} 완료 (+${blockCount}점, 콤보: ${combo})`);
      count++;
      
      // 선택 상태 초기화
      isDragging = false;
      startCell = null;
      currentCell = null;
      render();
      
      // 모든 블록 제거 체크
      const allEmpty = board.every(row => row.every(cell => cell.isEmpty));
      if (allEmpty) {
        console.log('🎊 모든 블록이 제거되었습니다!');
        endGame();
        return;
      }
      
      // 다음 제거 (200ms 딜레이)
      setTimeout(autoRemoveOnce, 200);
    }, 100);
  };
  
  autoRemoveOnce();
});

// 프로파일링 토글
toggleProfilingBtn.addEventListener('click', () => {
  profilingEnabled = !profilingEnabled;
  toggleProfilingBtn.textContent = profilingEnabled ? '📊 프로파일링 ON' : '📊 프로파일링 OFF';
  console.log(`프로파일링: ${profilingEnabled ? 'ON' : 'OFF'}`);
  
  if (profilingEnabled) {
    // 통계 초기화
    for (const key in performanceStats) {
      performanceStats[key] = [];
    }
    console.log('성능 측정 시작... 자동 제거를 실행하거나 게임을 플레이하세요.');
  }
});

// 성능 통계 표시
showStatsBtn.addEventListener('click', () => {
  const stats = getProfilingStats();
  console.log('========== 성능 통계 (ms) ==========');
  console.table(stats);
  
  if (Object.keys(stats).length === 0) {
    alert('프로파일링 데이터가 없습니다.\n"📊 프로파일링 ON" 버튼을 눌러 측정을 시작하세요.');
  } else {
    const summary = Object.entries(stats)
      .map(([key, val]) => `${key}:\n  평균 ${val.avg}ms | 최대 ${val.max}ms | 최소 ${val.min}ms (${val.count}회)`)
      .join('\n\n');
    alert('성능 통계 (콘솔에서 자세히 확인):\n\n' + summary);
  }
});

// 세로 모드 안내 메시지 리셋
const resetOrientationWarningBtn = document.getElementById('resetOrientationWarningBtn');
if (resetOrientationWarningBtn) {
  resetOrientationWarningBtn.addEventListener('click', () => {
    localStorage.removeItem('orientationWarningDismissed');
    console.log('✅ 세로 모드 안내 메시지가 리셋되었습니다.');
    checkOrientation();
    alert('세로 모드 안내 메시지가 리셋되었습니다!\n모바일 세로 모드에서 다시 표시됩니다.');
  });
}

// ========== 윈도우 리사이즈 대응 ==========
let resizeTimeout;
window.addEventListener('resize', () => {
  // 리사이즈 이벤트가 연속으로 발생하는 것을 방지 (디바운싱)
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    resizeCanvas();
    checkOrientation();
  }, 150);
});

// ========== 화면 방향 체크 ==========
function checkOrientation() {
  const orientationWarning = document.getElementById('orientationWarning');
  if (!orientationWarning) return;
  
  const wasHidden = orientationWarning.classList.contains('hidden');
  
  // 사용자가 닫기 버튼을 눌렀는지 확인
  const dismissed = localStorage.getItem('orientationWarningDismissed');
  if (dismissed === 'true') {
    orientationWarning.classList.add('hidden');
    // 상태가 변경되었으면 캔버스 리사이즈
    if (!wasHidden) {
      resizeCanvas();
    }
    return;
  }
  
  const isPortrait = window.innerHeight > window.innerWidth;
  const isMobile = window.innerWidth <= 1024;
  
  // 모바일 세로 모드일 때만 경고 표시
  if (isMobile && isPortrait) {
    orientationWarning.classList.remove('hidden');
  } else {
    orientationWarning.classList.add('hidden');
  }
  
  // 상태가 변경되었으면 캔버스 리사이즈
  const isHidden = orientationWarning.classList.contains('hidden');
  if (wasHidden !== isHidden) {
    resizeCanvas();
  }
}

// 세로 모드 안내 닫기
const closeOrientationWarningBtn = document.getElementById('closeOrientationWarning');
if (closeOrientationWarningBtn) {
  closeOrientationWarningBtn.addEventListener('click', () => {
    const orientationWarning = document.getElementById('orientationWarning');
    orientationWarning.classList.add('hidden');
    // 사용자 선택 저장 (다시 보지 않기)
    localStorage.setItem('orientationWarningDismissed', 'true');
    // 배너가 사라지면 캔버스 크기 재계산
    resizeCanvas();
  });
}

// 초기 체크
checkOrientation();

// ========== visualViewport 리스너 추가 (모바일 브라우저 툴바 대응) ==========
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    resizeCanvas();
  });
}

// ========== 초기 렌더링 (게임은 시작 버튼 클릭 시 시작) ==========
// 시작 화면에서도 보드를 미리 보여주기 위한 초기 렌더링
initBoard();
render();

