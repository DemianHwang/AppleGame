import './style.css';
import AudioManager from './audio.js';

// ========== 상수 정의 ==========
const BOARD_WIDTH = 17;
const BOARD_HEIGHT = 10;
const CELL_SIZE = 50;
const TIME_LIMIT = 120;
const TARGET_SUM = 10;

// ========== 게임 상태 ==========
let board = [];
let score = 0;
let timeLeft = TIME_LIMIT;
let gameRunning = false;
let timerInterval = null;

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
    
    // 속도 (랜덤 방향으로 폭발)
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - 2;  // 위로 더 튀도록
    
    // 크기와 수명
    this.size = 3 + Math.random() * 5;
    this.life = 1.0;
    this.decay = 0.015 + Math.random() * 0.015;
    
    // 중력
    this.gravity = 0.15;
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
    ctx.save();
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.font = `${this.size * 3}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⭐', this.x, this.y);
    ctx.restore();
  }
}

// ========== Confetti 클래스 ==========
class Confetti {
  constructor(centerX, centerY) {
    // 화면 중앙에서 시작
    this.x = centerX;
    this.y = centerY;
    
    // 사방으로 폭발하는 속도 (360도 방향)
    const angle = Math.random() * Math.PI * 2;
    const speed = 5 + Math.random() * 10; // 폭발 속도
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - 3; // 약간 위쪽으로 더 튀도록
    
    this.rotation = Math.random() * 360;
    this.rotationSpeed = (Math.random() - 0.5) * 15;
    this.width = 8 + Math.random() * 12;
    this.height = 6 + Math.random() * 10;
    
    // 무지개 색상
    const colors = [
      '#FF6B6B', // 빨강
      '#FFA500', // 주황
      '#FFD93D', // 노랑
      '#6BCF7F', // 초록
      '#4D96FF', // 파랑
      '#9B59B6', // 보라
      '#FF69B4'  // 핑크
    ];
    this.color = colors[Math.floor(Math.random() * colors.length)];
    
    this.life = 1.0;
    this.decay = 0.006 + Math.random() * 0.006; // 조금 더 오래 지속
    this.gravity = 0.15; // 중력
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
    ctx.fillStyle = this.color;
    ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
    ctx.restore();
  }
}

// ========== DOM 요소 ==========
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const confettiCanvas = document.getElementById('confettiCanvas');
const confettiCtx = confettiCanvas.getContext('2d');

// 컨페티 캔버스 크기를 전체 화면으로 설정
confettiCanvas.width = window.innerWidth;
confettiCanvas.height = window.innerHeight;

const scoreDisplay = document.getElementById('score');
const timerDisplay = document.getElementById('timer');
const sumDisplay = document.getElementById('sumDisplay');
const muteBtn = document.getElementById('muteBtn');
const restartBtnHeader = document.getElementById('restartBtnHeader');
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
  
  // 최고 점수 로드
  highScore = loadHighScore();
  
  // 컨페티 초기화
  confettiParticles = [];
  
  updateScore();
  updateTimer();
  
  gameOverModal.classList.add('hidden');
  
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
    
    // 컨페티 효과 시작
    startConfetti();
    // 컨페티를 위해 gameLoop 재시작
    gameLoop();
  }
  
  // UI 업데이트
  finalScoreDisplay.textContent = score;
  highScoreDisplay.textContent = highScore;
  
  if (isNewRecord) {
    newRecordLabel.classList.remove('hidden');
  } else {
    newRecordLabel.classList.add('hidden');
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
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  const x = Math.floor(mouseX / CELL_SIZE);
  const y = Math.floor(mouseY / CELL_SIZE);
  
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
  particles.forEach(p => p.draw(ctx));
}

// 컨페티 시작
function startConfetti() {
  console.log('🎉 컨페티 시작! 80개 생성');
  // 화면 중앙 좌표 계산
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  
  for (let i = 0; i < 80; i++) {
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
  
  return pairs;
}

// 모든 가능한 조합 찾기 (크기순)
function findAllCombinations() {
  const combinations = [];
  
  // 모든 직사각형 영역 탐색
  for (let sy = 0; sy < BOARD_HEIGHT; sy++) {
    for (let sx = 0; sx < BOARD_WIDTH; sx++) {
      for (let ey = sy; ey < BOARD_HEIGHT; ey++) {
        for (let ex = sx; ex < BOARD_WIDTH; ex++) {
          const bounds = { startX: sx, startY: sy, endX: ex, endY: ey };
          const { sum, count } = calculateSum(bounds);
          
          if (sum === TARGET_SUM && count >= 2) {
            const size = (ex - sx + 1) * (ey - sy + 1);
            combinations.push({ ...bounds, count, size });
          }
        }
      }
    }
  }
  
  // 크기순 정렬 (작은 것부터 = 쉬운 것부터)
  return combinations.sort((a, b) => a.size - b.size);
}

// 힌트 찾기 및 표시
function findAndShowHint() {
  if (!gameRunning) return;
  
  // 1순위: 인접 2개 (최우선)
  const pairs = findAdjacentPairs();
  if (pairs.length > 0) {
    currentHint = pairs[0];
    render();
    return;
  }
  
  // 2/3순위: 작은 영역부터
  const combinations = findAllCombinations();
  if (combinations.length > 0) {
    currentHint = combinations[0];
    render();
    return;
  }
  
  // 힌트 없음
  currentHint = null;
  console.log('힌트를 찾을 수 없습니다.');
}

// 활동 기록 (힌트 타이머 관리)
function recordActivity() {
  // 힌트가 표시 중이면 타이머 작동 안 함
  if (currentHint) {
    return;
  }
  
  // 힌트 없을 때만 타이머 리셋
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
    audioManager.playSuccess();
    
    // 힌트 영역을 맞췄는지 확인 후 제거
    if (isHintMatch(bounds)) {
      currentHint = null;
    }
    
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

// ========== 렌더링 ==========
function render() {
  // 배경 클리어
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // 보드 그리기
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
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cell.value, px + CELL_SIZE / 2, py + CELL_SIZE / 2);
      }
      
      // 격자선
      ctx.strokeStyle = '#bbb';
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);
    }
  }
  
  // 힌트 표시 (선택 영역보다 먼저)
  if (currentHint && !isDragging) {
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
}

// ========== 게임 루프 ==========
function gameLoop() {
  if (gameRunning || confettiParticles.length > 0) {
    updateParticles();
    updateConfetti();
    render();
    renderConfetti(); // 별도 캔버스에 렌더링
    requestAnimationFrame(gameLoop);
  }
}

// ========== 음소거 버튼 ==========
muteBtn.addEventListener('click', () => {
  const muted = audioManager.toggleMute();
  muteBtn.textContent = muted ? '🔇' : '🔊';
});

// ========== 재시작 버튼 ==========
restartBtn.addEventListener('click', () => {
  startGame();
});

restartBtnHeader.addEventListener('click', () => {
  startGame();
});

// ========== 디버그 기능 ==========
// 디버그 패널 토글
debugToggleBtn.addEventListener('click', () => {
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
  alert('컨페티 테스트! 콘솔을 확인하세요.');
});

// ========== 윈도우 리사이즈 대응 ==========
window.addEventListener('resize', () => {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
});

// ========== 게임 시작 ==========
startGame();

