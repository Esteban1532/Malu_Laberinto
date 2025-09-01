self.onmessage = function (e) {
  const { maze, start, player } = e.data;

  function isWalkable(c, r) {
    return (
      r >= 0 &&
      r < maze.length &&
      c >= 0 &&
      c < maze[0].length &&
      maze[r][c] === 0
    );
  }

  function key(c, r) {
    return `${c},${r}`;
  }

  function manhattan(a, b) {
    return Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
  }

  const openSet = [];
  const closedSet = new Set();
  const cameFrom = new Map();

  openSet.push({ c: start.c, r: start.r, g: 0, f: 0 });

  let steps = 0;
  const maxSteps = 500; // ✅ límite para evitar congelamiento

  while (openSet.length > 0 && steps < maxSteps) {
    steps++;
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift();
    closedSet.add(key(current.c, current.r));

    const neighbors = [
      { c: current.c + 1, r: current.r },
      { c: current.c - 1, r: current.r },
      { c: current.c, r: current.r + 1 },
      { c: current.c, r: current.r - 1 },
    ];

    for (const neighbor of neighbors) {
      if (!isWalkable(neighbor.c, neighbor.r)) continue;
      if (closedSet.has(key(neighbor.c, neighbor.r))) continue;

      const tentative_g = current.g + 1;
      const existing = openSet.find(
        (n) => n.c === neighbor.c && n.r === neighbor.r
      );

      if (!existing || tentative_g < existing.g) {
        cameFrom.set(key(neighbor.c, neighbor.r), current);

        // Heurística de huida
        const dist = manhattan(neighbor, player);
        const penalty = dist < 4 ? (10 - dist) * 8 : 0; // evita acercarse
        const f = tentative_g - dist + penalty;

        if (existing) {
          existing.g = tentative_g;
          existing.f = f;
        } else {
          openSet.push({ c: neighbor.c, r: neighbor.r, g: tentative_g, f });
        }
      }
    }
  }

  // ✅ Elegimos mejor nodo alcanzado
  let bestNode = null;
  let bestScore = -Infinity;
  const dirX = start.c - player.c;
  const dirY = start.r - player.r;

  for (const nodeKey of closedSet) {
    if (nodeKey === key(start.c, start.r)) continue; // ignorar start
    const [c, r] = nodeKey.split(",").map(Number);
    const node = { c, r };
    const dist = manhattan(node, player);

    const dot = (c - player.c) * dirX + (r - player.r) * dirY;
    const score = dist + dot * 0.3;

    if (score > bestScore) {
      bestScore = score;
      bestNode = node;
    }
  }

  // ✅ Si no hay nodo, fallback a vecinos
  if (!bestNode) {
    const neighbors = [
      { c: start.c + 1, r: start.r },
      { c: start.c - 1, r: start.r },
      { c: start.c, r: start.r + 1 },
      { c: start.c, r: start.r - 1 },
    ].filter((n) => isWalkable(n.c, n.r));

    if (neighbors.length > 0) {
      bestNode = neighbors[Math.floor(Math.random() * neighbors.length)];
    } else {
      self.postMessage([start]); // sin salida
      return;
    }
  }

  // ✅ Reconstruir camino hasta bestNode
  let path = [];
  let currentKey = key(bestNode.c, bestNode.r);
  while (currentKey !== key(start.c, start.r)) {
    const [c, r] = currentKey.split(",").map(Number);
    path.unshift({ c, r });
    const parent = cameFrom.get(currentKey);
    if (!parent) break;
    currentKey = key(parent.c, parent.r);
  }
  path.unshift(start);

  // ✅ Forzar mínimo de 2 nodos
  if (path.length < 2) {
    const neighbors = [
      { c: start.c + 1, r: start.r },
      { c: start.c - 1, r: start.r },
      { c: start.c, r: start.r + 1 },
      { c: start.c, r: start.r - 1 },
    ].filter((n) => isWalkable(n.c, n.r));

    if (neighbors.length > 0) {
      path.push(neighbors[Math.floor(Math.random() * neighbors.length)]);
    }
  }

  self.postMessage(path);
};
