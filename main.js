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

// ========== DOM 요소 ==========
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const timerDisplay = document.getElementById('timer');
const sumDisplay = document.getElementById('sumDisplay');
const muteBtn = document.getElementById('muteBtn');
const gameOverModal = document.getElementById('gameOverModal');
const finalScoreDisplay = document.getElementById('finalScore');
const restartBtn = document.getElementById('restartBtn');

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
  
  updateScore();
  updateTimer();
  
  gameOverModal.classList.add('hidden');
  
  // BGM 재생
  audioManager.playBGM();
  
  // 타이머 시작
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimer();
    
    if (timeLeft <= 0) {
      endGame();
    }
  }, 1000);
  
  render();
}

// ========== 게임 종료 ==========
function endGame() {
  gameRunning = false;
  clearInterval(timerInterval);
  audioManager.stopBGM();
  
  finalScoreDisplay.textContent = score;
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
    // 성공: 블록 제거 및 점수 추가
    removeBlocks(bounds);
    score += count;
    updateScore();
    audioManager.playSuccess();
    
    // 모든 블록 제거 체크
    const allEmpty = board.every(row => row.every(cell => cell.isEmpty));
    if (allEmpty) {
      endGame();
    }
  } else if (count > 0) {
    // 실패: 효과음만
    audioManager.playFail();
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

// ========== 게임 시작 ==========
startGame();

