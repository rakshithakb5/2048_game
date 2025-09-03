(() => {
  const SIZE = 4;
  const boardEl = document.getElementById('board');
  const scoreEl = document.getElementById('score');
  const bestEl  = document.getElementById('best');
  const newBtn  = document.getElementById('newGame');
  const undoBtn = document.getElementById('undoBtn');
  const tpl     = document.getElementById('tileTemplate');

  const overlay      = document.getElementById('overlay');
  const titleEl      = document.getElementById('overlayTitle');
  const subtitleEl   = document.getElementById('overlaySubtitle');
  const continueBtn  = document.getElementById('continueBtn');
  const restartBtn   = document.getElementById('restartBtn');
  const stars        = document.getElementById('stars');
  const badge        = document.getElementById('badge');

  let board, score;
  let history = [];              // ← stack of {board, score}
  const HISTORY_LIMIT = 50;

  // ===== Utils for Undo =====
  const deepCopy = m => m.map(r => r.slice());
  const snapshot = () => ({ board: deepCopy(board), score });
  const pushHistory = () => {
    history.push(snapshot());
    if (history.length > HISTORY_LIMIT) history.shift();
    setUndoState();
  };
  const setUndoState = () => { undoBtn.disabled = history.length === 0; };

  function undo() {
    if (!history.length) return;
    const prev = history.pop();
    board = prev.board;
    score = prev.score;
    render(false);
    hideOverlay();
    setUndoState();
  }

  // ===== Init =====
  function init() {
    // draw 16 background cells
    boardEl.innerHTML = '';
    for (let i = 0; i < SIZE * SIZE; i++) {
      const c = document.createElement('div');
      c.className = 'cell';
      boardEl.appendChild(c);
    }
    // reset state
    board = Array.from({length: SIZE}, () => Array(SIZE).fill(0));
    score = 0;
    history = [];                // clear undo stack
    setUndoState();

    loadBest();
    addRandomTile(); addRandomTile();
    render(true);
    hideOverlay();
  }

  function loadBest(){ bestEl.textContent = localStorage.getItem('best2048') || 0 }
  function saveBest(){ const b = +bestEl.textContent || 0; if (score > b) { localStorage.setItem('best2048', score); bestEl.textContent = score; } }

  function empties(){
    const out=[];
    for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) if(board[r][c]===0) out.push([r,c]);
    return out;
  }

  function addRandomTile(){
    const e=empties(); if(!e.length) return false;
    const [r,c] = e[Math.floor(Math.random()*e.length)];
    board[r][c] = Math.random() < 0.9 ? 2 : 4;
    return true;
  }

  function render(isNew=false, mergedSet=new Set()){
    // wipe dynamic tiles and rebuild
    [...boardEl.querySelectorAll('.tile')].forEach(n=>n.remove());
    for(let r=0;r<SIZE;r++){
      for(let c=0;c<SIZE;c++){
        const v = board[r][c];
        if(!v) continue;
        const t = tpl.content.firstElementChild.cloneNode(true);
        t.firstElementChild.textContent = v;
        t.classList.add('t'+v);
        if(isNew && mergedSet.size===0) t.classList.add('new');
        if(mergedSet.has(`${r},${c}`)) t.classList.add('merge');
        // place into grid slot
        t.style.gridColumn = (c+1);
        t.style.gridRow    = (r+1);
        boardEl.appendChild(t);
      }
    }
    scoreEl.textContent = score;
    saveBest();
  }

  // ===== Movement helpers =====
  function slide(row){
    const nz = row.filter(v=>v!==0);
    const zeros = Array(SIZE - nz.length).fill(0);
    return nz.concat(zeros);
  }

  function mergeRowLeft(row){
    let flags = Array(SIZE).fill(0);
    row = slide(row);
    for(let i=0;i<SIZE-1;i++){
      if(row[i]!==0 && row[i]===row[i+1]){
        row[i] *= 2; score += row[i];
        row[i+1] = 0; flags[i] = 1; i++;
      }
    }
    row = slide(row);
    const mergedIndices = new Set(flags.map((f,i)=>f?i:null).filter(x=>x!==null));
    return { row, mergedIndices };
  }

  const rotCW  = m => m[0].map((_, c) => m.map(row => row[c]).reverse());
  const rotCCW = m => rotCW(rotCW(rotCW(m)));

  function move(dir){
    const before = JSON.stringify(board);
    let work = board.map(r => r.slice());
    let mergedPerRow = [];

    if(dir==='right') work = work.map(r=>r.reverse());
    if(dir==='up')    work = rotCW(work);
    if(dir==='down')  work = rotCCW(work);

    for(let r=0;r<SIZE;r++){
      const { row, mergedIndices } = mergeRowLeft(work[r]);
      work[r] = row; mergedPerRow[r] = mergedIndices;
    }

    // map merged cells back to absolute for pulse animation
    let mergedAbs = new Set();
    if(dir==='left'){
      for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) if(mergedPerRow[r].has(c)) mergedAbs.add(`${r},${c}`);
    } else if(dir==='right'){
      work = work.map(r=>r.reverse());
      for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) if(mergedPerRow[r].has(SIZE-1-c)) mergedAbs.add(`${r},${c}`);
    } else if(dir==='up'){
      work = rotCCW(work);
      for(let r=0;r<SIZE;r++) for(let i=0;i<SIZE;i++) if(mergedPerRow[r].has(i)){
        const or = SIZE-1 - i, oc = r; mergedAbs.add(`${or},${oc}`);
      }
    } else if(dir==='down'){
      work = rotCW(work);
      for(let r=0;r<SIZE;r++) for(let i=0;i<SIZE;i++) if(mergedPerRow[r].has(i)){
        const or = i, oc = SIZE-1 - r; mergedAbs.add(`${or},${oc}`);
      }
    }

    const after = JSON.stringify(work);
    if(before !== after){
      // only store history for a *real* move
      pushHistory();
      board = work;
      addRandomTile();
      render(false, mergedAbs);
      checkEnd();
    }
  }

  function hasMoves(){
    if(empties().length) return true;
    for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
      const v = board[r][c];
      if((c+1<SIZE && board[r][c+1]===v) || (r+1<SIZE && board[r+1][c]===v)) return true;
    }
    return false;
  }

  // ===== Overlay / End conditions =====
  function showOverlay({ kind, isNewBest }) {
    overlay.classList.remove('hidden');

    if (kind === 'win') {
      titleEl.textContent = 'You reached 2048!';
      subtitleEl.textContent = 'Legend. Keep going or start fresh.';
      continueBtn.classList.remove('hidden');   // only on WIN
      stars.classList.remove('hidden');
      badge.classList.remove('hidden');
    } else {
      titleEl.textContent = isNewBest ? 'New High Score!' : 'Game Over';
      subtitleEl.textContent = isNewBest
        ? 'You set a new personal best. Fantastic run!'
        : 'No more moves. Try again and chase a new best.';
      continueBtn.classList.add('hidden');      // never on LOSE
      stars.classList.toggle('hidden', !isNewBest);
      badge.classList.toggle('hidden', !isNewBest);
    }
  }

  function hideOverlay(){ overlay.classList.add('hidden'); }

  function checkEnd(){
    // Win?
    for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
      if(board[r][c] === 2048){
        showOverlay({ kind: 'win', isNewBest: false });
        return;
      }
    }
    // No moves => lose
    if(!hasMoves()){
      const prevBest = +localStorage.getItem('best2048') || 0;
      const isNewBest = score > prevBest;
      if (isNewBest) {
        localStorage.setItem('best2048', score);
        bestEl.textContent = score;
      }
      showOverlay({ kind: 'lose', isNewBest });
    }
  }

  // ===== Controls =====
  newBtn.addEventListener('click', init);
  restartBtn.addEventListener('click', init);
  continueBtn.addEventListener('click', () => hideOverlay());
  undoBtn.addEventListener('click', undo);

  window.addEventListener('keydown', e => {
    // Undo: Ctrl+Z / Cmd+Z / U
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return undo(); }
    if (e.key === 'u' || e.key === 'U') { e.preventDefault(); return undo(); }

    const k = e.key;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(k)) e.preventDefault();
    if(k==='ArrowLeft') move('left');
    if(k==='ArrowRight') move('right');
    if(k==='ArrowUp') move('up');
    if(k==='ArrowDown') move('down');
  });

  // WASD with focus on board
  boardEl.addEventListener('keydown', e => {
    if(e.key==='a' || e.key==='A') move('left');
    if(e.key==='d' || e.key==='D') move('right');
    if(e.key==='w' || e.key==='W') move('up');
    if(e.key==='s' || e.key==='S') move('down');
  });

  // Touch swipe
  let sx=0, sy=0;
  boardEl.addEventListener('touchstart', e => {
    const t = e.changedTouches[0]; sx=t.clientX; sy=t.clientY;
  }, {passive:true});
  boardEl.addEventListener('touchend', e => {
    const t=e.changedTouches[0]; const dx=t.clientX-sx, dy=t.clientY-sy;
    const ax=Math.abs(dx), ay=Math.abs(dy); if(Math.max(ax,ay)<20) return;
    if(ax>ay) move(dx>0?'right':'left'); else move(dy>0?'down':'up');
  });

  // boot
  init();
})();
