onmessage = (e) => {
  const { maze, lives } = e.data;

  if (lives <= 0) {
    postMessage({ type: "gameover" });
    return;
  }

  let safeCells = [];

  for (let r = 0; r < maze.length; r++) {
    for (let c = 0; c < maze[r].length; c++) {
      if (maze[r][c] === 0) {
        // ✅ corregido: incluir {c, r}
        safeCells.push({ c, r });
      }
    }
  }

  if (safeCells.length === 0) {
    postMessage({ type: "gameover" });
    return;
  }

  const choice = safeCells[Math.floor(Math.random() * safeCells.length)];

  postMessage({
    type: "respawn",
    c: choice.c,
    r: choice.r,
    remainingLives: lives,
  });
};
