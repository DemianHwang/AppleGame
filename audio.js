// 오디오 관리 클래스
class AudioManager {
  constructor() {
    this.isMuted = false;
    
    // Web Audio API를 사용한 간단한 효과음 생성
    this.audioContext = null;
    
    // BGM - 로컬 MP3 파일 사용 (public/audio/bgm.mp3)
    // Vite base URL 적용 (GitHub Pages 등 서브경로 배포 지원)
    const baseUrl = import.meta.env.BASE_URL || '/';
    this.bgm = new Audio(`${baseUrl}audio/bgm.mp3`);
    this.bgm.loop = true;
    this.bgm.volume = 0.3;
    
    // 로딩 에러 처리
    this.bgm.addEventListener('error', (e) => {
      console.error('BGM 로딩 실패:', e);
      console.log('파일 경로를 확인하세요: public/audio/bgm.mp3');
    });
    
    this.initAudioContext();
  }

  initAudioContext() {
    // 사용자 제스처 후에 AudioContext 생성
    const init = () => {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      document.removeEventListener('click', init);
      document.removeEventListener('touchstart', init);
    };
    
    document.addEventListener('click', init);
    document.addEventListener('touchstart', init);
  }

  playBGM() {
    if (this.isMuted) return;
    
    this.bgm.play().catch(err => {
      console.log('BGM 자동 재생 실패:', err);
    });
  }

  stopBGM() {
    this.bgm.pause();
    this.bgm.currentTime = 0;
  }

  // 성공 효과음 (경쾌한 벨 소리) - 콤보 레벨에 따라 음높이 증가
  playSuccess(comboLevel = 0) {
    if (this.isMuted || !this.audioContext) return;
    
    const ctx = this.audioContext;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // 콤보 레벨당 한음(2 semitones = whole step) 올림
    // 반음 = 2^(1/12), 한음 = 2^(2/12) ≈ 1.122
    // 최대 12 콤보로 제한
    const cappedCombo = Math.min(comboLevel, 12);
    const pitchMultiplier = Math.pow(2, (cappedCombo * 2) / 12);
    
    // 화음 만들기 (C, E, G) + 콤보 보정
    oscillator.frequency.setValueAtTime(523.25 * pitchMultiplier, ctx.currentTime); // C5
    oscillator.frequency.setValueAtTime(659.25 * pitchMultiplier, ctx.currentTime + 0.05); // E5
    oscillator.frequency.setValueAtTime(783.99 * pitchMultiplier, ctx.currentTime + 0.1); // G5
    
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  }

  // 실패 효과음 (짧은 버저)
  playFail() {
    if (this.isMuted || !this.audioContext) return;
    
    const ctx = this.audioContext;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.setValueAtTime(200, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);
    
    oscillator.type = 'square';
    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.1);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    
    if (this.isMuted) {
      this.bgm.volume = 0;
    } else {
      this.bgm.volume = 0.3;
      if (this.bgm.paused) {
        this.playBGM();
      }
    }
    
    return this.isMuted;
  }
}

export default AudioManager;

